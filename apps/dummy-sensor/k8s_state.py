#!/usr/bin/env python3
"""Small Kubernetes state reader for dummy sensor generators."""

from __future__ import annotations

import json
import os
import subprocess
import urllib.request
import ssl
from pathlib import Path
from typing import Any


DEFAULT_WORKLOADS = (
    "ai-apps/dummy-data-generator",
    "ai-apps/edge-iot-publisher",
)


def safe_int(value: Any) -> int:
    if value is None:
        return 0
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def normalize_node_id(value: str | None) -> str:
    return (value or "unknown").strip().lower() or "unknown"


class KubernetesStateReader:
    def __init__(self, timeout_seconds: float = 5.0) -> None:
        self.timeout_seconds = timeout_seconds
        self.host = os.getenv("KUBERNETES_SERVICE_HOST")
        self.port = os.getenv("KUBERNETES_SERVICE_PORT", "443")
        self.token_path = Path("/var/run/secrets/kubernetes.io/serviceaccount/token")
        self.ca_path = Path("/var/run/secrets/kubernetes.io/serviceaccount/ca.crt")
        self.kubeconfig = os.getenv("KUBECONFIG")

    def available(self) -> bool:
        return bool((self.host and self.token_path.exists()) or self._kubectl_available())

    def nodes(self) -> list[dict[str, Any]]:
        if self.host and self.token_path.exists():
            try:
                return self._get_json("/api/v1/nodes").get("items", [])
            except Exception:
                pass
        return self._kubectl_json(["get", "nodes", "-o", "json"]).get("items", [])

    def pods(self, namespace: str) -> list[dict[str, Any]]:
        if self.host and self.token_path.exists():
            try:
                return self._get_json(f"/api/v1/namespaces/{namespace}/pods").get("items", [])
            except Exception:
                pass
        return self._kubectl_json(["-n", namespace, "get", "pods", "-o", "json"]).get("items", [])

    def _get_json(self, path: str) -> dict[str, Any]:
        token = self.token_path.read_text(encoding="utf-8").strip()
        context = ssl.create_default_context(cafile=str(self.ca_path)) if self.ca_path.exists() else ssl.create_default_context()
        request = urllib.request.Request(
            f"https://{self.host}:{self.port}{path}",
            headers={"Authorization": f"Bearer {token}"},
        )
        with urllib.request.urlopen(request, context=context, timeout=self.timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))

    def _kubectl_json(self, args: list[str]) -> dict[str, Any]:
        cmd = ["kubectl"]
        if self.kubeconfig:
            cmd.extend(["--kubeconfig", self.kubeconfig])
        cmd.extend(args)
        output = subprocess.check_output(cmd, text=True, stderr=subprocess.DEVNULL, timeout=self.timeout_seconds)
        return json.loads(output)

    def _kubectl_available(self) -> bool:
        try:
            subprocess.check_output(["kubectl", "version", "--client=true", "-o", "json"], text=True, stderr=subprocess.DEVNULL, timeout=self.timeout_seconds)
        except Exception:
            return False
        return True


def build_node_payloads(items: list[dict[str, Any]], role_overrides: dict[str, str] | None = None) -> list[dict[str, Any]]:
    role_overrides = role_overrides or {}
    payloads = []
    for item in items:
        name = normalize_node_id(item.get("metadata", {}).get("name"))
        conditions = item.get("status", {}).get("conditions", [])
        ready = any(cond.get("type") == "Ready" and cond.get("status") == "True" for cond in conditions)
        role = role_overrides.get(name) or role_from_labels(name, item.get("metadata", {}).get("labels", {}))
        payloads.append(
            {
                "node_id": name,
                "role": role,
                "ready": ready,
                "cpu_usage_percent": None,
                "memory_usage_percent": None,
                "disk_usage_percent": None,
                "network_reachability": "ok" if ready else "not_ready",
            }
        )
    return sorted(payloads, key=lambda item: item["node_id"])


def role_from_labels(name: str, labels: dict[str, Any]) -> str:
    if labels.get("node-role.kubernetes.io/control-plane") is not None or labels.get("node-role.kubernetes.io/master") is not None:
        return "control-plane"
    if labels.get("aegis.input-module-type") == "dummy":
        return "worker"
    if name == "factory-b":
        return "single-node"
    return "worker"


def build_workload_payloads(reader: KubernetesStateReader, requested: tuple[str, ...] = DEFAULT_WORKLOADS) -> list[dict[str, Any]]:
    by_namespace: dict[str, list[str]] = {}
    for value in requested:
        if "/" not in value:
            continue
        namespace, name = value.split("/", 1)
        by_namespace.setdefault(namespace, []).append(name)

    payloads: list[dict[str, Any]] = []
    for namespace, names in by_namespace.items():
        pods = reader.pods(namespace)
        for name in names:
            selected = [pod for pod in pods if pod.get("metadata", {}).get("name", "").startswith(f"{name}-") or pod.get("metadata", {}).get("name") == name]
            payloads.append(build_workload_payload(namespace, name, selected))
    return payloads


def build_workload_payload(namespace: str, name: str, pods: list[dict[str, Any]]) -> dict[str, Any]:
    if not pods:
        return {
            "namespace": namespace,
            "name": name,
            "status": "NotFound",
            "ready": False,
            "restart_count": 0,
            "node_id": "unknown",
        }

    pod = sorted(pods, key=lambda item: item.get("metadata", {}).get("creationTimestamp", ""), reverse=True)[0]
    statuses = pod.get("status", {}).get("containerStatuses", [])
    ready = bool(statuses) and all(item.get("ready") for item in statuses)
    restart_count = sum(safe_int(item.get("restartCount")) for item in statuses)
    return {
        "namespace": namespace,
        "name": name,
        "status": pod.get("status", {}).get("phase", "unknown"),
        "ready": ready,
        "restart_count": restart_count,
        "node_id": normalize_node_id(pod.get("spec", {}).get("nodeName")),
    }
