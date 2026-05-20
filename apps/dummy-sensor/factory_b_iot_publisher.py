#!/usr/bin/env python3
"""Publish factory-b dummy outbox JSON files to AWS IoT Core."""

from __future__ import annotations

import argparse
import json
import os
import socket
import ssl
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


VALID_SOURCE_TYPES = {"factory_state", "infra_state"}
REQUIRED_FIELDS = {
    "schema_version",
    "message_id",
    "factory_id",
    "node_id",
    "environment_type",
    "input_module_type",
    "source_type",
    "source_timestamp",
    "published_at",
    "data_plane_instance_id",
    "payload",
}


def format_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def mqtt_remaining_length(length: int) -> bytes:
    encoded = bytearray()
    while True:
        digit = length % 128
        length //= 128
        if length > 0:
            digit |= 0x80
        encoded.append(digit)
        if length == 0:
            return bytes(encoded)


def mqtt_string(value: str) -> bytes:
    payload = value.encode("utf-8")
    if len(payload) > 65535:
        raise ValueError("MQTT string exceeds 65535 bytes")
    return len(payload).to_bytes(2, "big") + payload


def mqtt_connect_packet(client_id: str, keepalive_seconds: int = 60) -> bytes:
    variable_header = mqtt_string("MQTT") + bytes([4, 2]) + keepalive_seconds.to_bytes(2, "big")
    payload = mqtt_string(client_id)
    return bytes([0x10]) + mqtt_remaining_length(len(variable_header) + len(payload)) + variable_header + payload


def mqtt_publish_packet(topic: str, payload: bytes) -> bytes:
    variable_header = mqtt_string(topic)
    return bytes([0x30]) + mqtt_remaining_length(len(variable_header) + len(payload)) + variable_header + payload


class MqttClient:
    def __init__(self, *, endpoint: str, port: int, client_id: str, ca_file: str, cert_file: str, key_file: str, timeout_seconds: float = 10.0) -> None:
        self.endpoint = endpoint
        self.port = port
        self.client_id = client_id
        self.ca_file = ca_file
        self.cert_file = cert_file
        self.key_file = key_file
        self.timeout_seconds = timeout_seconds

    def publish(self, topic: str, payload: bytes) -> None:
        context = ssl.create_default_context(cafile=self.ca_file)
        context.load_cert_chain(certfile=self.cert_file, keyfile=self.key_file)
        with socket.create_connection((self.endpoint, self.port), timeout=self.timeout_seconds) as raw_socket:
            with context.wrap_socket(raw_socket, server_hostname=self.endpoint) as tls_socket:
                tls_socket.settimeout(self.timeout_seconds)
                tls_socket.sendall(mqtt_connect_packet(self.client_id))
                connack = tls_socket.recv(4)
                if len(connack) != 4 or connack[:3] != b"\x20\x02\x00" or connack[3] != 0:
                    raise RuntimeError(f"MQTT CONNACK rejected: {connack.hex()}")
                tls_socket.sendall(mqtt_publish_packet(topic, payload))
                tls_socket.sendall(b"\xe0\x00")


class FactoryBIotPublisher:
    def __init__(self, mqtt_client: Any | None = None) -> None:
        self.outbox_dir = Path(os.getenv("AEGIS_OUTBOX_DIR", "/var/lib/aegis/outbox"))
        self.data_plane_instance_id = os.getenv("AEGIS_DATA_PLANE_INSTANCE_ID", f"factory-b-dummy-publisher-{socket.gethostname()}")
        self.backoff_seconds = float(os.getenv("AEGIS_PUBLISHER_BACKOFF_SECONDS", "5"))
        self.max_backoff_seconds = float(os.getenv("AEGIS_PUBLISHER_MAX_BACKOFF_SECONDS", "60"))
        self.mqtt_client = mqtt_client or self._build_mqtt_client()

    def _build_mqtt_client(self) -> MqttClient:
        iot_dir = Path(os.getenv("AEGIS_IOT_DIR", "/etc/aegis/iot/factory-b"))
        endpoint = (os.getenv("AEGIS_IOT_ENDPOINT") or self._read_optional(iot_dir / "endpoint.txt")).strip()
        ca_file = os.getenv("AEGIS_IOT_CA_FILE", str(iot_dir / "AmazonRootCA1.pem"))
        cert_file = os.getenv("AEGIS_IOT_CERT_FILE", str(iot_dir / "certificate.pem.crt"))
        key_file = os.getenv("AEGIS_IOT_KEY_FILE", str(iot_dir / "private.pem.key"))
        missing = [
            name
            for name, value in (
                ("AEGIS_IOT_ENDPOINT or endpoint.txt", endpoint),
                ("AEGIS_IOT_CA_FILE", ca_file),
                ("AEGIS_IOT_CERT_FILE", cert_file),
                ("AEGIS_IOT_KEY_FILE", key_file),
            )
            if not value
        ]
        if missing:
            raise RuntimeError(f"missing required IoT configuration: {', '.join(missing)}")
        return MqttClient(
            endpoint=endpoint,
            port=int(os.getenv("AEGIS_IOT_PORT", "8883")),
            client_id=os.getenv("AEGIS_IOT_CLIENT_ID", os.getenv("AEGIS_IOT_THING_NAME", "AEGIS-IoTThing-factory-b")),
            ca_file=ca_file,
            cert_file=cert_file,
            key_file=key_file,
            timeout_seconds=float(os.getenv("AEGIS_IOT_TIMEOUT_SECONDS", "10")),
        )

    def scan_outbox(self) -> list[Path]:
        if not self.outbox_dir.exists():
            return []
        return sorted([item for item in self.outbox_dir.iterdir() if item.is_file() and item.suffix == ".json"], key=lambda item: (item.stat().st_mtime, item.name))

    def publish_once(self) -> int:
        published = 0
        for path in self.scan_outbox():
            try:
                self.publish_file(path)
            except Exception as exc:
                print(f"publish failed for {path}: {exc}", file=sys.stderr, flush=True)
                continue
            published += 1
        return published

    def run_loop(self) -> None:
        delay = self.backoff_seconds
        while True:
            try:
                published = self.publish_once()
                delay = self.backoff_seconds if published else min(delay * 2, self.max_backoff_seconds)
            except Exception as exc:
                print(f"publisher loop error: {exc}", file=sys.stderr, flush=True)
                delay = min(delay * 2, self.max_backoff_seconds)
            time.sleep(delay)

    def publish_file(self, path: Path) -> None:
        try:
            message = json.loads(path.read_text(encoding="utf-8"))
            self.validate_message(message)
        except Exception:
            self.quarantine(path)
            raise
        message["published_at"] = format_utc(datetime.now(timezone.utc))
        message["data_plane_instance_id"] = self.data_plane_instance_id
        topic = self.topic_for(message)
        payload = json.dumps(message, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
        self.mqtt_client.publish(topic, payload)
        path.unlink()
        print(f"published {path} -> {topic}", flush=True)

    def validate_message(self, message: dict[str, Any]) -> None:
        missing = sorted(REQUIRED_FIELDS - set(message))
        if missing:
            raise ValueError(f"message is missing required fields: {', '.join(missing)}")
        if message.get("source_type") not in VALID_SOURCE_TYPES:
            raise ValueError(f"unsupported source_type: {message.get('source_type')}")
        if not message.get("factory_id"):
            raise ValueError("factory_id is required")
        if not message.get("message_id"):
            raise ValueError("message_id is required")
        if not isinstance(message.get("payload"), dict):
            raise ValueError("payload must be an object")

    def topic_for(self, message: dict[str, Any]) -> str:
        self.validate_message(message)
        return f"aegis/{message['factory_id']}/{message['source_type']}"

    def quarantine(self, path: Path) -> Path:
        target_dir = self.outbox_dir / "quarantine"
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / path.name
        if target.exists():
            target = target_dir / f"{path.stem}.{int(time.time())}{path.suffix}"
        path.replace(target)
        return target

    def _read_optional(self, path: Path) -> str:
        try:
            return path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return ""


def main() -> int:
    parser = argparse.ArgumentParser(description="Publish factory-b dummy outbox JSON files to AWS IoT Core.")
    parser.add_argument("--once", action="store_true", help="Scan the outbox once and exit.")
    parser.add_argument("--loop", action="store_true", help="Continuously scan and publish outbox files.")
    parser.add_argument("--outbox-dir", default=os.getenv("AEGIS_OUTBOX_DIR", "/var/lib/aegis/outbox"))
    args = parser.parse_args()
    if args.once and args.loop:
        parser.error("--once and --loop are mutually exclusive")
    os.environ["AEGIS_OUTBOX_DIR"] = args.outbox_dir
    publisher = FactoryBIotPublisher()
    if args.loop or not args.once:
        publisher.run_loop()
        return 0
    publisher.publish_once()
    return 0


if __name__ == "__main__":
    sys.exit(main())
