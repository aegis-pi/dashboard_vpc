import time
from typing import Optional

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from config import Settings, get_settings

security = HTTPBearer(auto_error=False)

_jwks_cache: Optional[dict] = None
_jwks_cache_at: float = 0.0
_JWKS_TTL = 3600.0


def _jwks_url(settings: Settings) -> str:
    return (
        f"https://cognito-idp.{settings.aws_region}.amazonaws.com"
        f"/{settings.cognito_user_pool_id}/.well-known/jwks.json"
    )


async def _fetch_jwks(url: str) -> dict:
    global _jwks_cache, _jwks_cache_at
    now = time.monotonic()
    if _jwks_cache and (now - _jwks_cache_at) < _JWKS_TTL:
        return _jwks_cache
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        _jwks_cache_at = now
    return _jwks_cache


def _find_jwk(jwks: dict, kid: str) -> Optional[dict]:
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
    return None


def _http_401(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def _decode_token(token: str, settings: Settings) -> dict:
    """Decode and verify a Cognito JWT. Raises ValueError on failure."""
    try:
        header = jwt.get_unverified_header(token)
    except JWTError:
        raise ValueError("Malformed token header")

    kid = header.get("kid", "")
    jwks = await _fetch_jwks(_jwks_url(settings))
    key = _find_jwk(jwks, kid)
    if key is None:
        raise ValueError("Unknown signing key")

    issuer = (
        f"https://cognito-idp.{settings.aws_region}.amazonaws.com"
        f"/{settings.cognito_user_pool_id}"
    )
    try:
        # verify_aud=False because Cognito access tokens use client_id, not aud
        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            issuer=issuer,
            options={"verify_aud": False},
        )
    except JWTError as exc:
        raise ValueError(str(exc))

    token_use = payload.get("token_use", "")
    if token_use == "access":
        if payload.get("client_id") != settings.cognito_app_client_id:
            raise ValueError("Invalid client_id claim")
    elif token_use == "id":
        aud = payload.get("aud", "")
        expected = settings.cognito_app_client_id
        match = aud == expected if isinstance(aud, str) else expected in aud
        if not match:
            raise ValueError("Invalid aud claim")
    else:
        raise ValueError(f"Unexpected token_use: {token_use!r}")

    return payload


async def verify_cognito_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    settings: Settings = Depends(get_settings),
) -> dict:
    """FastAPI dependency: validate Cognito JWT from Authorization header."""
    if credentials is None:
        raise _http_401("Missing Authorization header")
    try:
        return await _decode_token(credentials.credentials, settings)
    except ValueError as exc:
        raise _http_401(str(exc))
    except Exception:
        raise _http_401("Token verification failed")


async def verify_ws_token(token: Optional[str], settings: Settings) -> dict:
    """Verify a Cognito JWT passed as a query parameter for WebSocket connections.

    WebSocket handshake cannot raise HTTPException cleanly; callers should
    close the socket with code 4001 on ValueError.
    """
    if not token:
        raise ValueError("Missing token query parameter")
    return await _decode_token(token, settings)
