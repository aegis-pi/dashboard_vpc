from __future__ import annotations

from sqlalchemy import inspect, select, text

from config import Settings, get_settings
from db.models import AppUser, Factory, GlobalRole, UserStatus
from db.session import Base, _engine, _factory
from services.cognito_admin import CognitoAdminError, get_user_profile


def _configured_factory_ids(settings: Settings) -> list[str]:
    return [
        factory_id.strip()
        for factory_id in settings.dashboard_factory_ids.split(",")
        if factory_id.strip()
    ]


def _bootstrap_super_admin_subs(settings: Settings) -> list[str]:
    return [
        sub.strip()
        for sub in settings.rbac_bootstrap_super_admin_subs.split(",")
        if sub.strip()
    ]


def _fallback_bootstrap_email(sub: str) -> str:
    return f"{sub}@bootstrap.local"


def _bootstrap_user_id(sub: str) -> str:
    return f"cognito-{sub}"


async def ensure_metadata_schema(settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    if not settings.database_auto_create_metadata:
        return

    engine = _engine(settings.database_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        def _ensure_system_column(sync_conn):
            columns = {column["name"] for column in inspect(sync_conn).get_columns("app_user")}
            if "can_view_system" not in columns:
                sync_conn.execute(text("ALTER TABLE app_user ADD COLUMN can_view_system BOOLEAN NOT NULL DEFAULT false"))

        await conn.run_sync(_ensure_system_column)

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

        for sub in _bootstrap_super_admin_subs(settings):
            try:
                profile = get_user_profile(sub)
                email = profile.get("email") or _fallback_bootstrap_email(sub)
                display_name = profile.get("display_name") or email
            except CognitoAdminError:
                email = _fallback_bootstrap_email(sub)
                display_name = email

            result = await session.execute(select(AppUser).where(AppUser.cognito_sub == sub))
            user = result.scalar_one_or_none()
            if user is None:
                user = AppUser(
                    id=_bootstrap_user_id(sub),
                    cognito_sub=sub,
                    email=email,
                    display_name=display_name,
                    global_role=GlobalRole.SUPER_ADMIN.value,
                    can_view_system=True,
                    status=UserStatus.ACTIVE.value,
                )
                session.add(user)
            else:
                user.email = email
                user.display_name = display_name
                user.global_role = GlobalRole.SUPER_ADMIN.value
                user.can_view_system = True
                user.status = UserStatus.ACTIVE.value

        await session.commit()


async def check_metadata_db(settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    engine = _engine(settings.database_url)
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
