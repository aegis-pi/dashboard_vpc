from deps.rbac import Principal, get_current_principal
from main import app
from services import s3


def _factory_a_principal() -> Principal:
    return Principal(
        user_id="user-factory-a-admin",
        cognito_sub="seed-factory-a-admin",
        email="factory-a-admin@example.com",
        display_name="FACTORY A 관리자",
        global_role="factory_admin",
        can_view_system=False,
        status="active",
        allowed_factory_ids=frozenset({"factory-a"}),
    )


def _super_admin_principal() -> Principal:
    return Principal(
        user_id="test-user",
        cognito_sub="test-user",
        email="test@example.com",
        display_name="Test User",
        global_role="super_admin",
        can_view_system=True,
        status="active",
        allowed_factory_ids=None,
    )


def test_list_factories_filters_to_authorized_factories(client, ddb_mock):
    app.dependency_overrides[get_current_principal] = _factory_a_principal
    try:
        r = client.get("/factories")
    finally:
        app.dependency_overrides[get_current_principal] = _super_admin_principal

    assert r.status_code == 200
    assert [item["factory_id"] for item in r.json()] == ["factory-a"]


def test_list_factories_cache_does_not_bypass_authorization(client, ddb_mock):
    assert len(client.get("/factories").json()) > 1

    app.dependency_overrides[get_current_principal] = _factory_a_principal
    try:
        r = client.get("/factories")
    finally:
        app.dependency_overrides[get_current_principal] = _super_admin_principal

    assert r.status_code == 200
    assert [item["factory_id"] for item in r.json()] == ["factory-a"]


def test_get_factory_rejects_unauthorized_factory(client, ddb_mock):
    app.dependency_overrides[get_current_principal] = _factory_a_principal
    try:
        r = client.get("/factories/factory-c")
    finally:
        app.dependency_overrides[get_current_principal] = _super_admin_principal

    assert r.status_code == 403
    assert r.json()["detail"] == "Factory access denied"


def test_get_factory_history_rejects_unauthorized_factory(client, ddb_mock):
    app.dependency_overrides[get_current_principal] = _factory_a_principal
    try:
        r = client.get("/factories/factory-c/history?window=1h")
    finally:
        app.dependency_overrides[get_current_principal] = _super_admin_principal

    assert r.status_code == 403
    assert r.json()["detail"] == "Factory access denied"


def test_list_reports_filters_to_authorized_factories(client, monkeypatch):
    async def _list_reports():
        return [
            {"report_date": "2026-06-03", "factory_id": "factory-a"},
            {"report_date": "2026-06-03", "factory_id": "factory-c"},
        ]

    monkeypatch.setattr(s3, "list_daily_reports", _list_reports)
    app.dependency_overrides[get_current_principal] = _factory_a_principal
    try:
        r = client.get("/reports")
    finally:
        app.dependency_overrides[get_current_principal] = _super_admin_principal

    assert r.status_code == 200
    assert r.json() == [{"report_date": "2026-06-03", "factory_id": "factory-a"}]


def test_get_report_rejects_unauthorized_factory(client, monkeypatch):
    async def _get_report(report_date, factory_id):
        return "# report"

    monkeypatch.setattr(s3, "get_report_markdown", _get_report)
    app.dependency_overrides[get_current_principal] = _factory_a_principal
    try:
        r = client.get("/reports/2026-06-03/factory-c")
    finally:
        app.dependency_overrides[get_current_principal] = _super_admin_principal

    assert r.status_code == 403
    assert r.json()["detail"] == "Factory access denied"
