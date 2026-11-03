"""Cloudflare Workers AI embedding client tests (offline)."""
from __future__ import annotations

import httpx
import pytest

from app.services import embedder


def _vector(first: float = 1.0, second: float = 0.0) -> list[float]:
    vector = [0.0] * embedder.EMBEDDING_DIM
    vector[0] = first
    vector[1] = second
    return vector


def _payload(vectors: list[list[float]], success: bool = True, errors=None) -> dict:
    return {
        "success": success,
        "errors": errors or [],
        "messages": [],
        "result": {
            "shape": [len(vectors), embedder.EMBEDDING_DIM],
            "data": vectors,
            "pooling": "cls",
        },
    }


class _FakeClient:
    def __init__(self, responder):
        self.responder = responder
        self.calls: list[dict] = []

    def post(self, url, headers=None, json=None):
        call = {"url": url, "headers": headers, "json": json}
        self.calls.append(call)
        return self.responder(call)


def _install(monkeypatch, responder) -> _FakeClient:
    client = _FakeClient(responder)
    monkeypatch.setattr(embedder, "_get_client", lambda: client)
    return client


def _ok(call: dict) -> httpx.Response:
    texts = call["json"]["text"]
    return httpx.Response(
        200, json=_payload([_vector(float(index + 1), 1.0) for index in range(len(texts))])
    )


@pytest.fixture(autouse=True)
def _embedding_env(monkeypatch):
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "test_account_id")
    monkeypatch.setenv("CLOUDFLARE_API_TOKEN", "test_cloudflare_token")
    monkeypatch.setenv("CLOUDFLARE_EMBEDDING_BATCH_SIZE", "2")
    monkeypatch.setenv("CLOUDFLARE_EMBEDDING_POOLING", "cls")
    monkeypatch.delenv("CLOUDFLARE_EMBEDDING_MODEL", raising=False)
    embedder._successful_request.clear()
    yield
    embedder._successful_request.clear()


def test_embed_calls_cloudflare_and_returns_normalised_vector(monkeypatch):
    client = _install(
        monkeypatch,
        lambda call: httpx.Response(200, json=_payload([_vector(3.0, 4.0)])),
    )

    vector = embedder.embed("flood guidance")

    assert client.calls[0]["url"].endswith(
        "/accounts/test_account_id/ai/run/@cf/baai/bge-small-en-v1.5"
    )
    assert client.calls[0]["headers"]["Authorization"] == "Bearer test_cloudflare_token"
    assert client.calls[0]["json"] == {"text": ["flood guidance"], "pooling": "cls"}
    assert len(vector) == embedder.EMBEDDING_DIM
    assert vector[0] == pytest.approx(0.6)
    assert vector[1] == pytest.approx(0.8)
    assert embedder.is_model_loaded() is True


def test_configured_model_is_used_in_url(monkeypatch):
    monkeypatch.setenv("CLOUDFLARE_EMBEDDING_MODEL", "@cf/custom/model")
    client = _install(monkeypatch, _ok)

    embedder.embed("text")

    assert client.calls[0]["url"].endswith("/ai/run/@cf/custom/model")


def test_embed_many_batches_and_preserves_order(monkeypatch):
    def ordered(call: dict) -> httpx.Response:
        texts = call["json"]["text"]
        vectors = [_vector(float(text.split()[-1]) + 1.0, 1.0) for text in texts]
        return httpx.Response(200, json=_payload(vectors))

    client = _install(monkeypatch, ordered)

    vectors = embedder.embed_many([f"text {index}" for index in range(5)])

    assert [len(call["json"]["text"]) for call in client.calls] == [2, 2, 1]
    assert [call["json"]["text"] for call in client.calls] == [
        ["text 0", "text 1"],
        ["text 2", "text 3"],
        ["text 4"],
    ]
    first_components = [vector[0] for vector in vectors]
    assert first_components == sorted(first_components)


def test_empty_input_returns_empty_without_calling_provider(monkeypatch):
    client = _install(monkeypatch, _ok)

    assert embedder.embed_many([]) == []
    assert client.calls == []


def test_missing_configuration_is_reported(monkeypatch):
    monkeypatch.delenv("CLOUDFLARE_ACCOUNT_ID")
    _install(monkeypatch, _ok)

    with pytest.raises(embedder.EmbeddingServiceError, match="CLOUDFLARE_ACCOUNT_ID"):
        embedder.embed("text")


def test_non_string_inputs_are_rejected(monkeypatch):
    client = _install(monkeypatch, _ok)

    with pytest.raises(TypeError):
        embedder.embed(123)  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        embedder.embed_many(["ok", None])  # type: ignore[list-item]
    assert client.calls == []


def test_http_error_is_translated_without_leaking_token(monkeypatch):
    _install(monkeypatch, lambda call: httpx.Response(429, text="rate limited"))

    with pytest.raises(embedder.EmbeddingServiceError) as excinfo:
        embedder.embed("text")

    message = str(excinfo.value)
    assert "HTTP 429" in message
    assert "test_cloudflare_token" not in message
    assert embedder.is_model_loaded() is False


def test_timeout_is_translated(monkeypatch):
    def timeout(call):
        raise httpx.TimeoutException("timed out")

    _install(monkeypatch, timeout)

    with pytest.raises(embedder.EmbeddingServiceError, match="timed out"):
        embedder.embed("text")


def test_provider_error_payload_is_translated(monkeypatch):
    _install(
        monkeypatch,
        lambda call: httpx.Response(
            200,
            json=_payload([], success=False, errors=[{"message": "model unavailable"}]),
        ),
    )

    with pytest.raises(embedder.EmbeddingServiceError, match="model unavailable"):
        embedder.embed("text")


def test_non_json_response_is_rejected(monkeypatch):
    _install(monkeypatch, lambda call: httpx.Response(200, text="not json"))

    with pytest.raises(embedder.EmbeddingServiceError, match="non-JSON"):
        embedder.embed("text")


def test_missing_result_data_is_rejected(monkeypatch):
    _install(monkeypatch, lambda call: httpx.Response(200, json={"success": True, "result": {}}))

    with pytest.raises(embedder.EmbeddingServiceError, match="result.data"):
        embedder.embed("text")


def test_wrong_dimension_is_rejected(monkeypatch):
    _install(monkeypatch, lambda call: httpx.Response(200, json=_payload([[1.0, 2.0, 3.0]])))

    with pytest.raises(embedder.EmbeddingServiceError, match="3 dimensions"):
        embedder.embed("text")


def test_zero_vector_is_rejected(monkeypatch):
    _install(monkeypatch, lambda call: httpx.Response(200, json=_payload([_vector(0.0, 0.0)])))

    with pytest.raises(embedder.EmbeddingServiceError, match="zero vector"):
        embedder.embed("text")


def test_vector_count_mismatch_is_rejected(monkeypatch):
    _install(
        monkeypatch,
        lambda call: httpx.Response(200, json=_payload([_vector(), _vector()])),
    )

    with pytest.raises(embedder.EmbeddingServiceError, match="2 vectors for 1 inputs"):
        embedder.embed("text")


def test_health_state_flips_only_after_a_successful_request(monkeypatch):
    responses = [
        httpx.Response(500, text="down"),
        httpx.Response(200, json=_payload([_vector()])),
    ]

    def responder(call):
        return responses.pop(0)

    _install(monkeypatch, responder)

    assert embedder.is_model_loaded() is False
    with pytest.raises(embedder.EmbeddingServiceError):
        embedder.embed("first")
    assert embedder.is_model_loaded() is False

    embedder.embed("second")
    assert embedder.is_model_loaded() is True
