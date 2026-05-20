#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  check-s3-ingestion-gap.sh --factory factory-b|factory-c --start 2026-05-20T00:00:00Z --end 2026-05-20T00:10:00Z [--bucket aegis-bucket-data]

Runs on Computer 1 with AWS CLI access.

Checks whether S3 raw objects exist before, during, and after an outage window.
This is an object timestamp check based on `aws s3 ls` LastModified time.
USAGE
}

factory=""
start_iso=""
end_iso=""
bucket="aegis-bucket-data"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --factory)
      factory="${2:-}"
      shift 2
      ;;
    --start)
      start_iso="${2:-}"
      shift 2
      ;;
    --end)
      end_iso="${2:-}"
      shift 2
      ;;
    --bucket)
      bucket="${2:-}"
      shift 2
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

if [[ -z "${start_iso}" || -z "${end_iso}" ]]; then
  echo "--start and --end are required" >&2
  exit 2
fi

start_epoch="$(date -u -d "${start_iso}" +%s)"
end_epoch="$(date -u -d "${end_iso}" +%s)"
if (( end_epoch <= start_epoch )); then
  echo "--end must be after --start" >&2
  exit 2
fi

count_objects() {
  local source_type="$1"
  local from_epoch="$2"
  local to_epoch="$3"
  aws s3 ls "s3://${bucket}/raw/${factory}/${source_type}/" --recursive \
    | awk -v from="${from_epoch}" -v to="${to_epoch}" '
      {
        ts = $1 "T" $2 "Z"
        cmd = "date -u -d \"" ts "\" +%s"
        cmd | getline epoch
        close(cmd)
        if (epoch >= from && epoch < to) count += 1
      }
      END { print count + 0 }
    '
}

window_seconds=$((end_epoch - start_epoch))
before_start=$((start_epoch - window_seconds))
after_end=$((end_epoch + window_seconds))

echo "factory=${factory}"
echo "bucket=${bucket}"
echo "window=${start_iso}..${end_iso}"
echo
printf '%-14s %10s %10s %10s\n' "source_type" "before" "during" "after"
for source_type in factory_state infra_state; do
  before_count="$(count_objects "${source_type}" "${before_start}" "${start_epoch}")"
  during_count="$(count_objects "${source_type}" "${start_epoch}" "${end_epoch}")"
  after_count="$(count_objects "${source_type}" "${end_epoch}" "${after_end}")"
  printf '%-14s %10s %10s %10s\n' "${source_type}" "${before_count}" "${during_count}" "${after_count}"
done

cat <<'NOTE'

Interpretation:
- drop-mode outage: during should be 0 or near 0, after should increase again.
- backlog-mode outage: during may be 0 in S3, after may spike because queued outbox files flush.
- Exact S3 LastModified times can lag publish time by a few seconds.
NOTE
