REQUIRED_FIELDS = [
    "schema_version",
    "message_id",
    "factory_id",
    "node_id",
    "source_type",
    "source_timestamp",
    "published_at",
    "payload",
]

VALID_SOURCE_TYPES = {"factory_state", "infra_state"}


class EnvelopeError(ValueError):
    pass


def parse(event: dict) -> dict:
    missing = [f for f in REQUIRED_FIELDS if f not in event]
    if missing:
        raise EnvelopeError(f"Missing required envelope fields: {missing}")

    if event["source_type"] not in VALID_SOURCE_TYPES:
        raise EnvelopeError(f"Unknown source_type: {event['source_type']!r}")

    if not isinstance(event["payload"], dict):
        raise EnvelopeError("payload must be a JSON object")

    return event
