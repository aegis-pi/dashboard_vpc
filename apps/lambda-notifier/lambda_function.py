"""
Lambda notifier: DynamoDB Streams → ElastiCache Redis PUBLISH

Filters INSERT/MODIFY events for LATEST items (sk == "LATEST"),
extracts factory_id from pk ("FACTORY#{factory_id}"), and publishes
the deserialized state to channel "factory:update:{factory_id}".

Redis connection and AUTH token are cached across warm invocations.
"""

import json
import logging
import os

import boto3
import redis as redis_lib
from boto3.dynamodb.types import TypeDeserializer

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

REDIS_HOST = os.environ["REDIS_HOST"]
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))
REDIS_AUTH_SECRET_NAME = os.environ["REDIS_AUTH_SECRET_NAME"]

_secretsmanager = boto3.client("secretsmanager")
_deserializer = TypeDeserializer()

_redis_client = None


def _get_redis() -> redis_lib.Redis:
    global _redis_client
    if _redis_client is not None:
        try:
            _redis_client.ping()
            return _redis_client
        except Exception:
            _redis_client = None

    secret = _secretsmanager.get_secret_value(SecretId=REDIS_AUTH_SECRET_NAME)
    auth_token = secret["SecretString"]

    _redis_client = redis_lib.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        password=auth_token,
        ssl=True,
        ssl_cert_reqs="none",
        decode_responses=True,
        socket_connect_timeout=5,
        socket_timeout=5,
    )
    return _redis_client


def _extract_factory_id(pk: str) -> str:
    """'FACTORY#factory-a'  ->  'factory-a'"""
    parts = pk.split("#", 1)
    return parts[1] if len(parts) == 2 else pk


def _deserialize_item(ddb_item: dict) -> dict:
    return {k: _deserializer.deserialize(v) for k, v in ddb_item.items()}


def handler(event, context):
    r = _get_redis()
    published = 0
    skipped = 0

    for record in event.get("Records", []):
        if record.get("eventSource") != "aws:dynamodb":
            continue
        if record.get("eventName") not in ("INSERT", "MODIFY"):
            continue

        new_image = record.get("dynamodb", {}).get("NewImage")
        if not new_image:
            continue

        sk_val = new_image.get("sk", {}).get("S", "")
        if sk_val != "LATEST":
            skipped += 1
            continue

        pk_val = new_image.get("pk", {}).get("S", "")
        factory_id = _extract_factory_id(pk_val)
        if not factory_id:
            logger.warning("empty factory_id from pk=%s", pk_val)
            skipped += 1
            continue

        payload = json.dumps(_deserialize_item(new_image), default=str)
        channel = f"factory:update:{factory_id}"
        r.publish(channel, payload)
        published += 1
        logger.info("published factory_id=%s channel=%s", factory_id, channel)

    logger.info("batch done published=%d skipped=%d", published, skipped)
    return {"published": published, "skipped": skipped}
