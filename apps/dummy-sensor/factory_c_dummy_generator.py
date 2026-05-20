#!/usr/bin/env python3
"""Generate factory-c dummy AEGIS canonical JSON into a local outbox."""

from __future__ import annotations

import argparse
import json
import os
import random
import socket
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from k8s_state import KubernetesStateReader, build_node_payloads, build_workload_payloads


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def format_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None:
        return default
    return float(value)


def env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    return int(value)


class FactoryCDummyGenerator:
    def __init__(self, rng: random.Random | None = None) -> None:
        self.rng = rng or random.Random()
        self.factory_id = os.getenv("AEGIS_FACTORY_ID", "factory-c")
        self.environment_type = os.getenv("AEGIS_ENVIRONMENT_TYPE", "vm-windows")
        self.input_module_type = os.getenv("AEGIS_INPUT_MODULE_TYPE", "dummy")
        self.worker_node_id = os.getenv("AEGIS_WORKER_NODE_ID", "factory-c-worker")
        self.master_node_id = os.getenv("AEGIS_MASTER_NODE_ID", "factory-c-master")
        self.kubernetes_version = os.getenv("AEGIS_K3S_VERSION", "unknown")
        self.data_plane_instance_id = os.getenv(
            "AEGIS_DATA_PLANE_INSTANCE_ID",
            f"factory-c-dummy-generator-{socket.gethostname()}",
        )
        self.window_seconds = env_int("AEGIS_FACTORY_STATE_WINDOW_SECONDS", 3)
        self.factory_state_interval_seconds = env_int("AEGIS_FACTORY_STATE_INTERVAL_SECONDS", 3)
        self.infra_state_interval_seconds = env_int("AEGIS_INFRA_STATE_INTERVAL_SECONDS", 20)
        self.sequence_file = Path(os.getenv("AEGIS_SEQUENCE_FILE", "/var/lib/aegis/factory-c-publish-sequence"))
        self.k8s = KubernetesStateReader(timeout_seconds=env_float("AEGIS_K8S_TIMEOUT_SECONDS", 5.0))

        self.temperature_baseline = env_float("AEGIS_DUMMY_TEMPERATURE_BASELINE", 27.0)
        self.temperature_jitter = env_float("AEGIS_DUMMY_TEMPERATURE_JITTER", 4.0)
        self.humidity_baseline = env_float("AEGIS_DUMMY_HUMIDITY_BASELINE", 52.0)
        self.humidity_jitter = env_float("AEGIS_DUMMY_HUMIDITY_JITTER", 10.0)
        self.pressure_baseline = env_float("AEGIS_DUMMY_PRESSURE_BASELINE", 1012.0)
        self.pressure_jitter = env_float("AEGIS_DUMMY_PRESSURE_JITTER", 2.0)
        self.anomaly_probability = env_float("AEGIS_DUMMY_ANOMALY_PROBABILITY", 0.06)

    def factory_state(self) -> dict[str, Any]:
        source_timestamp = utc_now()
        timestamp = format_utc(source_timestamp)
        anomaly = self.rng.random() < self.anomaly_probability
        fire_score = self._anomaly_score() if anomaly else 0.0
        fall_score = self._anomaly_score() if anomaly else 0.0
        bend_score = self._anomaly_score() if anomaly else 0.0

        return self._message(
            message_id=f"{self.factory_id}:factory_state:{self.worker_node_id}:{timestamp}",
            node_id=self.worker_node_id,
            source_type="factory_state",
            source_timestamp=source_timestamp,
            payload={
                "aggregation_window_seconds": self.window_seconds,
                "sensor": {
                    "sample_count": 1,
                    "temperature_celsius_avg": self._jitter(self.temperature_baseline, self.temperature_jitter),
                    "humidity_percent_avg": self._jitter(self.humidity_baseline, self.humidity_jitter),
                    "pressure_hpa_avg": self._jitter(self.pressure_baseline, self.pressure_jitter),
                },
                "ai_result": {
                    "sample_count": 1,
                    "fire_score": fire_score,
                    "fall_score": fall_score,
                    "bend_score": bend_score,
                    "abnormal_sound": "intermittent vibration" if anomaly else "none",
                },
            },
        )

    def infra_state(self) -> dict[str, Any]:
        source_timestamp = utc_now()
        timestamp = format_utc(source_timestamp)
        sequence = self._next_sequence()
        nodes, workloads, source = self._cluster_state()
        ready_nodes = sum(1 for item in nodes if item["ready"])
        running_workloads = sum(1 for item in workloads if item["status"] == "Running" and item["ready"])

        return self._message(
            message_id=f"{self.factory_id}:infra_state:cluster:{timestamp}",
            node_id="cluster",
            source_type="infra_state",
            source_timestamp=source_timestamp,
            payload={
                "heartbeat": {
                    "agent_status": "alive",
                    "last_spool_write_status": "unknown",
                    "last_spool_write_at": None,
                    "publish_sequence": sequence,
                    "kubernetes_version": self.kubernetes_version,
                    "cluster_state_source": source,
                },
                "node_summary": {
                    "total": len(nodes),
                    "ready": ready_nodes,
                    "not_ready": max(len(nodes) - ready_nodes, 0),
                },
                "nodes": nodes,
                "workload_summary": {
                    "total": len(workloads),
                    "running": running_workloads,
                    "not_running": max(len(workloads) - running_workloads, 0),
                },
                "workloads": workloads,
                "devices": {
                    "bme280": {"available": False, "last_seen_at": None},
                    "camera": {"available": False, "last_seen_at": None},
                    "microphone": {"available": False, "last_seen_at": None},
                },
            },
        )

    def write_outbox(self, message: dict[str, Any], outbox_dir: Path) -> Path:
        outbox_dir.mkdir(parents=True, exist_ok=True)
        tmp_dir = outbox_dir / "tmp"
        tmp_dir.mkdir(parents=True, exist_ok=True)
        target = outbox_dir / f"{message['message_id']}.json"
        if target.exists():
            return target

        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=tmp_dir,
            prefix=f"{message['message_id']}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            json.dump(message, handle, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
            tmp_path = Path(handle.name)

        tmp_path.replace(target)
        target.chmod(0o640)
        return target

    def run_loop(self, outbox_dir: Path) -> None:
        next_factory_state = 0.0
        next_infra_state = 0.0

        while True:
            now = time.monotonic()
            sleep_until: list[float] = []

            if now >= next_factory_state:
                self._write_one("factory_state", outbox_dir)
                next_factory_state = now + self.factory_state_interval_seconds
            sleep_until.append(next_factory_state)

            if now >= next_infra_state:
                self._write_one("infra_state", outbox_dir)
                next_infra_state = now + self.infra_state_interval_seconds
            sleep_until.append(next_infra_state)

            time.sleep(max(min(sleep_until) - time.monotonic(), 0.1))

    def _write_one(self, source_type: str, outbox_dir: Path) -> None:
        try:
            message = self.factory_state() if source_type == "factory_state" else self.infra_state()
            path = self.write_outbox(message, outbox_dir)
            print(f"wrote {path}", flush=True)
        except Exception as exc:
            print(f"failed to write {source_type}: {exc}", file=sys.stderr, flush=True)

    def _message(
        self,
        *,
        message_id: str,
        node_id: str,
        source_type: str,
        source_timestamp: datetime,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "schema_version": "0.1.0",
            "message_id": message_id,
            "factory_id": self.factory_id,
            "node_id": node_id,
            "environment_type": self.environment_type,
            "input_module_type": self.input_module_type,
            "source_type": source_type,
            "source_timestamp": format_utc(source_timestamp),
            "published_at": format_utc(utc_now()),
            "data_plane_instance_id": self.data_plane_instance_id,
            "payload": payload,
        }

    def _jitter(self, baseline: float, jitter: float) -> float:
        return round(baseline + self.rng.uniform(-jitter, jitter), 2)

    def _anomaly_score(self) -> float:
        return round(self.rng.uniform(0.55, 0.98), 4)

    def _node(self, node_id: str, role: str, cpu: float, memory: float, disk: float) -> dict[str, Any]:
        return {
            "node_id": node_id,
            "role": role,
            "ready": True,
            "cpu_usage_percent": self._jitter(cpu, 3.0),
            "memory_usage_percent": self._jitter(memory, 5.0),
            "disk_usage_percent": self._jitter(disk, 2.0),
            "network_reachability": "ok",
        }

    def _workload(self, namespace: str, name: str, node_id: str) -> dict[str, Any]:
        return {
            "namespace": namespace,
            "name": name,
            "status": "Running",
            "ready": True,
            "restart_count": 0,
            "node_id": node_id,
        }

    def _cluster_state(self) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str]:
        if os.getenv("AEGIS_CLUSTER_STATE_MODE", "auto") != "synthetic":
            try:
                nodes = build_node_payloads(
                    self.k8s.nodes(),
                    role_overrides={
                        self.master_node_id: "control-plane",
                        self.worker_node_id: "worker",
                    },
                )
                workloads = build_workload_payloads(self.k8s)
                if nodes:
                    return nodes, workloads, "kubernetes"
            except Exception as exc:
                print(f"falling back to synthetic cluster state: {exc}", file=sys.stderr, flush=True)
        return [
            self._node(self.master_node_id, "control-plane", 8.0, 30.0, 22.0),
            self._node(self.worker_node_id, "worker", 12.0, 38.0, 27.0),
        ], [
            self._workload("ai-apps", "dummy-data-generator", self.worker_node_id),
            self._workload("ai-apps", "edge-iot-publisher", self.worker_node_id),
        ], "synthetic"

    def _next_sequence(self) -> int:
        try:
            current = int(self.sequence_file.read_text(encoding="utf-8").strip())
        except (OSError, ValueError):
            current = 0
        current += 1
        try:
            self.sequence_file.parent.mkdir(parents=True, exist_ok=True)
            self.sequence_file.write_text(f"{current}\n", encoding="utf-8")
        except OSError:
            pass
        return current


def build_messages(generator: FactoryCDummyGenerator, mode: str) -> list[dict[str, Any]]:
    if mode == "factory_state":
        return [generator.factory_state()]
    if mode == "infra_state":
        return [generator.infra_state()]
    return [generator.factory_state(), generator.infra_state()]


def main() -> int:
    parser = argparse.ArgumentParser(description="Create factory-c dummy AEGIS canonical JSON files.")
    parser.add_argument("--once", choices=("factory_state", "infra_state", "all"), default="all")
    parser.add_argument("--loop", action="store_true", help="Continuously write factory_state and infra_state files.")
    parser.add_argument("--outbox-dir", default=os.getenv("AEGIS_OUTBOX_DIR", "/var/lib/aegis/outbox"))
    parser.add_argument("--no-write", action="store_true", help="Print JSON without writing outbox files.")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON to stdout.")
    args = parser.parse_args()

    generator = FactoryCDummyGenerator()
    outbox_dir = Path(args.outbox_dir)

    if args.loop:
        if args.no_write:
            parser.error("--loop cannot be used with --no-write")
        generator.run_loop(outbox_dir)
        return 0

    for message in build_messages(generator, args.once):
        if args.no_write:
            print(json.dumps(message, ensure_ascii=False, indent=2 if args.pretty else None, sort_keys=True))
            continue
        path = generator.write_outbox(message, outbox_dir)
        print(f"wrote {path}", flush=True)

    return 0


if __name__ == "__main__":
    sys.exit(main())
