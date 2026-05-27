def test_cors_preflight_allows_dashboard_origin(client):
    r = client.options(
        "/factories",
        headers={
            "Origin": "https://dashboard.aegis-pi.cloud",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )

    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "https://dashboard.aegis-pi.cloud"
    assert r.headers["access-control-allow-credentials"] == "true"


def test_cors_does_not_emit_wildcard_with_credentials(client):
    r = client.get(
        "/healthz",
        headers={"Origin": "https://dashboard.aegis-pi.cloud"},
    )

    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "https://dashboard.aegis-pi.cloud"
    assert r.headers["access-control-allow-origin"] != "*"
