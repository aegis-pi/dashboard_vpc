from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import AppUser, Factory, FactoryRole, GlobalRole, UserFactoryAccess, UserStatus


@dataclass(frozen=True)
class SeedUser:
    id: str
    cognito_sub: str
    email: str
    display_name: str
    global_role: str
    can_view_system: bool
    factories: tuple[tuple[str, str], ...]


DEFAULT_FACTORIES: tuple[tuple[str, str], ...] = (
    ("factory-a", "Factory A"),
    ("factory-b", "Factory B"),
    ("factory-c", "Factory C"),
)

DEFAULT_USERS: tuple[SeedUser, ...] = (
    SeedUser(
        id="user-head-admin",
        cognito_sub="seed-head-admin",
        email="head-admin@example.com",
        display_name="본사 관리자",
        global_role=GlobalRole.SUPER_ADMIN.value,
        can_view_system=True,
        factories=(),
    ),
    SeedUser(
        id="user-factory-a-admin",
        cognito_sub="seed-factory-a-admin",
        email="factory-a-admin@example.com",
        display_name="FACTORY A 관리자",
        global_role=GlobalRole.FACTORY_ADMIN.value,
        can_view_system=False,
        factories=(("factory-a", FactoryRole.ADMIN.value),),
    ),
    SeedUser(
        id="user-factory-ab-admin",
        cognito_sub="seed-factory-ab-admin",
        email="factory-ab-admin@example.com",
        display_name="A-B 관리자",
        global_role=GlobalRole.FACTORY_ADMIN.value,
        can_view_system=True,
        factories=(("factory-a", FactoryRole.ADMIN.value), ("factory-b", FactoryRole.ADMIN.value)),
    ),
    SeedUser(
        id="user-factory-ac-admin",
        cognito_sub="seed-factory-ac-admin",
        email="factory-ac-admin@example.com",
        display_name="A-C 관리자",
        global_role=GlobalRole.FACTORY_ADMIN.value,
        can_view_system=False,
        factories=(("factory-a", FactoryRole.ADMIN.value), ("factory-c", FactoryRole.ADMIN.value)),
    ),
    SeedUser(
        id="user-factory-c-admin",
        cognito_sub="seed-factory-c-admin",
        email="factory-c-admin@example.com",
        display_name="C 관리자",
        global_role=GlobalRole.FACTORY_ADMIN.value,
        can_view_system=False,
        factories=(("factory-c", FactoryRole.ADMIN.value),),
    ),
)


async def seed_rbac_reference_data(
    session: AsyncSession,
    factories: tuple[tuple[str, str], ...] = DEFAULT_FACTORIES,
    users: tuple[SeedUser, ...] = DEFAULT_USERS,
) -> None:
    for factory_id, display_name in factories:
        factory = await session.get(Factory, factory_id)
        if factory is None:
            session.add(Factory(factory_id=factory_id, display_name=display_name))
        else:
            factory.display_name = display_name
            factory.is_active = True

    for seed in users:
        result = await session.execute(select(AppUser).where(AppUser.id == seed.id))
        user = result.scalar_one_or_none()
        if user is None:
            user = AppUser(
                id=seed.id,
                cognito_sub=seed.cognito_sub,
                email=seed.email,
                display_name=seed.display_name,
                global_role=seed.global_role,
                can_view_system=seed.can_view_system,
                status=UserStatus.ACTIVE.value,
            )
            session.add(user)
        else:
            user.cognito_sub = seed.cognito_sub
            user.email = seed.email
            user.display_name = seed.display_name
            user.global_role = seed.global_role
            user.can_view_system = seed.can_view_system
            user.status = UserStatus.ACTIVE.value

        for factory_id, role in seed.factories:
            access_result = await session.execute(
                select(UserFactoryAccess).where(
                    UserFactoryAccess.user_id == seed.id,
                    UserFactoryAccess.factory_id == factory_id,
                )
            )
            access = access_result.scalar_one_or_none()
            if access is None:
                session.add(UserFactoryAccess(user_id=seed.id, factory_id=factory_id, role=role))
            else:
                access.role = role

    await session.commit()
