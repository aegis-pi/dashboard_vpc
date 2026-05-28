"""Authentication guard tests.

All tests use client_real_auth, which runs the real JWT verification path
with JWKS mocked in-memory via the patch_jwks fixture.
"""
import time


def test_factories_no_auth_returns_401(client_real_auth):
    r = client_real_auth.get("/factories")
    assert r.status_code == 401


def test_factories_invalid_token_returns_401(client_real_auth):
    r = client_real_auth.get(
        "/factories",
        headers={"Authorization": "Bearer not.a.real.token"},
    )
    assert r.status_code == 401


def test_factories_expired_token_returns_401(client_real_auth, expired_token):
    r = client_real_auth.get(
        "/factories",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert r.status_code == 401


def test_jwks_stale_cache_is_used_when_refresh_fails(
    client_real_auth,
    valid_token,
    mock_jwks,
    monkeypatch,
):
    import deps.auth as auth_module

    monkeypatch.setattr(auth_module, "_jwks_cache", mock_jwks)
    monkeypatch.setattr(auth_module, "_jwks_cache_at", time.monotonic() - 7200)
    monkeypatch.setattr(auth_module, "_jwks_lock", None)

    async def _raise_fetch(url: str, timeout: float) -> dict:
        raise RuntimeError("jwks unavailable")

    monkeypatch.setattr(auth_module, "_fetch_jwks", _raise_fetch)
    from services import ddb

    async def _list_factories():
        return []

    monkeypatch.setattr(ddb, "list_factories", _list_factories)

    r = client_real_auth.get(
        "/factories",
        headers={"Authorization": f"Bearer {valid_token}"},
    )

    assert r.status_code == 200


def test_jwks_cold_cache_fetch_failure_returns_401(
    client_real_auth,
    valid_token,
    monkeypatch,
):
    import deps.auth as auth_module

    monkeypatch.setattr(auth_module, "_jwks_cache", None)
    monkeypatch.setattr(auth_module, "_jwks_cache_at", 0.0)
    monkeypatch.setattr(auth_module, "_jwks_lock", None)

    async def _raise_fetch(url: str, timeout: float) -> dict:
        raise RuntimeError("jwks unavailable")

    monkeypatch.setattr(auth_module, "_fetch_jwks", _raise_fetch)

    r = client_real_auth.get(
        "/factories",
        headers={"Authorization": f"Bearer {valid_token}"},
    )

    assert r.status_code == 401
