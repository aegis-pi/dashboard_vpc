"""SQLAlchemy async session factory (RDS PostgreSQL skeleton).

Production: DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db
Tests: DATABASE_URL=sqlite+aiosqlite:///:memory:

Rationale for SQLite in tests: testcontainers requires Docker and significantly
increases CI spin-up time.  Since no SQL queries are exercised in Phase 1 Step 6
(metadata schema is defined in Step 7+), SQLite async is sufficient as a
connection skeleton validator.  Replace with a real PostgreSQL testcontainer
when SQL queries are added.
"""
from typing import AsyncGenerator

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool

from config import Settings, get_settings


class Base(DeclarativeBase):
    pass


_engines: dict = {}
_factories: dict = {}


def _engine(url: str):
    if url not in _engines:
        kwargs = {"echo": False, "future": True}
        if url == "sqlite+aiosqlite:///:memory:":
            kwargs["connect_args"] = {"check_same_thread": False}
            kwargs["poolclass"] = StaticPool
        _engines[url] = create_async_engine(url, **kwargs)
    return _engines[url]


def _factory(url: str):
    if url not in _factories:
        _factories[url] = sessionmaker(
            _engine(url), class_=AsyncSession, expire_on_commit=False
        )
    return _factories[url]


async def get_db(
    settings: Settings = Depends(get_settings),
) -> AsyncGenerator[AsyncSession, None]:
    async with _factory(settings.database_url)() as session:
        yield session
