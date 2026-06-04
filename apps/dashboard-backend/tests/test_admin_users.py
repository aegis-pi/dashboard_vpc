import asyncio

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

from config import get_settings
from db.models import AppUser, Factory, UserFactoryAccess
from db.session import Base, _engine
from deps.rbac import Principal, get_current_principal
from main import app
from services import cognito_admin


def _super_admin_principal() -> Principal:
    return Principal(
        user_id="admin-user",
        cognito_sub="admin-sub",
        email="admin@example.com",
        display_name="Admin",
        global_role="super_admin",
        status="active",
        allowed_factory_ids=None,
    )


def _factory_admin_principal() -> Principal:
    return Principal(
        user_id="factory-user",
        cognito_sub="factory-sub",
        email="factory@example.com",
        display_name="Factory Admin",
        global_role="factory_admin",
        status="active",
        allowed_factory_ids=frozenset({"factory-a"}),
    )


async def _reset_admin_db():
    engine = _engine(get_settings().database_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        session.add_all(
            [
                Factory(factory_id="factory-a", display_name="Factory A"),
                Factory(factory_id="factory-b", display_name="Factory B"),
                Factory(factory_id="factory-c", display_name="Factory C"),
                AppUser(
                    id="user-existing",
                    cognito_sub="existing-sub",
                    email="existing@example.com",
                    display_name="Existing User",
                    global_role="factory_admin",
                    status="active",
                ),
                UserFactoryAccess(user_id="user-existing", factory_id="factory-a", role="admin"),
            ]
        )
        await session.commit()


@pytest.fixture(autouse=True)
def admin_db():
    asyncio.run(_reset_admin_db())


def test_admin_list_users_requires_global_admin(client):
    app.dependency_overrides[get_current_principal] = _factory_admin_principal
    try:
        r = client.get("/admin/users")
    finally:
        app.dependency_overrides[get_current_principal] = _super_admin_principal

    assert r.status_code == 403
    assert r.json()["detail"] == "User admin access denied"


def test_admin_list_users_returns_factory_access(client):
    r = client.get("/admin/users")

    assert r.status_code == 200
    users = {user["id"]: user for user in r.json()}
    assert users["user-existing"] == {
        "id": "user-existing",
        "cognito_sub": "existing-sub",
        "email": "existing@example.com",
        "display_name": "Existing User",
        "global_role": "factory_admin",
        "status": "active",
        "factories": [{"factory_id": "factory-a", "role": "admin"}],
    }
    assert users["cognito-test-user"]["global_role"] == "super_admin"
    assert users["cognito-test-user-sub"]["global_role"] == "super_admin"


def test_admin_create_user_calls_cognito_and_stores_access(client, monkeypatch):
    calls = []

    def _create_user(email, display_name):
        calls.append((email, display_name))
        return "new-cognito-sub"

    monkeypatch.setattr(cognito_admin, "create_user", _create_user)

    r = client.post(
        "/admin/users",
        json={
            "email": "factory-c-admin@example.com",
            "display_name": "C 관리자",
            "global_role": "factory_admin",
            "factories": [{"factory_id": "factory-c", "role": "admin"}],
        },
    )

    assert r.status_code == 201
    body = r.json()
    assert calls == [("factory-c-admin@example.com", "C 관리자")]
    assert body["cognito_sub"] == "new-cognito-sub"
    assert body["factories"] == [{"factory_id": "factory-c", "role": "admin"}]


def test_admin_update_user_replaces_factory_access(client):
    r = client.patch(
        "/admin/users/user-existing",
        json={
            "display_name": "A-B 관리자",
            "factories": [
                {"factory_id": "factory-a", "role": "admin"},
                {"factory_id": "factory-b", "role": "viewer"},
            ],
        },
    )

    assert r.status_code == 200
    body = r.json()
    assert body["display_name"] == "A-B 관리자"
    assert body["factories"] == [
        {"factory_id": "factory-a", "role": "admin"},
        {"factory_id": "factory-b", "role": "viewer"},
    ]


def test_admin_update_user_to_global_admin_clears_factory_access(client):
    r = client.patch(
        "/admin/users/user-existing",
        json={"global_role": "super_admin"},
    )

    assert r.status_code == 200
    body = r.json()
    assert body["global_role"] == "super_admin"
    assert body["factories"] == []


def test_admin_create_user_rejects_unknown_factory(client, monkeypatch):
    monkeypatch.setattr(cognito_admin, "create_user", lambda email, display_name: "unused")

    r = client.post(
        "/admin/users",
        json={
            "email": "unknown-factory@example.com",
            "display_name": "Unknown Factory User",
            "global_role": "factory_admin",
            "factories": [{"factory_id": "factory-z", "role": "admin"}],
        },
    )

    assert r.status_code == 400
    assert r.json()["detail"] == "Unknown factories: factory-z"


def test_admin_delete_user_disables_cognito_and_rds_user(client, monkeypatch):
    calls = []

    def _disable_user(email):
        calls.append(email)

    monkeypatch.setattr(cognito_admin, "disable_user", _disable_user)

    r = client.delete("/admin/users/user-existing")

    assert r.status_code == 200
    assert r.json() == {"status": "disabled", "id": "user-existing"}
    assert calls == ["existing@example.com"]
