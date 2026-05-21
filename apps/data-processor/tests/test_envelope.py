import pytest
from processor.envelope import EnvelopeError, parse

_BASE = {
    "schema_version": "0.1.0",
    "message_id": "factory-a:factory_state:worker2:2026-05-21T00:00:00Z",
    "factory_id": "factory-a",
    "node_id": "worker2",
    "source_type": "factory_state",
    "source_timestamp": "2026-05-21T00:00:00Z",
    "published_at": "2026-05-21T00:00:01Z",
    "payload": {},
}


def test_valid_factory_state():
    result = parse(dict(_BASE))
    assert result["factory_id"] == "factory-a"


def test_valid_infra_state():
    msg = {**_BASE, "source_type": "infra_state"}
    result = parse(msg)
    assert result["source_type"] == "infra_state"


def test_missing_field_raises():
    msg = dict(_BASE)
    del msg["factory_id"]
    with pytest.raises(EnvelopeError, match="factory_id"):
        parse(msg)


def test_unknown_source_type_raises():
    msg = {**_BASE, "source_type": "unknown_type"}
    with pytest.raises(EnvelopeError, match="Unknown source_type"):
        parse(msg)


def test_payload_must_be_dict():
    msg = {**_BASE, "payload": "not-a-dict"}
    with pytest.raises(EnvelopeError, match="payload"):
        parse(msg)
