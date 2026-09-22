"""Demand forecasting module (mock provider)"""
from fastapi import APIRouter
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
import uuid

router = APIRouter()

class DemandForecastItem(BaseModel):
    resource_type: str
    quantity: float
    lower_bound: Optional[float] = None
    upper_bound: Optional[float] = None
    quality_indicator: Optional[float] = None
    provider_version: str
    assumptions: Optional[dict] = None

class DemandForecastRequest(BaseModel):
    response_zone_id: Optional[str] = None
    incident_id: Optional[str] = None
    forecast_horizon_start: str
    forecast_horizon_end: str
    resource_types: List[str]
    context: Optional[dict] = None

class DemandForecastResponse(BaseModel):
    status: str
    forecast_id: str
    scope: Optional[dict] = None
    forecast_horizon_start: str
    forecast_horizon_end: str
    items: List[DemandForecastItem]
    generated_at: str
    error_code: Optional[str] = None
    message: Optional[str] = None

@router.post("/demand", response_model=DemandForecastResponse)
async def forecast_demand(request: DemandForecastRequest):
    """Mock demand forecasting provider"""
    items = []
    for resource_type in request.resource_types:
        # Simple baseline mock based on resource type
        quantity = 10.0
        if resource_type == "FOOD":
            quantity = 50.0
        elif resource_type == "MEDICAL_KIT":
            quantity = 25.0
        elif resource_type == "PERSONNEL":
            quantity = 5.0
        elif resource_type == "VEHICLE":
            quantity = 2.0
        elif resource_type == "SHELTER_CAPACITY":
            quantity = 100.0
        
        items.append(DemandForecastItem(
            resource_type=resource_type,
            quantity=quantity,
            lower_bound=quantity * 0.8,
            upper_bound=quantity * 1.2,
            quality_indicator=0.75,
            provider_version="demand-v1-mock",
            assumptions={"method": "baseline_rule", "horizon_hours": 24},
        ))
    
    return DemandForecastResponse(
        status="SUCCESS",
        forecast_id=f"FORE-{uuid.uuid4().hex[:8].upper()}",
        scope={
            "response_zone_id": request.response_zone_id,
            "incident_id": request.incident_id,
        },
        forecast_horizon_start=request.forecast_horizon_start,
        forecast_horizon_end=request.forecast_horizon_end,
        items=items,
        generated_at=datetime.utcnow().isoformat() + "Z",
    )