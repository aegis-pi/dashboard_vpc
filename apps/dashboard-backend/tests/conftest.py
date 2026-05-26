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
        "DATABASE_URL": "sqlite+aiosqlite://:memory:",
        "REDIS_URL": "redis://localhost:6379",
        "DDB_TABLE_STATUS": "AEGIS-DynamoDB-FactoryStatus",
        "DDB_TABLE_REPORT": "aegis-daily-report",
        "S3_BUCKET_DATA": "aegis-bucket-data",
        "COGNITO_USER_POOL_ID": "ap-south-1_TESTPOOL",
        "COGNITO_APP_CLIENT_ID": "test-client-id",
        "AWS_REGION": "ap-south-1",
    }
)

from config import get_settings  # noqa: E402

get_settings.cache_clear()

import deps.auth as auth_module  # noqa: E402
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

    async def _stub(url: str) -> dict:
        return mock_jwks

    monkeypatch.setattr(auth_module, "_fetch_jwks", _stub)


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
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.pop(auth_module.verify_cognito_token, None)


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
            # LATEST item
            {
                "pk": "FACTORY#factory-a",
                "sk": "LATEST",
                "factory_id": "factory-a",
                "schema_version": "0.1.0",
                "updated_at": _now_minus(1),
                "risk": {"score": 27.6, "level": "danger", "top_causes": []},
                "factory_state": {
                    "message_id": "msg-001",
                    "source_timestamp": _now_minus(1),
                    "temperature_celsius_avg": 38.2,
                },
                "infra_state": {
                    "message_id": "infra-001",
                    "node_summary": {"total": 3, "ready": 3},
                },
                "pipeline_status": {"status": "normal"},
                "dashboard": {"display_status": "위험"},
            },
            # HISTORY#STATE item 1 (45 min ago)
            {
                "pk": "FACTORY#factory-a",
                "sk": f"HISTORY#STATE#{ts_45}",
                "factory_id": "factory-a",
                "updated_at": ts_45,
                "risk": {"score": 10.0, "level": "safe"},
                "factory_state": {"temperature_celsius_avg": 22.0},
                "infra_state": {"node_summary": {"total": 3, "ready": 3}},
            },
            # HISTORY#STATE item 2 (30 min ago)
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
        ]

        for item in items:
            table.put_item(Item=_to_ddb(item))

        yield table
