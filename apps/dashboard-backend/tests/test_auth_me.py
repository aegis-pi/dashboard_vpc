from deps.rbac import Principal, get_current_principal
from main import app


def test_auth_me_returns_navigation_permissions(client):
    app.dependency_overrides[get_current_principal] = lambda: Principal(
        user_id="factory-user",
        cognito_sub="factory-sub",
        email="factory@example.com",
        display_name="Factory Admin",
        global_role="factory_admin",
        can_view_system=True,
        status="active",
        allowed_factory_ids=frozenset({"factory-a"}),
    )
    try:
        r = client.get("/auth/me")
    finally:
        app.dependency_overrides.pop(get_current_principal, None)

    assert r.status_code == 200
    assert r.json() == {
        "id": "factory-user",
        "email": "factory@example.com",
        "display_name": "Factory Admin",
        "global_role": "factory_admin",
        "can_manage_users": False,
        "can_view_system": True,
        "allowed_factory_ids": ["factory-a"],
    }
