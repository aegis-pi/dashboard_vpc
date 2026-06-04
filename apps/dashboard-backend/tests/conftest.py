"""Test fixtures for Aegis Dashboard Backend.

Environment variables are set at module-import time so that pydantic-settings
picks them up before the first get_settings() call.  The lru_cache is cleared
once to ensure the test values take effect.

RDS: SQLite+aiosqlite is used in tests instead of PostgreSQL+asyncpg.
Rationale: testcontainers adds Docker dependency and significant CI spin-up
overhead.  Phase 1 Step 6 implements the connection skeleton only; no SQL
queries are issued in this phase.  Swap to a real PostgreSQL container when
SQL queries are introduced in Step 7+.
"""
import base64
import os
import time
from decimal import Decimal
from typing import Optional

import boto3
import pytest
from fastapi.testclient import TestClient
from moto import mock_aws

# ─── Set test env vars BEFORE importing anything that calls get_settings() ───
os.environ.update(
    {
        "AWS_ACCESS_KEY_ID": "testing",
        "AWS_SECRET_ACCESS_KEY": "testing",
        "AWS_SECURITY_TOKEN": "testing",
        "AWS_SESSION_TOKEN": "testing",
        "AWS_DEFAULT_REGION": "ap-south-1",
        "DATABASE_URL": "sqlite+aiosqlite:///:memory:",
        "REDIS_URL": "redis://localhost:6379",
        "REDIS_SOCKET_CONNECT_TIMEOUT_SECONDS": "2",
        "REDIS_SOCKET_TIMEOUT_SECONDS": "5",
        "REDIS_HEALTH_CHECK_INTERVAL_SECONDS": "30",
        "REDIS_PUBSUB_OPERATION_TIMEOUT_SECONDS": "6",
        "DDB_TABLE_STATUS": "AEGIS-DynamoDB-FactoryStatus",
        "DDB_TABLE_REPORT": "aegis-daily-report",
        "DASHBOARD_FACTORY_IDS": "factory-a,factory-b,factory-c",
        "DASHBOARD_FACTORY_DISCOVERY_MODE": "scan_latest",
        "DASHBOARD_FACTORY_SCAN_LIMIT": "200",
        "DDB_CONNECT_TIMEOUT_SECONDS": "2",
        "DDB_READ_TIMEOUT_SECONDS": "5",
        "DDB_OPERATION_TIMEOUT_SECONDS": "12",
        "DDB_MAX_ATTEMPTS": "2",
        "DDB_MAX_POOL_CONNECTIONS": "20",
        "DDB_MAX_CONCURRENT_OPERATIONS": "10",
        "S3_BUCKET_DATA": "aegis-bucket-data",
        "S3_CONNECT_TIMEOUT_SECONDS": "2",
        "S3_READ_TIMEOUT_SECONDS": "5",
        "S3_OPERATION_TIMEOUT_SECONDS": "12",
        "S3_MAX_ATTEMPTS": "2",
        "S3_MAX_POOL_CONNECTIONS": "10",
        "COGNITO_USER_POOL_ID": "ap-south-1_TESTPOOL",
        "COGNITO_APP_CLIENT_ID": "test-client-id",
        "COGNITO_JWKS_TIMEOUT_SECONDS": "5",
        "COGNITO_JWKS_TTL_SECONDS": "3600",
        "RBAC_BOOTSTRAP_SUPER_ADMIN_SUBS": "test-user,test-user-sub",
        "AWS_REGION": "ap-south-1",
    }
)

from config import get_settings  # noqa: E402

get_settings.cache_clear()

import deps.auth as auth_module  # noqa: E402
import deps.rbac as rbac_module  # noqa: E402
from main import app  # noqa: E402

# ─── RSA key pair ─────────────────────────────────────────────────────────────

_TEST_KID = "test-key-1"


@pytest.fixture(scope="session")
def rsa_private_key():
    from cryptography.hazmat.primitives.asymmetric import rsa

    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture(scope="session")
def mock_jwks(rsa_private_key):
    pub = rsa_private_key.public_key()
    nums = pub.public_numbers()

    def _b64url(n: int) -> str:
        length = (n.bit_length() + 7) // 8
        return base64.urlsafe_b64encode(n.to_bytes(length, "big")).rstrip(b"=").decode()

    return {
        "keys": [
            {
                "kty": "RSA",
                "kid": _TEST_KID,
                "use": "sig",
                "alg": "RS256",
                "n": _b64url(nums.n),
                "e": _b64url(nums.e),
            }
        ]
    }


def _mint_token(private_key, extra: Optional[dict] = None) -> str:
    from cryptography.hazmat.primitives import serialization
    from jose import jwt as jose_jwt

    pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    claims = {
        "iss": "https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_TESTPOOL",
        "client_id": "test-client-id",
        "token_use": "access",
        "sub": "test-user-sub",
        "exp": int(time.time()) + 3600,
        "iat": int(time.time()),
    }
    if extra:
        claims.update(extra)
    return jose_jwt.encode(claims, pem, algorithm="RS256", headers={"kid": _TEST_KID})


@pytest.fixture(scope="session")
def valid_token(rsa_private_key) -> str:
    return _mint_token(rsa_private_key)


@pytest.fixture(scope="session")
def expired_token(rsa_private_key) -> str:
    return _mint_token(
        rsa_private_key,
        {"exp": int(time.time()) - 10, "iat": int(time.time()) - 3620},
    )


# ─── JWKS mock ────────────────────────────────────────────────────────────────

@pytest.fixture
def patch_jwks(mock_jwks, monkeypatch):
    """Replace _fetch_jwks with an in-memory stub and reset the module cache."""
    monkeypatch.setattr(auth_module, "_jwks_cache", None)
    monkeypatch.setattr(auth_module, "_jwks_cache_at", 0.0)
    monkeypatch.setattr(auth_module, "_jwks_lock", None)

    async def _stub(url: str, timeout: float) -> dict:
        return mock_jwks

    monkeypatch.setattr(auth_module, "_fetch_jwks", _stub)


# ─── Cache reset ─────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def reset_factories_cache():
    """Clear in-process factory list cache before every test."""
    import routers.factories as _f
    _f._factories_cache = None
    _f._factories_cache_at = 0.0
    yield


# ─── TestClient fixtures ──────────────────────────────────────────────────────

@pytest.fixture
def client():
    """Client with auth dependency overridden — all requests pass as authenticated."""

    def _always_auth():
        return {
            "sub": "test-user",
            "token_use": "access",
            "client_id": "test-client-id",
        }

    app.dependency_overrides[auth_module.verify_cognito_token] = _always_auth
    app.dependency_overrides[rbac_module.get_current_principal] = lambda: rbac_module.Principal(
        user_id="test-user",
        cognito_sub="test-user",
        email="test@example.com",
        display_name="Test User",
        global_role="super_admin",
        status="active",
        allowed_factory_ids=None,
    )
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.pop(auth_module.verify_cognito_token, None)
    app.dependency_overrides.pop(rbac_module.get_current_principal, None)


@pytest.fixture
def client_real_auth(patch_jwks):
    """Client that runs real JWT verification (JWKS is mocked in-memory)."""
    app.dependency_overrides.pop(auth_module.verify_cognito_token, None)
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


# ─── DynamoDB moto fixture ────────────────────────────────────────────────────

def _to_ddb(obj):
    """Recursively convert float to Decimal for DynamoDB put_item."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: _to_ddb(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_to_ddb(v) for v in obj]
    return obj


def _now_minus(minutes: int) -> str:
    from datetime import datetime, timedelta, timezone

    dt = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


@pytest.fixture
def ddb_mock():
    """Start moto mock, create AEGIS-DynamoDB-FactoryStatus with test items."""
    import services.ddb as ddb_service

    ddb_service._ddb_resource.cache_clear()
    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="ap-south-1")
        table = ddb.create_table(
            TableName="AEGIS-DynamoDB-FactoryStatus",
            KeySchema=[
                {"AttributeName": "pk", "KeyType": "HASH"},
                {"AttributeName": "sk", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "pk", "AttributeType": "S"},
                {"AttributeName": "sk", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )

        ts_45 = _now_minus(45)
        ts_30 = _now_minus(30)

        items = [
            # LATEST item — factory-a (nested _avg format, existing tests depend on this shape)
            {
                "pk": "FACTORY#factory-a",
                "sk": "LATEST",
                "factory_id": "factory-a",
                "environment_type": "physical-rpi",
                "schema_version": "0.1.0",
                "updated_at": _now_minus(1),
                "risk": {
                    "score": 27.6,
                    "level": "danger",
                    "top_causes": [
                        {"name": "temperature", "value": 38.2, "contribution": 12.5},
                        {"name": "fire_score", "value": 0.85, "contribution": 10.1},
                    ],
                },
                "factory_state": {
                    "message_id": "msg-001",
                    "source_timestamp": _now_minus(1),
                    "temperature_celsius_avg": 38.2,
                },
                "infra_state": {
                    "message_id": "infra-001",
                    "source_timestamp": _now_minus(2),
                    "node_summary": {"total": 3, "ready": 3, "not_ready": 0},
                },
                "pipeline_status": {"status": "normal"},
                "dashboard": {"display_status": "위험"},
            },
            # LATEST item — factory-b (flat DDB format to test alias normalization)
            {
                "pk": "FACTORY#factory-b",
                "sk": "LATEST",
                "factory_id": "factory-b",
                "updated_at": _now_minus(5),
                "risk": {"score": 72.0, "level": "warning", "top_causes": []},
                "factory_state": {
                    "source_timestamp": _now_minus(5),
                    "temperature_celsius": 26.5,
                    "humidity_percent": 55.0,
                    "fire_score": 0.2,
                    "fall_score": 0.1,
                    "bend_score": 0.05,
                },
                "infra_state": {
                    "source_timestamp": _now_minus(6),
                    "node_summary": {"total": 2, "ready": 2, "not_ready": 0},
                },
                "pipeline_status": {"status": "normal"},
            },
            # LATEST item — factory-d intentionally omitted from DASHBOARD_FACTORY_IDS
            # so scan_latest discovery proves newly ingested factories appear.
            {
                "pk": "FACTORY#factory-d",
                "sk": "LATEST",
                "factory_id": "factory-d",
                "updated_at": _now_minus(7),
                "risk": {"score": 90.0, "level": "safe", "top_causes": []},
                "factory_state": {
                    "source_timestamp": _now_minus(7),
                    "temperature_celsius": 24.0,
                    "humidity_percent": 48.0,
                },
                "infra_state": {
                    "source_timestamp": _now_minus(8),
                    "node_summary": {"total": 1, "ready": 1, "not_ready": 0},
                },
                "pipeline_status": {"status": "normal"},
            },
            # HISTORY#STATE item 1 (45 min ago) — _avg format
            {
                "pk": "FACTORY#factory-a",
                "sk": f"HISTORY#STATE#{ts_45}",
                "factory_id": "factory-a",
                "updated_at": ts_45,
                "risk": {"score": 10.0, "level": "safe"},
                "factory_state": {"temperature_celsius_avg": 22.0},
                "infra_state": {"node_summary": {"total": 3, "ready": 3}},
            },
            # HISTORY#STATE item 2 (30 min ago) — _avg format
            {
                "pk": "FACTORY#factory-a",
                "sk": f"HISTORY#STATE#{ts_30}",
                "factory_id": "factory-a",
                "updated_at": ts_30,
                "risk": {"score": 20.0, "level": "warning"},
                "factory_state": {"temperature_celsius_avg": 30.0},
                "infra_state": {"node_summary": {"total": 3, "ready": 2}},
            },
            # Wrong-prefix item — must NEVER be returned by history endpoint
            {
                "pk": "FACTORY#factory-a",
                "sk": f"HISTORY#RISK#{ts_30}",
                "factory_id": "factory-a",
                "risk": {"score": 99.0, "level": "danger"},
            },
            # GRAPH#5M item 1 (45 min ago) — danger range (risk_score_min=25.0)
            {
                "pk": "FACTORY#factory-a",
                "sk": f"GRAPH#5M#{ts_45}",
                "factory_id": "factory-a",
                "bucket_start": ts_45,
                "bucket_end": _now_minus(40),
                "item_type": "GRAPH#5M",
                "schema_version": "graph-5m-v0.1.0",
                "bucket_minutes": 5,
                "sensor": {
                    "temperature_celsius": {"mean": 25.0, "min": 24.0, "max": 26.0, "count": 97},
                    "humidity_percent": {"mean": 50.0, "min": 48.0, "max": 52.0, "count": 97},
                    "pressure_hpa": {"mean": 1008.0, "min": 1007.0, "max": 1009.0, "count": 97},
                },
                "risk": {
                    "score": {"mean": 30.0, "min": 25.0, "max": 35.0, "count": 97},
                },
                "ai_detection": {
                    "threshold": 0.7,
                    "max_score": 0.5,
                    "above_threshold_count": 0,
                    "by_type": {
                        "fire_score": {"max": 0.5, "min": 0.0, "mean": 0.1, "count": 97,
                                       "threshold": 0.7, "above_threshold_count": 0},
                        "fall_score": {"max": 0.2, "min": 0.0, "mean": 0.05, "count": 97,
                                       "threshold": 0.7, "above_threshold_count": 0},
                        "bend_score": {"max": 0.1, "min": 0.0, "mean": 0.02, "count": 97,
                                       "threshold": 0.7, "above_threshold_count": 0},
                    },
                },
                "infra": {
                    "cpu_usage_percent": {"mean": 40.0, "max": 60.0, "min": 20.0, "count": 97},
                    "memory_usage_percent": {"mean": 55.0, "max": 65.0, "min": 45.0, "count": 97},
                    "disk_usage_percent": {"last": 70.0, "mean": 70.0, "max": 71.0, "min": 69.0, "count": 97},
                    "nodes": [
                        {"node_id": "factory-a-master",  "cpu_usage_percent": {"mean": 35.0}, "memory_usage_percent": {"mean": 50.0}, "disk_usage_percent": {"last": 65.0}},
                        {"node_id": "factory-a-worker1", "cpu_usage_percent": {"mean": 42.0}, "memory_usage_percent": {"mean": 58.0}, "disk_usage_percent": {"last": 72.0}},
                        {"node_id": "factory-a-worker2", "cpu_usage_percent": {"mean": 38.0}, "memory_usage_percent": {"mean": 57.0}, "disk_usage_percent": {"last": 68.0}},
                    ],
                },
                "quality": {"source_count": 97, "expected_count": 100, "is_empty": False, "is_partial": False},
            },
            # GRAPH#5M item 2 (30 min ago) — warning range (risk_score_min=60.0)
            {
                "pk": "FACTORY#factory-a",
                "sk": f"GRAPH#5M#{ts_30}",
                "factory_id": "factory-a",
                "bucket_start": ts_30,
                "bucket_end": _now_minus(25),
                "item_type": "GRAPH#5M",
                "schema_version": "graph-5m-v0.1.0",
                "bucket_minutes": 5,
                "sensor": {
                    "temperature_celsius": {"mean": 27.0, "min": 26.0, "max": 28.0, "count": 97},
                    "humidity_percent": {"mean": 52.0, "min": 50.0, "max": 54.0, "count": 97},
                    "pressure_hpa": {"mean": 1009.0, "min": 1008.0, "max": 1010.0, "count": 97},
                },
                "risk": {
                    "score": {"mean": 70.0, "min": 60.0, "max": 80.0, "count": 97},
                },
                "ai_detection": {
                    "threshold": 0.7,
                    "max_score": 0.2,
                    "above_threshold_count": 0,
                    "by_type": {
                        "fire_score": {"max": 0.2, "min": 0.0, "mean": 0.05, "count": 97,
                                       "threshold": 0.7, "above_threshold_count": 0},
                        "fall_score": {"max": 0.1, "min": 0.0, "mean": 0.02, "count": 97,
                                       "threshold": 0.7, "above_threshold_count": 0},
                        "bend_score": {"max": 0.15, "min": 0.0, "mean": 0.03, "count": 97,
                                       "threshold": 0.7, "above_threshold_count": 0},
                    },
                },
                "infra": {
                    "cpu_usage_percent": {"mean": 45.0, "max": 55.0, "min": 35.0, "count": 97},
                    "memory_usage_percent": {"mean": 58.0, "max": 68.0, "min": 48.0, "count": 97},
                    "disk_usage_percent": {"last": 71.0, "mean": 71.0, "max": 72.0, "min": 70.0, "count": 97},
                    "nodes": [
                        {"node_id": "factory-a-master",  "cpu_usage_percent": {"mean": 38.0}, "memory_usage_percent": {"mean": 53.0}, "disk_usage_percent": {"last": 66.0}},
                        {"node_id": "factory-a-worker1", "cpu_usage_percent": {"mean": 50.0}, "memory_usage_percent": {"mean": 62.0}, "disk_usage_percent": {"last": 73.0}},
                        {"node_id": "factory-a-worker2", "cpu_usage_percent": {"mean": 41.0}, "memory_usage_percent": {"mean": 59.0}, "disk_usage_percent": {"last": 69.0}},
                    ],
                },
                "quality": {"source_count": 97, "expected_count": 100, "is_empty": False, "is_partial": False},
            },
        ]

        for item in items:
            table.put_item(Item=_to_ddb(item))

        yield table
    ddb_service._ddb_resource.cache_clear()
