#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  factory-dummy-outage-drill.sh --factory factory-b|factory-c [--duration 60s|2h|2d] [--mode drop|backlog] [--no-sleep]

Runs on the target VM.

Modes:
  drop     Stop generator and publisher. No new local outbox is created during outage.
  backlog  Stop publisher only. Generator keeps writing outbox, then publisher flushes backlog after resume.

Examples:
  sudo ./factory-dummy-outage-drill.sh --factory factory-b --duration 10m
  sudo ./factory-dummy-outage-drill.sh --factory factory-c --duration 2d --mode drop
  sudo ./factory-dummy-outage-drill.sh --factory factory-b --duration 1h --mode backlog
USAGE
}

factory=""
duration="60s"
mode="drop"
sleep_enabled="true"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --factory)
      factory="${2:-}"
      shift 2
      ;;
    --duration)
      duration="${2:-}"
      shift 2
      ;;
    --mode)
      mode="${2:-}"
      shift 2
      ;;
    --no-sleep)
      sleep_enabled="false"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "${factory}" != "factory-b" && "${factory}" != "factory-c" ]]; then
  echo "--factory must be factory-b or factory-c" >&2
  exit 2
fi

if [[ "${mode}" != "drop" && "${mode}" != "backlog" ]]; then
  echo "--mode must be drop or backlog" >&2
  exit 2
fi

parse_duration_seconds() {
  local value="$1"
  if [[ "${value}" =~ ^[0-9]+$ ]]; then
    echo "${value}"
    return
  fi
  if [[ "${value}" =~ ^([0-9]+)([smhd])$ ]]; then
    local amount="${BASH_REMATCH[1]}"
    local unit="${BASH_REMATCH[2]}"
    case "${unit}" in
      s) echo "${amount}" ;;
      m) echo $((amount * 60)) ;;
      h) echo $((amount * 3600)) ;;
      d) echo $((amount * 86400)) ;;
    esac
    return
  fi
  echo "invalid duration: ${value}" >&2
  exit 2
}

duration_seconds="$(parse_duration_seconds "${duration}")"
generator_service="aegis-${factory}-dummy-generator.service"
publisher_service="aegis-${factory}-dummy-publisher.service"
state_dir="/var/lib/aegis/outage-drills"
mkdir -p "${state_dir}"

start_epoch="$(date -u +%s)"
start_iso="$(date -u -d "@${start_epoch}" +%Y-%m-%dT%H:%M:%SZ)"
drill_id="${factory}-$(date -u -d "@${start_epoch}" +%Y%m%dT%H%M%SZ)"
record_file="${state_dir}/${drill_id}.json"

echo "drill_id=${drill_id}"
echo "factory=${factory}"
echo "mode=${mode}"
echo "duration=${duration} (${duration_seconds}s)"
echo "outage_start=${start_iso}"

if [[ "${mode}" == "drop" ]]; then
  systemctl stop "${generator_service}"
fi
systemctl stop "${publisher_service}"

cat > "${record_file}" <<EOF
{
  "drill_id": "${drill_id}",
  "factory_id": "${factory}",
  "mode": "${mode}",
  "duration_seconds": ${duration_seconds},
  "outage_start": "${start_iso}",
  "outage_end": null,
  "generator_service": "${generator_service}",
  "publisher_service": "${publisher_service}"
}
EOF

if [[ "${sleep_enabled}" == "true" ]]; then
  sleep "${duration_seconds}"
else
  echo "services stopped; resume manually with:"
  echo "  sudo systemctl start ${generator_service}"
  echo "  sudo systemctl start ${publisher_service}"
  echo "record_file=${record_file}"
  exit 0
fi

end_epoch="$(date -u +%s)"
end_iso="$(date -u -d "@${end_epoch}" +%Y-%m-%dT%H:%M:%SZ)"

if [[ "${mode}" == "drop" ]]; then
  systemctl start "${generator_service}"
fi
systemctl start "${publisher_service}"

python3 - "$record_file" "$end_iso" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
end_iso = sys.argv[2]
data = json.loads(path.read_text(encoding="utf-8"))
data["outage_end"] = end_iso
path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
PY

echo "outage_end=${end_iso}"
echo "record_file=${record_file}"
systemctl --no-pager --full status "${generator_service}" || true
systemctl --no-pager --full status "${publisher_service}" || true
