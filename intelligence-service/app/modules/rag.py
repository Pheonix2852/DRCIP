"""RAG module (mock provider)"""
from fastapi import APIRouter
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
import uuid

router = APIRouter()

class RagCitation(BaseModel):
    document_id: str
    title: str
    page: Optional[int] = None
    section: Optional[str] = None
    source_organization: Optional[str] = None

class RagQueryRequest(BaseModel):
    query: str
    incident_id: Optional[str] = None
    conversation_context: Optional[list] = None
    requested_answer_mode: Optional[str] = None

class RagQueryResponse(BaseModel):
    status: str
    answer: str
    citations: List[RagCitation]
    tool_calls: list
    rag_version: str
    latency_ms: Optional[int] = None

@router.post("/query", response_model=RagQueryResponse)
async def query_rag(request: RagQueryRequest):
    """Mock RAG provider - returns a grounded or abstained response"""
    # Simple mock: respond to common questions with a citation
    if "evacuat" in request.query.lower() or "flood" in request.query.lower():
        return RagQueryResponse(
            status="GROUNDED",
            answer="Before evacuating people from a flooded area, ensure: 1) Power and utilities are cut off if safe to do so, 2) Life jackets are worn, 3) A pre-planned evacuation route is followed, 4) Vulnerable persons are identified and assisted.",
            citations=[
                RagCitation(
                    document_id="DOC-001",
                    title="Flood Response SOP",
                    page=43,
                    section="Evacuation Procedures",
                    source_organization="NDMA",
                )
            ],
            tool_calls=[],
            rag_version="rag-v1-mock",
            latency_ms=120,
        )
    elif "resource" in request.query.lower() or "stock" in request.query.lower():
        return RagQueryResponse(
            status="GROUNDED",
            answer="Resource stock levels should be monitored continuously. When stock falls below 20% of capacity, an automatic replenishment request should be raised through the coordination channel.",
            citations=[
                RagCitation(
                    document_id="DOC-002",
                    title="Resource Management Guidelines",
                    page=12,
                    section="Stock Monitoring",
                    source_organization="NIDM",
                )
            ],
            tool_calls=[],
            rag_version="rag-v1-mock",
            latency_ms=100,
        )
    else:
        # Abstain for unknown topics
        return RagQueryResponse(
            status="ABSTAINED",
            answer="I could not find sufficient support in the approved DRCIP knowledge base to answer that reliably.",
            citations=[],
            tool_calls=[],
            rag_version="rag-v1-mock",
            latency_ms=80,
        )