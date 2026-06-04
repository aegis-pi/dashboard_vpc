from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import Settings, get_settings
from db.models import AppUser, GlobalRole, UserFactoryAccess, UserStatus
from db.session import get_db
from deps.auth import verify_cognito_token


@dataclass(frozen=True)
class Principal:
    user_id: str
    cognito_sub: str
    email: str
    display_name: str
    global_role: str
    status: str
    allowed_factory_ids: frozenset[str] | None

    @property
    def can_access_all_factories(self) -> bool:
        return self.allowed_factory_ids is None

    @property
    def can_manage_users(self) -> bool:
        return self.global_role in {GlobalRole.SUPER_ADMIN.value, GlobalRole.ORG_ADMIN.value}


def _bootstrap_subs(settings: Settings) -> set[str]:
    return {
        sub.strip()
        for sub in settings.rbac_bootstrap_super_admin_subs.split(",")
        if sub.strip()
    }


def _bootstrap_principal(claims: dict, settings: Settings) -> Principal | None:
    sub = str(claims.get("sub") or "")
    if not sub or sub not in _bootstrap_subs(settings):
        return None
    email = str(claims.get("email") or f"{sub}@bootstrap.local")
    return Principal(
        user_id=sub,
        cognito_sub=sub,
        email=email,
        display_name=email,
        global_role=GlobalRole.SUPER_ADMIN.value,
        status=UserStatus.ACTIVE.value,
        allowed_factory_ids=None,
    )


def can_access_factory(principal: Principal, factory_id: str) -> bool:
    return principal.can_access_all_factories or factory_id in (principal.allowed_factory_ids or set())


def filter_factory_ids(principal: Principal, factory_ids: Iterable[str]) -> list[str]:
    if principal.can_access_all_factories:
        return list(factory_ids)
    allowed = principal.allowed_factory_ids or frozenset()
    return [factory_id for factory_id in factory_ids if factory_id in allowed]


async def principal_from_claims(
    claims: dict,
    session: AsyncSession,
    settings: Settings,
) -> Principal:
    bootstrap = _bootstrap_principal(claims, settings)
    if bootstrap is not None:
        return bootstrap

    sub = str(claims.get("sub") or "")
    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Cognito sub")

    result = await session.execute(select(AppUser).where(AppUser.cognito_sub == sub))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is not provisioned")
    if user.status != UserStatus.ACTIVE.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is disabled")

    allowed_factory_ids: frozenset[str] | None = None
    if user.global_role not in {GlobalRole.SUPER_ADMIN.value, GlobalRole.ORG_ADMIN.value}:
        access_result = await session.execute(
            select(UserFactoryAccess.factory_id).where(UserFactoryAccess.user_id == user.id)
        )
        allowed_factory_ids = frozenset(access_result.scalars().all())

    return Principal(
        user_id=user.id,
        cognito_sub=user.cognito_sub,
        email=user.email,
        display_name=user.display_name,
        global_role=user.global_role,
        status=user.status,
        allowed_factory_ids=allowed_factory_ids,
    )


async def get_current_principal(
    claims: dict = Depends(verify_cognito_token),
    session: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Principal:
    return await principal_from_claims(claims, session, settings)


def require_factory_access(principal: Principal, factory_id: str) -> None:
    if not can_access_factory(principal, factory_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Factory access denied")


def require_user_admin(principal: Principal) -> None:
    if not principal.can_manage_users:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User admin access denied")
