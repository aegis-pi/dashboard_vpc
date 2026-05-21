#!/usr/bin/env python3
"""Generate factory-b dummy AEGIS canonical JSON into a local outbox."""

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


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def format_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    return default if value is None else float(value)


def env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    return default if value is None else int(value)


class FactoryBDummyGenerator:
    def __init__(self, rng: random.Random | None = None) -> None:
        self.rng = rng or random.Random()
        self.factory_id = os.getenv("AEGIS_FACTORY_ID", "factory-b")
        self.environment_type = os.getenv("AEGIS_ENVIRONMENT_TYPE", "vm-mac")
        self.input_module_type = os.getenv("AEGIS_INPUT_MODULE_TYPE", "dummy")
        self.node_id = os.getenv("AEGIS_NODE_ID", "factory-b")
        self.data_plane_instance_id = os.getenv(
            "AEGIS_DATA_PLANE_INSTANCE_ID",
            f"factory-b-dummy-generator-{socket.gethostname()}",
        )
        self.window_seconds = env_int("AEGIS_FACTORY_STATE_WINDOW_SECONDS", 3)
        self.factory_state_interval_seconds = env_int("AEGIS_FACTORY_STATE_INTERVAL_SECONDS", 3)
        self.infra_state_interval_seconds = env_int("AEGIS_INFRA_STATE_INTERVAL_SECONDS", 20)

        self.temperature_baseline = env_float("AEGIS_DUMMY_TEMPERATURE_BASELINE", 24.5)
        self.temperature_jitter = env_float("AEGIS_DUMMY_TEMPERATURE_JITTER", 3.0)
        self.humidity_baseline = env_float("AEGIS_DUMMY_HUMIDITY_BASELINE", 45.0)
        self.humidity_jitter = env_float("AEGIS_DUMMY_HUMIDITY_JITTER", 8.0)
        self.pressure_baseline = env_float("AEGIS_DUMMY_PRESSURE_BASELINE", 1013.5)
        self.pressure_jitter = env_float("AEGIS_DUMMY_PRESSURE_JITTER", 1.5)
        self.anomaly_probability = env_float("AEGIS_DUMMY_ANOMALY_PROBABILITY", 0.03)

    def factory_state(self) -> dict[str, Any]:
        source_timestamp = utc_now()
        timestamp = format_utc(source_timestamp)
        anomaly = self.rng.random() < self.anomaly_probability

        return self._message(
            message_id=f"{self.factory_id}:factory_state:{self.node_id}:{timestamp}",
            node_id=self.node_id,
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
                    "fire_score": self._anomaly_score() if anomaly else 0.0,
                    "fall_score": self._anomaly_score() if anomaly else 0.0,
                    "bend_score": self._anomaly_score() if anomaly else 0.0,
                    "abnormal_sound": "brief lab impact" if anomaly else "none",
                },
            },
        )

    def infra_state(self) -> dict[str, Any]:
        source_timestamp = utc_now()
        timestamp = format_utc(source_timestamp)
        nodes, workloads = self._cluster_state()
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
                    "last_spool_write_at": None,
                    "last_spool_write_status": "unknown",
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
            print(f"wrote {self.write_outbox(message, outbox_dir)}", flush=True)
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
        return round(self.rng.uniform(0.35, 0.75), 4)

    def _node(self, node_id: str) -> dict[str, Any]:
        return {
            "node_id": node_id,
            "role": "single-node",
            "ready": True,
            "cpu_usage_percent": self._jitter(7.0, 2.0),
            "memory_usage_percent": self._jitter(32.0, 4.0),
            "disk_usage_percent": self._jitter(24.0, 2.0),
            "network_reachability": "unknown",
        }

    def _workload(self, namespace: str, name: str) -> dict[str, Any]:
        return {
            "namespace": namespace,
            "name": name,
            "status": "Running",
            "ready": True,
            "restart_count": 0,
            "node_id": self.node_id,
        }

    def _cluster_state(self) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        return [self._node(self.node_id)], [
            self._workload("ai-apps", "dummy-data-generator"),
            self._workload("ai-apps", "edge-iot-publisher"),
        ]


def build_messages(generator: FactoryBDummyGenerator, mode: str) -> list[dict[str, Any]]:
    if mode == "factory_state":
        return [generator.factory_state()]
    if mode == "infra_state":
        return [generator.infra_state()]
    return [generator.factory_state(), generator.infra_state()]


def main() -> int:
    parser = argparse.ArgumentParser(description="Create factory-b dummy AEGIS canonical JSON files.")
    parser.add_argument("--once", choices=("factory_state", "infra_state", "all"), default="all")
    parser.add_argument("--loop", action="store_true", help="Continuously write factory_state and infra_state files.")
    parser.add_argument("--outbox-dir", default=os.getenv("AEGIS_OUTBOX_DIR", "/var/lib/aegis/outbox"))
    parser.add_argument("--no-write", action="store_true", help="Print JSON without writing outbox files.")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON to stdout.")
    args = parser.parse_args()

    generator = FactoryBDummyGenerator()
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
        print(f"wrote {generator.write_outbox(message, outbox_dir)}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
