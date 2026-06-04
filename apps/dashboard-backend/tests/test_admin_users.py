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
        can_view_system=True,
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
        can_view_system=False,
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
                    can_view_system=False,
                    status="active",
                ),
                AppUser(
                    id="user-disabled",
                    cognito_sub="disabled-sub",
                    email="disabled@example.com",
                    display_name="Disabled User",
                    global_role="factory_admin",
                    can_view_system=False,
                    status="disabled",
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
    assert "user-disabled" not in users
    assert users["user-existing"] == {
        "id": "user-existing",
        "cognito_sub": "existing-sub",
        "email": "existing@example.com",
        "display_name": "Existing User",
        "global_role": "factory_admin",
        "can_view_system": False,
        "status": "active",
        "factories": [{"factory_id": "factory-a", "role": "admin"}],
    }
    assert users["cognito-test-user"]["global_role"] == "super_admin"
    assert users["cognito-test-user-sub"]["global_role"] == "super_admin"


def test_admin_list_users_orders_global_admins_first(client):
    r = client.get("/admin/users")

    assert r.status_code == 200
    roles = [user["global_role"] for user in r.json()]
    assert roles[:2] == ["super_admin", "super_admin"]
    assert roles[-1] == "factory_admin"


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
            "can_view_system": True,
            "factories": [{"factory_id": "factory-c", "role": "admin"}],
        },
    )

    assert r.status_code == 201
    body = r.json()
    assert calls == [("factory-c-admin@example.com", "C 관리자")]
    assert body["cognito_sub"] == "new-cognito-sub"
    assert body["can_view_system"] is True
    assert body["factories"] == [{"factory_id": "factory-c", "role": "admin"}]


def test_admin_create_factory_admin_normalizes_factory_roles_to_admin(client, monkeypatch):
    monkeypatch.setattr(cognito_admin, "create_user", lambda email, display_name: "viewer-role-sub")

    r = client.post(
        "/admin/users",
        json={
            "email": "viewer-role@example.com",
            "display_name": "Viewer Role",
            "global_role": "factory_admin",
            "factories": [{"factory_id": "factory-b", "role": "viewer"}],
        },
    )

    assert r.status_code == 201
    assert r.json()["factories"] == [{"factory_id": "factory-b", "role": "admin"}]


def test_admin_create_user_replaces_stale_disabled_user(client, monkeypatch):
    calls: list[tuple[str, str]] = []
    deleted: list[tuple[str, bool]] = []

    def _create_user(email, display_name):
        calls.append((email, display_name))
        return "new-disabled-sub"

    def _delete_user(email, *, ignore_not_found=False):
        deleted.append((email, ignore_not_found))

    monkeypatch.setattr(cognito_admin, "create_user", _create_user)
    monkeypatch.setattr(cognito_admin, "delete_user", _delete_user)

    r = client.post(
        "/admin/users",
        json={
            "email": "disabled@example.com",
            "display_name": "Restored User",
            "global_role": "factory_admin",
            "factories": [{"factory_id": "factory-b", "role": "admin"}],
        },
    )

    assert r.status_code == 201
    body = r.json()
    assert deleted == [("disabled@example.com", True)]
    assert calls == [("disabled@example.com", "Restored User")]
    assert body["email"] == "disabled@example.com"
    assert body["status"] == "active"
    assert body["cognito_sub"] == "new-disabled-sub"
    assert body["factories"] == [{"factory_id": "factory-b", "role": "admin"}]


def test_admin_create_user_rejects_removed_global_roles(client, monkeypatch):
    monkeypatch.setattr(cognito_admin, "create_user", lambda email, display_name: "unused")

    r = client.post(
        "/admin/users",
        json={
            "email": "viewer@example.com",
            "display_name": "Viewer",
            "global_role": "viewer",
            "factories": [],
        },
    )

    assert r.status_code == 422


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
        {"factory_id": "factory-b", "role": "admin"},
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


def test_admin_delete_user_removes_cognito_and_rds_user(client, monkeypatch):
    calls = []

    def _delete_user(email):
        calls.append(email)

    monkeypatch.setattr(cognito_admin, "delete_user", _delete_user)

    r = client.delete("/admin/users/user-existing")

    assert r.status_code == 200
    assert r.json() == {"status": "deleted", "id": "user-existing"}
    assert calls == ["existing@example.com"]

    list_response = client.get("/admin/users")
    assert list_response.status_code == 200
    assert "user-existing" not in {user["id"] for user in list_response.json()}
