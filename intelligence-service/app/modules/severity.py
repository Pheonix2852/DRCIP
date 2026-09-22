"""Severity prediction module (mock provider)"""
from fastapi import APIRouter
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
import uuid

router = APIRouter()

class SeverityPredictionRequest(BaseModel):
    incident_id: str
    description: str
    people_affected: int
    disaster_type: str
    latitude: float
    longitude: float
    event_context: Optional[dict] = None
    weather_context: Optional[dict] = None

class SeverityPredictionResponse(BaseModel):
    status: str
    incident_id: str
    severity: Optional[str] = None
    confidence: Optional[float] = None
    model_version: Optional[str] = None
    prediction_id: Optional[str] = None
    explanation: Optional[list] = None
    generated_at: Optional[str] = None
    error_code: Optional[str] = None
    message: Optional[str] = None

@router.post("/severity", response_model=SeverityPredictionResponse)
async def predict_severity(request: SeverityPredictionRequest):
    """Mock severity prediction provider"""
    severity = "MEDIUM"
    explanation = ["Default mock severity prediction"]
    
    # Simple heuristic for mock
    if request.people_affected > 10:
        severity = "HIGH"
        explanation = [f"{request.people_affected} people affected", "High impact scenario"]
    elif request.people_affected > 3:
        severity = "MEDIUM"
        explanation = [f"{request.people_affected} people affected", "Moderate impact scenario"]
    else:
        severity = "LOW"
        explanation = [f"{request.people_affected} people affected", "Low impact scenario"]
    
    return SeverityPredictionResponse(
        status="SUCCESS",
        incident_id=request.incident_id,
        severity=severity,
        confidence=0.85,
        model_version="severity-v1-mock",
        prediction_id=f"PRED-{uuid.uuid4().hex[:8].upper()}",
        explanation=explanation,
        generated_at=datetime.utcnow().isoformat() + "Z",
    )