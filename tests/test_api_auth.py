from fastapi.testclient import TestClient

from aci.app import app
from aci.config import settings


def test_api_routes_require_bearer_token_when_configured(monkeypatch):
    monkeypatch.setattr(settings, "api_token", "test-token-for-ci")
    client = TestClient(app)

    denied = client.post("/api/memory", json={"content": "private note"})
    assert denied.status_code == 401

    allowed = client.post(
        "/api/memory",
        json={"content": "private note"},
        headers={"Authorization": "Bearer test-token-for-ci"},
    )
    assert allowed.status_code == 200
    assert allowed.json() == {"saved": True}
