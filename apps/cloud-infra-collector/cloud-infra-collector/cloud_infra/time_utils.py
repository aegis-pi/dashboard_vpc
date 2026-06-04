from datetime import datetime, timezone


def utc_now():
    return datetime.now(timezone.utc)


def format_utc(value) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_utc(value: str):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def s3_timestamp(value: str) -> str:
    return value.replace(":", "-").replace(".", "-")
