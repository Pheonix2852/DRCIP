"""Optimization module (mock provider)"""
from fastapi import APIRouter
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
import uuid

router = APIRouter()

class OptimizationItem(BaseModel):
    resource_type: str
    resource_id: Optional[str] = None
    team_id: Optional[str] = None
    shelter_id: Optional[str] = None
    quantity: float
    rank: Optional[int] = None
    travel_minutes: Optional[float] = None
    rationale: Optional[str] = None

class OptimizationRequest(BaseModel):
    incident_id: str
    severity: Optional[str] = None
    demand_estimate: List[dict]
    resource_candidates: List[dict] = []
    team_candidates: List[dict] = []
    shelter_candidates: List[dict] = []
    coordinates: dict
    constraints: Optional[dict] = None

class OptimizationResponse(BaseModel):
    status: str
    recommendation_id: str
    incident_id: str
    items: List[OptimizationItem]
    objective_summary: dict
    solver_version: str
    generated_at: str
    error_code: Optional[str] = None
    message: Optional[str] = None

@router.post("/allocation", response_model=OptimizationResponse)
async def optimize_allocation(request: OptimizationRequest):
    """Mock optimization provider - returns a simple recommendation"""
    items = []
    
    # Simple mock: assign first available resource of each type
    for demand in request.demand_estimate:
        resource_type = demand.get("resource_type", "")
        quantity = demand.get("quantity", 1)
        
        # Try to find a matching candidate
        if resource_type == "AMBULANCE":
            candidates = request.resource_candidates
            for c in candidates:
                if c.get("resource_type") == "AMBULANCE":
                    items.append(OptimizationItem(
                        resource_type="AMBULANCE",
                        resource_id=c.get("resource_id"),
                        quantity=1,
                        rank=1,
                        travel_minutes=15.0,
                        rationale="Nearest available ambulance",
                    ))
                    break
        elif resource_type == "RESCUE_TEAM":
            candidates = request.team_candidates
            for c in candidates:
                if c.get("capability"):
                    items.append(OptimizationItem(
                        resource_type="RESCUE_TEAM",
                        team_id=c.get("team_id"),
                        quantity=1,
                        rank=1,
                        travel_minutes=20.0,
                        rationale="Best-fit rescue team by capability",
                    ))
                    break
        elif resource_type == "SHELTER":
            candidates = request.shelter_candidates
            for c in candidates:
                if c.get("capacity", 0) >= quantity:
                    items.append(OptimizationItem(
                        resource_type="SHELTER",
                        shelter_id=c.get("shelter_id"),
                        quantity=quantity,
                        rank=1,
                        travel_minutes=10.0,
                        rationale="Sufficient capacity shelter",
                    ))
                    break
    
    return OptimizationResponse(
        status="SUCCESS",
        recommendation_id=f"REC-{uuid.uuid4().hex[:8].upper()}",
        incident_id=request.incident_id,
        items=items,
        objective_summary={
            "estimated_travel_minutes": 15,
            "unmet_demand": max(0, len(request.demand_estimate) - len(items)),
        },
        solver_version="optimizer-v1-mock",
        generated_at=datetime.utcnow().isoformat() + "Z",
    )