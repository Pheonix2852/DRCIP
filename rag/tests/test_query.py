"""
API integration tests — all external services are mocked.

Coverage:
  ✓ GET  /health  (public, no auth)
  ✓ GET  /        (API root)
  ✓ POST /query   missing auth → 401
  ✓ POST /query   wrong key   → 401
  ✓ POST /query   valid key, relevant context → 200 with answer + sources
  ✓ POST /query   valid key, no relevant chunks → abstention
  ✓ POST /query   valid key, LLM signals INSUFFICIENT_CONTEXT → abstention
  ✓ POST /query   question too short (< 3 chars) → 422
  ✓ POST /query   question too long (> 500 chars) → 422
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_groq_client, get_qdrant_client
from app.main import app

VALID_KEY = "test_bearer_key_123"
AUTH = {"Authorization": f"Bearer {VALID_KEY}"}


# ── Helpers to build mock Qdrant ScoredPoints ────────────────────────────────

def _make_point(
    text: str,
    source: str = "disaster.pdf",
    page: int = 5,
    score: float = 0.8,
    chunk_index: int = 0,
):
    p = SimpleNamespace()
    p.score = score
    p.payload = {
        "text": text,
        "source": source,
        "page": page,
        "chunk_index": chunk_index,
    }
    return p


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture()
def mock_embed():
    """Replace embed() with a zero-vector stub."""
    with patch("app.routers.query.embedder.embed", return_value=[0.0] * 384) as m:
        yield m


@pytest.fixture()
def mock_qdrant_client():
    return MagicMock()


@pytest.fixture()
def mock_groq_client():
    return MagicMock()


@pytest.fixture()
def api_client(mock_qdrant_client, mock_groq_client):
    """TestClient with Qdrant + Groq injected as mocks."""
    app.dependency_overrides[get_qdrant_client] = lambda: mock_qdrant_client
    app.dependency_overrides[get_groq_client] = lambda: mock_groq_client
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestMetaEndpoints:
    def test_root_returns_200(self, api_client):
        r = api_client.get("/")
        assert r.status_code == 200
        assert r.json()["name"] == "DRCIP Disaster Management RAG API"

    def test_health_no_auth_required(self, api_client, mock_qdrant_client):
        mock_qdrant_client.collection_exists.return_value = True
        r = api_client.get("/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"
        assert data["qdrant"] == "connected"
        assert data["model_loaded"] is False

    def test_health_collection_missing(self, api_client, mock_qdrant_client):
        mock_qdrant_client.collection_exists.return_value = False
        r = api_client.get("/health")
        assert r.status_code == 200
        assert r.json()["qdrant"] == "collection_missing"


class TestAuth:
    def test_missing_auth_returns_403(self, api_client):
        r = api_client.post("/query", json={"question": "What is flood preparedness?"})
        assert r.status_code in (401, 403)

    def test_wrong_key_returns_401(self, api_client):
        r = api_client.post(
            "/query",
            json={"question": "What is flood preparedness?"},
            headers={"Authorization": "Bearer wrong_key"},
        )
        assert r.status_code == 401


class TestQueryValidation:
    def test_question_too_short_returns_422(self, api_client):
        r = api_client.post("/query", json={"question": "Hi"}, headers=AUTH)
        assert r.status_code == 422

    def test_question_too_long_returns_422(self, api_client):
        r = api_client.post("/query", json={"question": "x" * 501}, headers=AUTH)
        assert r.status_code == 422

    def test_missing_question_returns_422(self, api_client):
        r = api_client.post("/query", json={}, headers=AUTH)
        assert r.status_code == 422


class TestQueryLogic:
    def test_valid_query_returns_answer_with_sources(
        self, api_client, mock_qdrant_client, mock_groq_client, mock_embed
    ):
        # Qdrant returns relevant chunks
        mock_qdrant_client.query_points.return_value = SimpleNamespace(
            points=[
                _make_point("Evacuate immediately when Flood Alert Level 3 is issued.", page=12),
                _make_point("Designated routes are marked with green signs.", page=13),
            ]
        )
        # Groq returns a coherent answer
        choice = SimpleNamespace(message=SimpleNamespace(content="Evacuate via green-signed routes."))
        mock_groq_client.chat.completions.create.return_value = SimpleNamespace(choices=[choice])

        r = api_client.post(
            "/query",
            json={"question": "What are the coastal flood evacuation procedures?"},
            headers=AUTH,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["answer"] == "Evacuate via green-signed routes."
        assert len(data["sources"]) == 2
        assert data["sources"][0]["page"] == 12
        assert data["chunks_retrieved"] == 2

    def test_no_chunks_returns_abstention(
        self, api_client, mock_qdrant_client, mock_groq_client, mock_embed
    ):
        mock_qdrant_client.query_points.return_value = SimpleNamespace(points=[])

        r = api_client.post(
            "/query",
            json={"question": "What is the capital of France?"},
            headers=AUTH,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["sources"] == []
        assert data["chunks_retrieved"] == 0
        assert "could not find" in data["answer"].lower()
        # Groq should NOT have been called
        mock_groq_client.chat.completions.create.assert_not_called()

    def test_llm_signals_insufficient_context_returns_abstention(
        self, api_client, mock_qdrant_client, mock_groq_client, mock_embed
    ):
        mock_qdrant_client.query_points.return_value = SimpleNamespace(
            points=[_make_point("Some loosely related content.", score=0.32)]
        )
        # LLM returns the sentinel
        choice = SimpleNamespace(message=SimpleNamespace(content="INSUFFICIENT_CONTEXT"))
        mock_groq_client.chat.completions.create.return_value = SimpleNamespace(choices=[choice])

        r = api_client.post(
            "/query",
            json={"question": "What is the recipe for disaster soup?"},
            headers=AUTH,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["sources"] == []
        assert "could not find" in data["answer"].lower()

    def test_duplicate_page_citations_are_deduplicated(
        self, api_client, mock_qdrant_client, mock_groq_client, mock_embed
    ):
        # Two chunks from the same page
        mock_qdrant_client.query_points.return_value = SimpleNamespace(
            points=[
                _make_point("Chunk A from page 7.", page=7),
                _make_point("Chunk B from page 7.", page=7),
                _make_point("Chunk C from page 8.", page=8),
            ]
        )
        choice = SimpleNamespace(message=SimpleNamespace(content="Detailed answer here."))
        mock_groq_client.chat.completions.create.return_value = SimpleNamespace(choices=[choice])

        r = api_client.post(
            "/query",
            json={"question": "Explain the disaster response protocol."},
            headers=AUTH,
        )
        assert r.status_code == 200
        pages = [s["page"] for s in r.json()["sources"]]
        # page 7 should appear only once
        assert pages.count(7) == 1
        assert 8 in pages

    def test_document_answer_cites_only_used_excerpts_and_strips_markers(
        self, api_client, mock_qdrant_client, mock_groq_client, mock_embed
    ):
        mock_qdrant_client.query_points.return_value = SimpleNamespace(
            points=[
                _make_point("Shelter X is open.", page=12),
                _make_point("Unrelated guidance.", page=13),
            ]
        )
        choice = SimpleNamespace(
            message=SimpleNamespace(content="Shelter X is open *Excerpt 1*.")
        )
        mock_groq_client.chat.completions.create.return_value = SimpleNamespace(choices=[choice])

        r = api_client.post(
            "/query",
            json={"question": "Is shelter X open?"},
            headers=AUTH,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["answer"] == "Shelter X is open."
        assert [s["page"] for s in data["sources"]] == [12]


    def test_truncated_document_answer_is_not_returned_as_complete(
        self, api_client, mock_qdrant_client, mock_groq_client, mock_embed
    ):
        from app.services import generator

        mock_qdrant_client.query_points.return_value = SimpleNamespace(
            points=[_make_point("Grounded but long context.", page=12)]
        )
        truncated = SimpleNamespace(
            message=SimpleNamespace(content="This answer was cut off"),
            finish_reason="length",
        )
        mock_groq_client.chat.completions.create.return_value = SimpleNamespace(
            choices=[truncated]
        )

        r = api_client.post(
            "/query",
            json={"question": "What are the evacuation procedures?"},
            headers=AUTH,
        )

        assert r.status_code == 200
        data = r.json()
        assert data["answer"] == generator.TRUNCATED_ANSWER
        assert data["sources"] == []
        assert data["chunks_retrieved"] == 1
        assert mock_groq_client.chat.completions.create.call_count == 2

    def test_adjacent_overlap_is_removed_before_generation(
        self, api_client, mock_qdrant_client, mock_groq_client, mock_embed
    ):
        overlap = "shared overlap text " * 6
        mock_qdrant_client.query_points.return_value = SimpleNamespace(
            points=[
                _make_point(f"Phailin: about one million evacuated. {overlap}", page=32, chunk_index=0),
                _make_point(f"{overlap}Kerala: about 480 deaths.", page=32, chunk_index=1),
            ]
        )
        choice = SimpleNamespace(message=SimpleNamespace(content="Both records."))
        mock_groq_client.chat.completions.create.return_value = SimpleNamespace(
            choices=[choice]
        )

        r = api_client.post(
            "/query",
            json={"question": "Compare the Phailin and Kerala disasters."},
            headers=AUTH,
        )

        assert r.status_code == 200
        user_content = (
            mock_groq_client.chat.completions.create.call_args.kwargs["messages"][1]["content"]
        )
        assert user_content.count(overlap) == 1
        assert "Phailin: about one million evacuated." in user_content
        assert "Kerala: about 480 deaths." in user_content
        assert r.json()["chunks_retrieved"] == 2

    def test_citation_markers_align_after_dropping_pure_overlap_chunk(
        self, api_client, mock_qdrant_client, mock_groq_client, mock_embed
    ):
        overlap = "shared overlap text " * 6
        mock_qdrant_client.query_points.return_value = SimpleNamespace(
            points=[
                _make_point(f"Phailin facts. {overlap}", page=32, chunk_index=0),
                _make_point(overlap, page=32, chunk_index=1),
                _make_point("Kerala facts.", page=33, chunk_index=0),
            ]
        )
        choice = SimpleNamespace(
            message=SimpleNamespace(content="Kerala facts. [Excerpt 2]")
        )
        mock_groq_client.chat.completions.create.return_value = SimpleNamespace(
            choices=[choice]
        )

        r = api_client.post(
            "/query",
            json={"question": "Which record mentions Kerala?"},
            headers=AUTH,
        )

        assert r.status_code == 200
        data = r.json()
        assert data["answer"] == "Kerala facts."
        assert [s["page"] for s in data["sources"]] == [33]
        assert data["chunks_retrieved"] == 3


class TestToolProposalAndSynthesis:
    def test_approved_proposal_is_returned_without_execution(
        self, api_client, mock_qdrant_client, mock_groq_client, mock_embed
    ):
        mock_qdrant_client.query_points.return_value = SimpleNamespace(points=[])
        tool_call = SimpleNamespace(
            id="call_1",
            function=SimpleNamespace(
                name="get_active_incidents",
                arguments='{"status":"ACTIVE"}',
            ),
        )
        choice = SimpleNamespace(
            message=SimpleNamespace(content="", tool_calls=[tool_call])
        )
        mock_groq_client.chat.completions.create.return_value = SimpleNamespace(choices=[choice])

        r = api_client.post(
            "/query",
            json={
                "question": "How many active incidents are there?",
                "tools": [
                    {
                        "name": "get_active_incidents",
                        "description": "List active incidents.",
                        "parameters": {
                            "type": "object",
                            "properties": {"status": {"type": "string"}},
                        },
                    }
                ],
            },
            headers=AUTH,
        )

        assert r.status_code == 200
        assert r.json()["tool_calls"] == [
            {
                "id": "call_1",
                "name": "get_active_incidents",
                "arguments": {"status": "ACTIVE"},
            }
        ]

    def test_unknown_proposal_is_dropped(
        self, api_client, mock_qdrant_client, mock_groq_client, mock_embed
    ):
        mock_qdrant_client.query_points.return_value = SimpleNamespace(points=[])
        tool_call = SimpleNamespace(
            id="call_1",
            function=SimpleNamespace(
                name="execute_sql",
                arguments='{"query":"select 1"}',
            ),
        )
        choice = SimpleNamespace(
            message=SimpleNamespace(content="", tool_calls=[tool_call])
        )
        mock_groq_client.chat.completions.create.return_value = SimpleNamespace(choices=[choice])

        r = api_client.post(
            "/query",
            json={
                "question": "How many active incidents are there?",
                "tools": [
                    {
                        "name": "get_active_incidents",
                        "description": "List active incidents.",
                        "parameters": {"type": "object", "properties": {}},
                    }
                ],
            },
            headers=AUTH,
        )

        assert r.status_code == 200
        data = r.json()
        assert data["tool_calls"] == []
        assert "could not find" in data["answer"].lower()

    def test_continuation_synthesizes_from_tool_results(
        self, api_client, mock_qdrant_client, mock_groq_client, mock_embed
    ):
        mock_qdrant_client.query_points.return_value = SimpleNamespace(points=[])
        choice = SimpleNamespace(
            message=SimpleNamespace(content="There is 1 active incident.")
        )
        mock_groq_client.chat.completions.create.return_value = SimpleNamespace(choices=[choice])

        r = api_client.post(
            "/query",
            json={
                "question": "How many active incidents are there?",
                "tool_results": [
                    {
                        "call_id": "call_1",
                        "tool": "get_active_incidents",
                        "outcome": "SUCCESS",
                        "as_of": "2026-10-31T00:00:00.000Z",
                        "returned_count": 1,
                        "records": [{"id": "inc-1"}],
                    }
                ],
            },
            headers=AUTH,
        )

        assert r.status_code == 200
        assert r.json()["answer"] == "There is 1 active incident."

    def test_continuation_prompt_includes_total_for_partial_pages(
        self, api_client, mock_qdrant_client, mock_groq_client, mock_embed
    ):
        mock_qdrant_client.query_points.return_value = SimpleNamespace(points=[])
        choice = SimpleNamespace(
            message=SimpleNamespace(content="Showing 10 of 35 active incidents.")
        )
        mock_groq_client.chat.completions.create.return_value = SimpleNamespace(choices=[choice])

        r = api_client.post(
            "/query",
            json={
                "question": "How many active incidents are there?",
                "tool_results": [
                    {
                        "call_id": "call_1",
                        "tool": "get_active_incidents",
                        "outcome": "SUCCESS",
                        "as_of": "2026-10-31T00:00:00.000Z",
                        "returned_count": 10,
                        "truncated": True,
                        "total": 35,
                        "records": [{"incident_id": f"inc-{i}"} for i in range(10)],
                    }
                ],
            },
            headers=AUTH,
        )

        assert r.status_code == 200
        assert r.json()["answer"] == "Showing 10 of 35 active incidents."
        messages = mock_groq_client.chat.completions.create.call_args.kwargs["messages"]
        user_content = messages[1]["content"]
        assert '"total": 35' in user_content
        assert '"truncated": true' in user_content

    def test_continuation_rejects_a_length_cut_completion(
        self, api_client, mock_qdrant_client, mock_groq_client, mock_embed
    ):
        import inspect

        from groq import Groq

        mock_qdrant_client.query_points.return_value = SimpleNamespace(points=[])
        choice = SimpleNamespace(
            message=SimpleNamespace(
                content="**Active incidents:**\n\n| # | Incident ID |"
            ),
            finish_reason="length",
        )
        mock_groq_client.chat.completions.create.return_value = SimpleNamespace(choices=[choice])

        r = api_client.post(
            "/query",
            json={
                "question": "List the active incidents.",
                "tool_results": [
                    {
                        "call_id": "call_1",
                        "tool": "get_active_incidents",
                        "outcome": "SUCCESS",
                        "as_of": "2026-10-31T00:00:00.000Z",
                        "returned_count": 10,
                        "truncated": True,
                        "total": 35,
                        "records": [{"incident_id": f"inc-{i}"} for i in range(10)],
                    }
                ],
            },
            headers=AUTH,
        )

        assert r.status_code == 200
        answer = r.json()["answer"]
        assert "| # | Incident ID |" not in answer
        assert "showing 10 of 35" in answer.lower()

        # The synthesis call must only use parameters supported by the pinned
        # Groq SDK, so mock-based tests cannot mask a signature mismatch.
        call_kwargs = mock_groq_client.chat.completions.create.call_args.kwargs
        supported = inspect.signature(
            Groq(api_key="test").chat.completions.create
        ).parameters
        assert set(call_kwargs) <= set(supported)
        assert call_kwargs["max_tokens"] == 2048
        assert "max_completion_tokens" not in call_kwargs

    @pytest.mark.parametrize("content", ["", "INSUFFICIENT_CONTEXT"])
    def test_continuation_success_with_unusable_synthesis_reports_counts(
        self,
        api_client,
        mock_qdrant_client,
        mock_groq_client,
        mock_embed,
        content,
    ):
        from app.services.generator import LIVE_LIMITATION

        mock_qdrant_client.query_points.return_value = SimpleNamespace(points=[])
        choice = SimpleNamespace(message=SimpleNamespace(content=content))
        mock_groq_client.chat.completions.create.return_value = SimpleNamespace(choices=[choice])

        r = api_client.post(
            "/query",
            json={
                "question": "List the active incidents.",
                "tool_results": [
                    {
                        "call_id": "call_1",
                        "tool": "get_active_incidents",
                        "outcome": "SUCCESS",
                        "as_of": "2026-10-31T00:00:00.000Z",
                        "returned_count": 10,
                        "truncated": True,
                        "total": 35,
                        "records": [{"incident_id": f"inc-{i}"} for i in range(10)],
                    }
                ],
            },
            headers=AUTH,
        )

        assert r.status_code == 200
        answer = r.json()["answer"]
        assert answer != LIVE_LIMITATION
        assert "showing 10 of 35" in answer.lower()

    def test_continuation_does_not_accept_invented_answer_without_live_data(
        self, api_client, mock_qdrant_client, mock_groq_client, mock_embed
    ):
        from app.services.generator import LIVE_LIMITATION

        mock_qdrant_client.query_points.return_value = SimpleNamespace(points=[])
        choice = SimpleNamespace(
            message=SimpleNamespace(content="There are 5 active incidents.")
        )
        mock_groq_client.chat.completions.create.return_value = SimpleNamespace(choices=[choice])

        r = api_client.post(
            "/query",
            json={
                "question": "How many active incidents are there?",
                "tool_results": [
                    {
                        "call_id": "call_1",
                        "tool": "get_active_incidents",
                        "outcome": "UNAVAILABLE",
                        "as_of": "2026-10-31T00:00:00.000Z",
                        "returned_count": 0,
                        "records": [],
                    }
                ],
            },
            headers=AUTH,
        )

        assert r.status_code == 200
        assert r.json()["answer"] == LIVE_LIMITATION

    def test_continuation_empty_tool_does_not_fall_back_to_document_numbers(
        self, api_client, mock_qdrant_client, mock_groq_client, mock_embed
    ):
        mock_qdrant_client.query_points.return_value = SimpleNamespace(
            points=[_make_point("There are 108 ambulances available.", page=28)]
        )

        r = api_client.post(
            "/query",
            json={
                "question": "How many ambulances are available?",
                "tool_results": [
                    {
                        "call_id": "call_1",
                        "tool": "get_resource_stock",
                        "outcome": "EMPTY",
                        "as_of": "2026-10-31T00:00:00.000Z",
                        "returned_count": 0,
                        "records": [],
                    }
                ],
            },
            headers=AUTH,
        )

        assert r.status_code == 200
        data = r.json()
        assert data["answer"] == "No matching operational records were found."
        assert data["sources"] == []
        mock_groq_client.chat.completions.create.assert_not_called()

    def test_continuation_live_only_answer_has_no_document_citations(
        self, api_client, mock_qdrant_client, mock_groq_client, mock_embed
    ):
        mock_qdrant_client.query_points.return_value = SimpleNamespace(
            points=[_make_point("There are 108 ambulances available.", page=28)]
        )
        choice = SimpleNamespace(
            message=SimpleNamespace(
                content="Live stock total is 11 ambulances."
            )
        )
        mock_groq_client.chat.completions.create.return_value = SimpleNamespace(choices=[choice])

        r = api_client.post(
            "/query",
            json={
                "question": "How many ambulances are available?",
                "tool_results": [
                    {
                        "call_id": "call_1",
                        "tool": "get_resource_stock",
                        "outcome": "SUCCESS",
                        "as_of": "2026-10-31T00:00:00.000Z",
                        "returned_count": 1,
                        "records": [{"quantity": 11}],
                    }
                ],
            },
            headers=AUTH,
        )

        assert r.status_code == 200
        data = r.json()
        assert data["answer"] == "Live stock total is 11 ambulances."
        assert data["sources"] == []

    def test_continuation_cites_only_excerpts_used_by_the_answer(
        self, api_client, mock_qdrant_client, mock_groq_client, mock_embed
    ):
        mock_qdrant_client.query_points.return_value = SimpleNamespace(
            points=[
                _make_point("Shelter X is open.", page=12),
                _make_point("Unrelated guidance.", page=13),
            ]
        )
        choice = SimpleNamespace(
            message=SimpleNamespace(
                content="Shelter X is open *Excerpt 1*. Live stock is 11."
            )
        )
        mock_groq_client.chat.completions.create.return_value = SimpleNamespace(choices=[choice])

        r = api_client.post(
            "/query",
            json={
                "question": "Is shelter X open and how much stock is there?",
                "tool_results": [
                    {
                        "call_id": "call_1",
                        "tool": "get_resource_stock",
                        "outcome": "SUCCESS",
                        "as_of": "2026-10-31T00:00:00.000Z",
                        "returned_count": 1,
                        "records": [{"quantity": 11}],
                    }
                ],
            },
            headers=AUTH,
        )

        assert r.status_code == 200
        data = r.json()
        assert data["answer"] == "Shelter X is open. Live stock is 11."
        assert len(data["sources"]) == 1
        assert data["sources"][0]["page"] == 12


class TestUpstreamFailures:
    def test_qdrant_failure_returns_503(
        self, api_client, mock_qdrant_client, mock_embed
    ):
        mock_qdrant_client.query_points.side_effect = RuntimeError("qdrant down")

        r = api_client.post(
            "/query",
            json={"question": "What are the flood evacuation procedures?"},
            headers=AUTH,
        )
        assert r.status_code == 503
        assert "unavailable" in r.json()["detail"].lower()

    def test_groq_failure_returns_503(
        self, api_client, mock_qdrant_client, mock_groq_client, mock_embed
    ):
        mock_qdrant_client.query_points.return_value = SimpleNamespace(
            points=[_make_point("Evacuate immediately.")]
        )
        mock_groq_client.chat.completions.create.side_effect = RuntimeError("groq down")

        r = api_client.post(
            "/query",
            json={"question": "What are the flood evacuation procedures?"},
            headers=AUTH,
        )
        assert r.status_code == 503
        assert "unavailable" in r.json()["detail"].lower()
