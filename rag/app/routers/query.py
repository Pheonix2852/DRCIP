"""
POST /query — the sole public endpoint.

Document-only request  → { "question": "..." }
Document-only response → { "answer", "sources", "model", "chunks_retrieved" }

RAG 2.0 request (Node orchestrator only):
  { "question", "tools": [...], "tool_results": [...] }
Response adds `tool_calls` containing validated proposals. Python never executes
a proposed tool; Node validates, authorizes and executes it, then sends the
results back in a continuation request for final synthesis.

Authentication: Bearer token checked against API_KEYS env var.
Abstention:     Triggered by score threshold (pre-LLM) or LLM sentinel.
"""
from __future__ import annotations

import logging
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from groq import Groq
from pydantic import BaseModel, Field
from qdrant_client import QdrantClient

from app.config import Settings
from app.dependencies import get_groq_client, get_qdrant_client, get_settings
from app.services import embedder, generator, retriever

router = APIRouter()
_bearer = HTTPBearer()
logger = logging.getLogger(__name__)

# Maximum tool definitions Node may supply in one request. Node enforces the
# per-turn call limit; this only bounds request size.
_MAX_TOOL_DEFINITIONS = 10


def _unavailable(service: str, exc: Exception) -> HTTPException:
    """Map an upstream failure to a 503 without leaking internal details."""
    logger.exception("%s request failed: %s", service, exc)
    return HTTPException(
        status_code=503,
        detail=f"{service} is currently unavailable. Please try again later.",
    )

# ── Human-readable abstention message returned to the consumer ────────────────
_ABSTENTION = (
    "I could not find sufficient information in the available "
    "disaster-management documents to answer this question reliably. "
    "Please consult official sources or rephrase your query."
)


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    question: str = Field(
        ...,
        min_length=3,
        max_length=500,
        description="Natural-language disaster-management question.",
        examples=["What are the evacuation procedures for coastal flooding?"],
    )
    tools: list["ToolDefinition"] | None = Field(
        default=None,
        description="Approved live-tool definitions supplied by the Node orchestrator.",
    )
    tool_results: list["ToolResult"] | None = Field(
        default=None,
        description="Node-executed tool results for continuation and synthesis.",
    )


class ToolDefinition(BaseModel):
    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        pattern=r"^[a-z][a-z0-9_]*$",
        description="Exact approved tool name.",
    )
    description: str = Field(default="", max_length=2000)
    parameters: dict[str, Any] = Field(default_factory=dict)


class ToolResult(BaseModel):
    call_id: str | None = Field(default=None, max_length=100)
    tool: str = Field(..., min_length=1, max_length=100)
    outcome: Literal["SUCCESS", "EMPTY", "UNAVAILABLE", "ERROR"]
    as_of: str = Field(..., min_length=1, max_length=64)
    returned_count: int = Field(default=0, ge=0)
    truncated: bool = False
    records: list[dict[str, Any]] = Field(default_factory=list)
    aggregate: dict[str, Any] | None = None
    message: str | None = Field(default=None, max_length=500)


class SourceCitation(BaseModel):
    document: str = Field(description="Source filename")
    page: int = Field(description="1-based page number inside the document")
    excerpt: str = Field(description="First 250 characters of the matched chunk")


class ToolCallProposal(BaseModel):
    id: str
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class QueryResponse(BaseModel):
    answer: str
    sources: list[SourceCitation]
    model: str
    chunks_retrieved: int
    tool_calls: list[ToolCallProposal] = Field(default_factory=list)


def _build_sources(chunks) -> list[SourceCitation]:
    """Deduplicate chunk payloads into page-level citations."""
    sources: list[SourceCitation] = []
    seen_pages: set[tuple[str, int]] = set()
    for chunk in chunks:
        p = chunk.payload or {}
        doc = p.get("source", "unknown")
        page = p.get("page", 0)
        key = (doc, page)
        if key not in seen_pages:
            seen_pages.add(key)
            text = p.get("text", "")
            sources.append(
                SourceCitation(
                    document=doc,
                    page=page,
                    excerpt=text[:250] + ("…" if len(text) > 250 else ""),
                )
            )
    return sources


# ── Auth dependency ───────────────────────────────────────────────────────────

def _verify_key(
    credentials: HTTPAuthorizationCredentials = Security(_bearer),
    settings: Settings = Depends(get_settings),
) -> str:
    if credentials.credentials not in settings.api_key_set:
        raise HTTPException(status_code=401, detail="Invalid or missing API key.")
    return credentials.credentials


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post(
    "/query",
    response_model=QueryResponse,
    summary="Ask a disaster-management question",
    description=(
        "Embeds the question, retrieves relevant document chunks from Qdrant, "
        "and generates a grounded answer via Groq. When approved tool "
        "definitions are supplied, the model may instead return structured "
        "tool-call proposals for Node to validate, authorize and execute. "
        "Tool results are sent back in a continuation request for synthesis."
    ),
)
def query_endpoint(
    body: QueryRequest,
    settings: Settings = Depends(get_settings),
    qdrant: QdrantClient = Depends(get_qdrant_client),
    groq_client: Groq = Depends(get_groq_client),
    _key: str = Depends(_verify_key),
) -> QueryResponse:
    tools = body.tools or []
    tool_results = body.tool_results or []
    if len(tools) > _MAX_TOOL_DEFINITIONS:
        raise HTTPException(status_code=422, detail="Too many tool definitions.")
    if len({tool.name for tool in tools}) != len(tools):
        raise HTTPException(status_code=422, detail="Duplicate tool definitions.")

    # 1. Embed question
    try:
        vector = embedder.embed(body.question)
    except Exception as exc:  # pragma: no cover - defensive
        raise _unavailable("Embedding service", exc) from exc

    # 2. Retrieve chunks (returns [] when nothing meets score_threshold)
    try:
        chunks = retriever.search(
            client=qdrant,
            collection=settings.qdrant_collection,
            vector=vector,
            top_k=settings.top_k,
            score_threshold=settings.score_threshold,
        )
    except Exception as exc:
        raise _unavailable("Vector store", exc) from exc

    sources = _build_sources(chunks)

    # 3. Continuation: synthesize from documents and Node-executed tool results.
    if tool_results:
        try:
            answer = generator.synthesize(
                client=groq_client,
                model=settings.groq_model,
                question=body.question,
                chunks=chunks,
                tool_results=[result.model_dump() for result in tool_results],
            )
        except Exception as exc:
            raise _unavailable("Generation service", exc) from exc

        # Never present an invented answer when there is no usable source.
        if not answer or generator.is_insufficient(answer):
            answer = generator.LIVE_LIMITATION
        elif not chunks and not generator.has_usable_live_data(
            [result.model_dump() for result in tool_results]
        ):
            answer = generator.LIVE_LIMITATION

        return QueryResponse(
            answer=answer,
            sources=sources,
            model=settings.groq_model,
            chunks_retrieved=len(chunks),
        )

    # 4. Tool-proposal path: missing document chunks must not block a valid
    #    live-tool workflow.
    if tools:
        try:
            content, proposals = generator.propose(
                client=groq_client,
                model=settings.groq_model,
                question=body.question,
                chunks=chunks,
                tools=[tool.model_dump() for tool in tools],
            )
        except Exception as exc:
            raise _unavailable("Generation service", exc) from exc

        if proposals:
            return QueryResponse(
                answer=content,
                sources=sources,
                model=settings.groq_model,
                chunks_retrieved=len(chunks),
                tool_calls=[ToolCallProposal(**proposal) for proposal in proposals],
            )

        # No proposal and no document evidence: abstain rather than answer from
        # outside knowledge.
        if not chunks or generator.is_insufficient(content) or not content:
            return QueryResponse(
                answer=_ABSTENTION,
                sources=[],
                model=settings.groq_model,
                chunks_retrieved=len(chunks),
            )

        return QueryResponse(
            answer=content,
            sources=sources,
            model=settings.groq_model,
            chunks_retrieved=len(chunks),
        )

    # 5. Document-only path (RAG 1.0, unchanged).
    if not chunks:
        return QueryResponse(
            answer=_ABSTENTION,
            sources=[],
            model=settings.groq_model,
            chunks_retrieved=0,
        )

    try:
        answer = generator.generate(
            client=groq_client,
            model=settings.groq_model,
            question=body.question,
            chunks=chunks,
        )
    except Exception as exc:
        raise _unavailable("Generation service", exc) from exc

    if generator.is_insufficient(answer):
        return QueryResponse(
            answer=_ABSTENTION,
            sources=[],
            model=settings.groq_model,
            chunks_retrieved=len(chunks),
        )

    return QueryResponse(
        answer=answer,
        sources=sources,
        model=settings.groq_model,
        chunks_retrieved=len(chunks),
    )
