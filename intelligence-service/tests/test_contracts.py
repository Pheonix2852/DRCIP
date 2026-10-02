"""Contract tests for the DRCIP FastAPI Intelligence Service.

These pin the /health, /version and /internal/v1/* provider envelopes so that
the Node client's provider-independence contract stays stable.
"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_envelope():
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "healthy"
    assert isinstance(body["timestamp"], str) and body["timestamp"]


def test_version_envelope():
    res = client.get("/version")
    assert res.status_code == 200
    body = res.json()
    assert body["service"] == "drcip-intelligence"
    assert body["version"] == "1.0.0"
    assert set(body["modules"]) == {"severity", "demand", "optimization", "rag"}
    assert set(body["models"]) == {"severity", "demand", "optimization", "rag"}


def test_severity_prediction_success():
    res = client.post(
        "/internal/v1/predict/severity",
        json={
            "incident_id": "INC-1",
            "description": "Flooding with many people affected",
            "people_affected": 15,
            "disaster_type": "FLOOD",
            "latitude": 22.5726,
            "longitude": 88.3639,
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "SUCCESS"
    assert body["severity"] in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
    assert body["incident_id"] == "INC-1"
    assert body["confidence"] == 0.85
    assert body["model_version"] == "severity-v1-mock"
    assert body["prediction_id"].startswith("PRED-")
    assert isinstance(body["explanation"], list)


def test_severity_prediction_heuristic():
    low = client.post(
        "/internal/v1/predict/severity",
        json={
            "incident_id": "INC-L",
            "description": "Minor incident",
            "people_affected": 1,
            "disaster_type": "MEDICAL_EMERGENCY",
            "latitude": 10,
            "longitude": 10,
        },
    ).json()
    high = client.post(
        "/internal/v1/predict/severity",
        json={
            "incident_id": "INC-H",
            "description": "Major incident",
            "people_affected": 12,
            "disaster_type": "FLOOD",
            "latitude": 10,
            "longitude": 10,
        },
    ).json()
    assert low["severity"] == "LOW"
    assert high["severity"] == "HIGH"


def test_severity_prediction_validation_error():
    res = client.post(
        "/internal/v1/predict/severity",
        json={"incident_id": "INC-X", "description": "missing fields"},
    )
    assert res.status_code == 422


def test_demand_forecast_success():
    res = client.post(
        "/internal/v1/forecast/demand",
        json={
            "incident_id": "INC-1",
            "forecast_horizon_start": "2026-09-21T00:00:00Z",
            "forecast_horizon_end": "2026-09-21T01:00:00Z",
            "resource_types": ["FOOD", "VEHICLE"],
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "SUCCESS"
    assert body["forecast_id"]
    by_type = {item["resource_type"]: item for item in body["items"]}
    assert by_type["FOOD"]["quantity"] == 50.0
    assert by_type["VEHICLE"]["quantity"] == 2.0
    assert body["items"][0]["provider_version"] == "demand-v1-mock"


def test_demand_forecast_validation_error():
    res = client.post(
        "/internal/v1/forecast/demand",
        json={"incident_id": "INC-X"},
    )
    assert res.status_code == 422


def test_optimization_allocation_success():
    res = client.post(
        "/internal/v1/optimize/allocation",
        json={
            "incident_id": "INC-1",
            "severity": "HIGH",
            "demand_estimate": [{"resource_type": "AMBULANCE", "quantity": 1}],
            "resource_candidates": [{"resource_id": "RES-1", "resource_type": "AMBULANCE", "latitude": 22.57, "longitude": 88.36}],
            "coordinates": {"latitude": 22.58, "longitude": 88.37},
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "SUCCESS"
    assert body["recommendation_id"]
    assert body["incident_id"] == "INC-1"
    assert body["solver_version"] == "optimizer-v1-mock"
    assert isinstance(body["objective_summary"], dict)


def test_optimization_validation_error():
    res = client.post(
        "/internal/v1/optimize/allocation",
        json={"demand_estimate": []},
    )
    assert res.status_code == 422


def test_rag_query_grounded_with_citation():
    res = client.post(
        "/internal/v1/rag/query",
        json={"query": "What is the flood evacuation procedure?"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "GROUNDED"
    assert body["citations"], "grounded answer must carry citation metadata"
    assert body["citations"][0]["document_id"] == "DOC-001"
    assert body["citations"][0]["page"] is not None
    assert body["rag_version"] == "rag-v1-mock"


def test_rag_query_abstained_when_unsupported():
    res = client.post(
        "/internal/v1/rag/query",
        json={"query": "What is the weather tomorrow at noon in Kolkata?"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "ABSTAINED"
    assert body["citations"] == []