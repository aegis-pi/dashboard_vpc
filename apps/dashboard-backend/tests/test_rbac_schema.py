import asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from config import get_settings
from db.models import AppUser, Factory, UserFactoryAccess
from db.session import Base, _engine
from services.metadata import ensure_metadata_schema
from services.rbac_seed import seed_rbac_reference_data


def test_rbac_schema_and_seed_data_are_idempotent():
    asyncio.run(_assert_rbac_schema_and_seed_data_are_idempotent())


async def _assert_rbac_schema_and_seed_data_are_idempotent():
    engine = _engine(get_settings().database_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        await seed_rbac_reference_data(session)
        await seed_rbac_reference_data(session)

        factories = (await session.execute(select(Factory).order_by(Factory.factory_id))).scalars().all()
        users = (await session.execute(select(AppUser).order_by(AppUser.id))).scalars().all()
        access = (
            await session.execute(
                select(UserFactoryAccess).order_by(
                    UserFactoryAccess.user_id,
                    UserFactoryAccess.factory_id,
                )
            )
        ).scalars().all()

    assert [f.factory_id for f in factories] == ["factory-a", "factory-b", "factory-c"]
    assert len(users) == 5
    assert len(access) == 6
    assert {
        (row.user_id, row.factory_id, row.role)
        for row in access
    } == {
        ("user-factory-a-admin", "factory-a", "admin"),
        ("user-factory-ab-admin", "factory-a", "admin"),
        ("user-factory-ab-admin", "factory-b", "admin"),
        ("user-factory-ac-admin", "factory-a", "admin"),
        ("user-factory-ac-admin", "factory-c", "admin"),
        ("user-factory-c-admin", "factory-c", "admin"),
    }


def test_metadata_sync_persists_bootstrap_super_admins(monkeypatch):
    def _profile(sub: str) -> dict:
        return {
            "email": f"{sub}@example.com",
            "display_name": f"Admin {sub}",
        }

    monkeypatch.setattr("services.metadata.get_user_profile", _profile)

    asyncio.run(_assert_metadata_sync_persists_bootstrap_super_admins())


async def _assert_metadata_sync_persists_bootstrap_super_admins():
    settings = get_settings()
    engine = _engine(settings.database_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await ensure_metadata_schema(settings)
    await ensure_metadata_schema(settings)

    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        users = (
            await session.execute(
                select(AppUser).where(AppUser.cognito_sub.in_(["test-user", "test-user-sub"]))
            )
        ).scalars().all()

    assert {
        (user.cognito_sub, user.email, user.display_name, user.global_role, user.can_view_system, user.status)
        for user in users
    } == {
        ("test-user", "test-user@example.com", "Admin test-user", "super_admin", True, "active"),
        ("test-user-sub", "test-user-sub@example.com", "Admin test-user-sub", "super_admin", True, "active"),
    }
