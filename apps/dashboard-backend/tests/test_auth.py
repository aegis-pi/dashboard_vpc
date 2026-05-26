"""Authentication guard tests.

All tests use client_real_auth, which runs the real JWT verification path
with JWKS mocked in-memory via the patch_jwks fixture.
"""


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
