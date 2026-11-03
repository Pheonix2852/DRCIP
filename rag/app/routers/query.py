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
import re
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
    total: int | None = Field(default=None, ge=0)
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


_EXCERPT_MARKER = re.compile(
    r"\s*(?:[\[(]\s*)?(?:\*{1,3}|_{1,3})?\s*Excerpt\s+(\d+)\s*(?:\*{1,3}|_{1,3})?\s*(?:[\])])?",
    re.IGNORECASE,
)


def _build_sources(
    chunks, indices: set[int] | None = None
) -> list[SourceCitation]:
    """Deduplicate chunk payloads into page-level citations.

    ``indices`` are 1-based excerpt numbers the answer actually used. When it is
    supplied, only those excerpts become citations.
    """
    sources: list[SourceCitation] = []
    seen_pages: set[tuple[str, int]] = set()
    for index, chunk in enumerate(chunks, start=1):
        if indices is not None and index not in indices:
            continue
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


def _finalize_document_answer(answer: str, chunks) -> tuple[str, list[SourceCitation]]:
    """Strip used-excerpt markers and cite only the excerpts they reference."""
    used = {int(match.group(1)) for match in _EXCERPT_MARKER.finditer(answer)}
    if not used:
        return answer, _build_sources(chunks)
    cleaned = _EXCERPT_MARKER.sub("", answer).strip()
    return cleaned, _build_sources(chunks, used)


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

    retrieved_count = len(chunks)
    chunks = retriever.dedupe_overlapping_chunks(chunks)
    sources = _build_sources(chunks)

    # 3. Continuation: synthesize from documents and Node-executed tool results.
    if tool_results:
        results = [result.model_dump() for result in tool_results]
        outcomes = {result.outcome for result in tool_results}

        # A tool call means the question was operational. When every call is
        # EMPTY, document numbers must not be presented as current availability.
        if "SUCCESS" not in outcomes:
            if "EMPTY" in outcomes:
                answer = "No matching operational records were found."
                if outcomes & {"UNAVAILABLE", "ERROR"}:
                    answer += " Some live operational data could not be retrieved."
            else:
                answer = generator.LIVE_LIMITATION
            return QueryResponse(
                answer=answer,
                sources=[],
                model=settings.groq_model,
                chunks_retrieved=retrieved_count,
            )

        try:
            answer = generator.synthesize(
                client=groq_client,
                model=settings.groq_model,
                question=body.question,
                chunks=chunks,
                tool_results=results,
            )
        except generator.GenerationTruncatedError:
            # Never return a partial answer as complete. Fall back to the
            # counts already present in the tool results.
            answer = (
                "Live operational data was retrieved, but the generated summary "
                "was truncated at the response length limit.\n\n"
                + generator.deterministic_summary(results)
            )
            return QueryResponse(
                answer=answer,
                sources=[],
                model=settings.groq_model,
                chunks_retrieved=retrieved_count,
            )
        except Exception as exc:
            raise _unavailable("Generation service", exc) from exc

        # Never present an invented answer, or the no-data limitation, when
        # live data was retrieved successfully.
        if not answer or generator.is_insufficient(answer):
            answer = (
                "Live operational data was retrieved, but a generated summary "
                "was unavailable.\n\n"
                + generator.deterministic_summary(results)
            )
            sources = []
        else:
            # Cite only document excerpts the answer explicitly used. This keeps
            # live-only answers free of unrelated document citations.
            used = {int(match.group(1)) for match in _EXCERPT_MARKER.finditer(answer)}
            answer = _EXCERPT_MARKER.sub("", answer).strip()
            sources = _build_sources(chunks, used) if used else []

        return QueryResponse(
            answer=answer,
            sources=sources,
            model=settings.groq_model,
            chunks_retrieved=retrieved_count,
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
                chunks_retrieved=retrieved_count,
                tool_calls=[ToolCallProposal(**proposal) for proposal in proposals],
            )

        # No proposal and no document evidence: abstain rather than answer from
        # outside knowledge.
        if not chunks or generator.is_insufficient(content) or not content:
            return QueryResponse(
                answer=_ABSTENTION,
                sources=[],
                model=settings.groq_model,
                chunks_retrieved=retrieved_count,
            )

        answer, sources = _finalize_document_answer(content, chunks)
        return QueryResponse(
            answer=answer,
            sources=sources,
            model=settings.groq_model,
            chunks_retrieved=retrieved_count,
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
    except generator.GenerationTruncatedError:
        return QueryResponse(
            answer=generator.TRUNCATED_ANSWER,
            sources=[],
            model=settings.groq_model,
            chunks_retrieved=retrieved_count,
        )
    except Exception as exc:
        raise _unavailable("Generation service", exc) from exc

    if generator.is_insufficient(answer):
        return QueryResponse(
            answer=_ABSTENTION,
            sources=[],
            model=settings.groq_model,
            chunks_retrieved=retrieved_count,
        )

    answer, sources = _finalize_document_answer(answer, chunks)
    return QueryResponse(
        answer=answer,
        sources=sources,
        model=settings.groq_model,
        chunks_retrieved=retrieved_count,
    )
