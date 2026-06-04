from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import AppUser, AuditLog, Factory, FactoryRole, GlobalRole, UserFactoryAccess, UserStatus
from db.session import get_db
from deps.rbac import Principal, get_current_principal, require_user_admin
from services import cognito_admin

router = APIRouter(prefix="/admin/users", tags=["admin-users"])


class FactoryAccessIn(BaseModel):
    factory_id: str = Field(min_length=1, max_length=64)
    role: str = Field(pattern="^(admin|viewer)$")


class UserCreateIn(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=255)
    display_name: str = Field(min_length=1, max_length=120)
    global_role: str = Field(pattern="^(super_admin|factory_admin)$")
    can_view_system: bool = False
    factories: list[FactoryAccessIn] = Field(default_factory=list)


class UserUpdateIn(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    global_role: str | None = Field(default=None, pattern="^(super_admin|factory_admin)$")
    can_view_system: bool | None = None
    factories: list[FactoryAccessIn] | None = None


def _serialize_user(user: AppUser, access: list[UserFactoryAccess]) -> dict:
    return {
        "id": user.id,
        "cognito_sub": user.cognito_sub,
        "email": user.email,
        "display_name": user.display_name,
        "global_role": user.global_role,
        "can_view_system": bool(user.can_view_system),
        "status": user.status,
        "factories": [
            {"factory_id": row.factory_id, "role": row.role}
            for row in sorted(access, key=lambda item: item.factory_id)
        ],
    }


async def _access_by_user(session: AsyncSession, user_ids: list[str]) -> dict[str, list[UserFactoryAccess]]:
    if not user_ids:
        return {}
    result = await session.execute(
        select(UserFactoryAccess).where(UserFactoryAccess.user_id.in_(user_ids))
    )
    grouped: dict[str, list[UserFactoryAccess]] = {user_id: [] for user_id in user_ids}
    for row in result.scalars().all():
        grouped.setdefault(row.user_id, []).append(row)
    return grouped


async def _replace_access(
    session: AsyncSession,
    user_id: str,
    factories: list[FactoryAccessIn],
) -> None:
    await session.execute(delete(UserFactoryAccess).where(UserFactoryAccess.user_id == user_id))
    for access in factories:
        session.add(
            UserFactoryAccess(
                user_id=user_id,
                factory_id=access.factory_id,
                role=access.role or FactoryRole.VIEWER.value,
            )
        )


async def _ensure_factories_exist(session: AsyncSession, factories: list[FactoryAccessIn]) -> None:
    factory_ids = {access.factory_id for access in factories}
    if not factory_ids:
        return
    result = await session.execute(select(Factory.factory_id).where(Factory.factory_id.in_(factory_ids)))
    existing = set(result.scalars().all())
    missing = sorted(factory_ids - existing)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown factories: {', '.join(missing)}",
        )


def _validate_access_for_role(global_role: str, factories: list[FactoryAccessIn]) -> None:
    if global_role in {GlobalRole.SUPER_ADMIN.value, GlobalRole.ORG_ADMIN.value} and factories:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Global administrators must not have per-factory grants",
        )


def _normalize_access_for_role(global_role: str, factories: list[FactoryAccessIn]) -> list[FactoryAccessIn]:
    if global_role == GlobalRole.FACTORY_ADMIN.value:
        return [
            FactoryAccessIn(factory_id=access.factory_id, role=FactoryRole.ADMIN.value)
            for access in factories
        ]
    return factories


@router.get("")
async def list_users(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db),
):
    require_user_admin(principal)
    result = await session.execute(select(AppUser).order_by(AppUser.email))
    users = result.scalars().all()
    access = await _access_by_user(session, [user.id for user in users])
    return [_serialize_user(user, access.get(user.id, [])) for user in users]


@router.post("", status_code=201)
async def create_user(
    payload: UserCreateIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db),
):
    require_user_admin(principal)
    factories = _normalize_access_for_role(payload.global_role, payload.factories)
    _validate_access_for_role(payload.global_role, factories)
    await _ensure_factories_exist(session, factories)

    exists = await session.execute(select(AppUser).where(AppUser.email == str(payload.email)))
    if exists.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="User already exists")

    try:
        cognito_sub = cognito_admin.create_user(str(payload.email), payload.display_name)
    except cognito_admin.CognitoAdminError as exc:
        raise HTTPException(status_code=502, detail="Cognito user creation failed") from exc

    user = AppUser(
        id=f"user-{uuid4().hex}",
        cognito_sub=cognito_sub,
        email=str(payload.email),
        display_name=payload.display_name,
        global_role=payload.global_role,
        can_view_system=payload.global_role == GlobalRole.SUPER_ADMIN.value or payload.can_view_system,
        status=UserStatus.ACTIVE.value,
    )
    session.add(user)
    await session.flush()
    await _replace_access(session, user.id, factories)
    session.add(
        AuditLog(
            actor_user_id=principal.user_id,
            action="user.create",
            target_type="app_user",
            target_id=user.id,
        )
    )
    await session.commit()

    access = await _access_by_user(session, [user.id])
    return _serialize_user(user, access.get(user.id, []))


@router.patch("/{user_id}")
async def update_user(
    user_id: str,
    payload: UserUpdateIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db),
):
    require_user_admin(principal)
    user = await session.get(AppUser, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    next_global_role = payload.global_role or user.global_role
    next_factories = payload.factories
    if next_factories is None and next_global_role in {GlobalRole.SUPER_ADMIN.value, GlobalRole.ORG_ADMIN.value}:
        next_factories = []
    elif next_factories is None:
        existing = await _access_by_user(session, [user.id])
        next_factories = [
            FactoryAccessIn(factory_id=row.factory_id, role=row.role)
            for row in existing.get(user.id, [])
        ]
    next_factories = _normalize_access_for_role(next_global_role, next_factories)
    _validate_access_for_role(next_global_role, next_factories)
    await _ensure_factories_exist(session, next_factories)

    if payload.display_name is not None:
        user.display_name = payload.display_name
    if payload.global_role is not None:
        user.global_role = payload.global_role
    if payload.can_view_system is not None:
        user.can_view_system = next_global_role == GlobalRole.SUPER_ADMIN.value or payload.can_view_system
    elif next_global_role == GlobalRole.SUPER_ADMIN.value:
        user.can_view_system = True
    if payload.factories is not None or next_global_role in {GlobalRole.SUPER_ADMIN.value, GlobalRole.ORG_ADMIN.value}:
        await _replace_access(session, user.id, next_factories)

    session.add(
        AuditLog(
            actor_user_id=principal.user_id,
            action="user.update",
            target_type="app_user",
            target_id=user.id,
        )
    )
    await session.commit()

    access = await _access_by_user(session, [user.id])
    return _serialize_user(user, access.get(user.id, []))


@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_db),
):
    require_user_admin(principal)
    user = await session.get(AppUser, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        cognito_admin.disable_user(user.email)
    except cognito_admin.CognitoAdminError as exc:
        raise HTTPException(status_code=502, detail="Cognito user disable failed") from exc

    user.status = UserStatus.DISABLED.value
    await session.execute(delete(UserFactoryAccess).where(UserFactoryAccess.user_id == user.id))
    session.add(
        AuditLog(
            actor_user_id=principal.user_id,
            action="user.disable",
            target_type="app_user",
            target_id=user.id,
        )
    )
    await session.commit()

    return {"status": "disabled", "id": user.id}
