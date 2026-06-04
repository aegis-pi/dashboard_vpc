from __future__ import annotations

from sqlalchemy import text

from config import Settings, get_settings
from db.models import Factory
from db.session import Base, _engine, _factory


def _configured_factory_ids(settings: Settings) -> list[str]:
    return [
        factory_id.strip()
        for factory_id in settings.dashboard_factory_ids.split(",")
        if factory_id.strip()
    ]


async def ensure_metadata_schema(settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    if not settings.database_auto_create_metadata:
        return

    engine = _engine(settings.database_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    Session = _factory(settings.database_url)
    async with Session() as session:
        for factory_id in _configured_factory_ids(settings):
            factory = await session.get(Factory, factory_id)
            display_name = factory_id.replace("-", " ").title()
            if factory is None:
                session.add(Factory(factory_id=factory_id, display_name=display_name))
            else:
                factory.display_name = factory.display_name or display_name
                factory.is_active = True
        await session.commit()


async def check_metadata_db(settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    engine = _engine(settings.database_url)
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
