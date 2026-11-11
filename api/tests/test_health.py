from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


def test_health_endpoint_returns_ok_status() -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["content-type"] == "application/json"


def test_health_endpoint_uses_expected_operation_id() -> None:
    assert (
        client.get("/openapi.json").json()["paths"]["/api/v1/health"]["get"]["operationId"]
        == "health_check_api_v1_health_get"
    )
