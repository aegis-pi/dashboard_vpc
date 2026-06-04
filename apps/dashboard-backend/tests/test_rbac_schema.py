import asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from config import get_settings
from db.models import AppUser, Factory, UserFactoryAccess
from db.session import Base, _engine
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
