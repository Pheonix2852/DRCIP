"""Cloudflare Workers AI embedding client.

Public API:
    embed(text) -> list[float]
    embed_many(texts) -> list[list[float]]

The model is BAAI BGE-small-en-v1.5 (384 dimensions, CLS pooling,
L2-normalized). Inference is remote; no embedding model is loaded locally.

Required environment variables:
    CLOUDFLARE_ACCOUNT_ID
    CLOUDFLARE_API_TOKEN

Optional environment variables:
    CLOUDFLARE_EMBEDDING_MODEL (default: @cf/baai/bge-small-en-v1.5)
    CLOUDFLARE_EMBEDDING_TIMEOUT_SECONDS (default: 30)
    CLOUDFLARE_EMBEDDING_BATCH_SIZE (default: 16)
    CLOUDFLARE_EMBEDDING_POOLING (default: cls)
"""
from __future__ import annotations

import math
import os
import threading
from typing import Any, Sequence

import httpx
from dotenv import load_dotenv

load_dotenv()

MODEL_NAME = os.getenv(
    "CLOUDFLARE_EMBEDDING_MODEL", "@cf/baai/bge-small-en-v1.5"
)
EMBEDDING_DIM = 384
_DEFAULT_TIMEOUT_SECONDS = 30.0
_DEFAULT_BATCH_SIZE = 16

_client: httpx.Client | None = None
_client_lock = threading.Lock()


class EmbeddingServiceError(RuntimeError):
    """Raised when the remote embedding provider cannot return valid vectors."""


def _get_client() -> httpx.Client:
    """Create one reusable, thread-safe HTTP client per process."""
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                try:
                    timeout_seconds = float(
                        os.getenv(
                            "CLOUDFLARE_EMBEDDING_TIMEOUT_SECONDS",
                            str(_DEFAULT_TIMEOUT_SECONDS),
                        )
                    )
                except ValueError as exc:
                    raise EmbeddingServiceError(
                        "CLOUDFLARE_EMBEDDING_TIMEOUT_SECONDS must be a number."
                    ) from exc
                if timeout_seconds <= 0:
                    raise EmbeddingServiceError(
                        "CLOUDFLARE_EMBEDDING_TIMEOUT_SECONDS must be positive."
                    )
                _client = httpx.Client(
                    timeout=httpx.Timeout(timeout_seconds, connect=min(10.0, timeout_seconds)),
                    headers={"Content-Type": "application/json"},
                )
    return _client


def _configuration() -> tuple[str, str, str]:
    account_id = os.getenv("CLOUDFLARE_ACCOUNT_ID", "").strip()
    api_token = os.getenv("CLOUDFLARE_API_TOKEN", "").strip()
    model_name = os.getenv(
        "CLOUDFLARE_EMBEDDING_MODEL", "@cf/baai/bge-small-en-v1.5"
    ).strip()

    missing = []
    if not account_id:
        missing.append("CLOUDFLARE_ACCOUNT_ID")
    if not api_token:
        missing.append("CLOUDFLARE_API_TOKEN")
    if missing:
        raise EmbeddingServiceError(
            "Missing required Cloudflare configuration: " + ", ".join(missing)
        )
    if not model_name:
        raise EmbeddingServiceError("CLOUDFLARE_EMBEDDING_MODEL cannot be empty.")
    return account_id, api_token, model_name


def _normalise(vector: Sequence[Any]) -> list[float]:
    """Validate and L2-normalise one vector, matching the old embed() contract."""
    if len(vector) != EMBEDDING_DIM:
        raise EmbeddingServiceError(
            f"Embedding model returned {len(vector)} dimensions; "
            f"expected {EMBEDDING_DIM}. Check the configured model and Qdrant schema."
        )

    values: list[float] = []
    for item in vector:
        try:
            value = float(item)
        except (TypeError, ValueError) as exc:
            raise EmbeddingServiceError("Embedding response contains a non-numeric value.") from exc
        if not math.isfinite(value):
            raise EmbeddingServiceError("Embedding response contains NaN or infinity.")
        values.append(value)

    norm = math.sqrt(sum(value * value for value in values))
    if norm == 0.0:
        raise EmbeddingServiceError("Embedding provider returned a zero vector.")
    return [value / norm for value in values]


def _request_batch(texts: Sequence[str]) -> list[list[float]]:
    account_id, api_token, model_name = _configuration()
    url = (
        "https://api.cloudflare.com/client/v4/accounts/"
        f"{account_id}/ai/run/{model_name}"
    )
    client = _get_client()

    try:
        response = client.post(
            url,
            headers={"Authorization": f"Bearer {api_token}"},
            json={"text": list(texts), "pooling": os.getenv("CLOUDFLARE_EMBEDDING_POOLING", "cls")},
        )
    except httpx.TimeoutException as exc:
        raise EmbeddingServiceError(
            "Cloudflare Workers AI embedding request timed out."
        ) from exc
    except httpx.RequestError as exc:
        raise EmbeddingServiceError(
            f"Could not reach Cloudflare Workers AI: {exc.__class__.__name__}."
        ) from exc

    if response.is_error:
        # Do not include request headers or secrets in the raised error.
        detail = response.text[:500]
        raise EmbeddingServiceError(
            f"Cloudflare Workers AI returned HTTP {response.status_code}: {detail}"
        )

    try:
        payload = response.json()
    except ValueError as exc:
        raise EmbeddingServiceError("Cloudflare returned a non-JSON response.") from exc

    if not isinstance(payload, dict):
        raise EmbeddingServiceError("Cloudflare returned an unexpected response format.")
    if payload.get("success") is False:
        errors = payload.get("errors") or []
        messages = [str(item.get("message", item)) for item in errors]
        raise EmbeddingServiceError(
            "Cloudflare Workers AI reported an error: "
            + ("; ".join(messages) if messages else "unspecified provider error")
        )

    result = payload.get("result")
    if not isinstance(result, dict):
        raise EmbeddingServiceError("Cloudflare response is missing its result object.")
    raw_vectors = result.get("data")
    if not isinstance(raw_vectors, list):
        raise EmbeddingServiceError("Cloudflare response is missing result.data.")

    # Some providers return a flat vector for a one-item request; normalise it
    # to a list-of-vectors so callers always receive a consistent shape.
    if raw_vectors and isinstance(raw_vectors[0], (int, float)):
        raw_vectors = [raw_vectors]

    if len(raw_vectors) != len(texts):
        raise EmbeddingServiceError(
            f"Cloudflare returned {len(raw_vectors)} vectors for {len(texts)} inputs."
        )

    return [_normalise(vector) for vector in raw_vectors]


def embed_many(texts: Sequence[str]) -> list[list[float]]:
    """Embed multiple strings in batches, preserving input order."""
    if isinstance(texts, (str, bytes)):
        raise TypeError("embed_many expects a sequence of strings, not one string.")
    if not texts:
        return []
    if any(not isinstance(text, str) for text in texts):
        raise TypeError("Every item passed to embed_many must be a string.")

    try:
        batch_size = int(
            os.getenv("CLOUDFLARE_EMBEDDING_BATCH_SIZE", str(_DEFAULT_BATCH_SIZE))
        )
    except ValueError as exc:
        raise EmbeddingServiceError(
            "CLOUDFLARE_EMBEDDING_BATCH_SIZE must be an integer."
        ) from exc
    if batch_size < 1:
        raise EmbeddingServiceError(
            "CLOUDFLARE_EMBEDDING_BATCH_SIZE must be at least 1."
        )

    output: list[list[float]] = []
    for start in range(0, len(texts), batch_size):
        batch = texts[start : start + batch_size]
        output.extend(_request_batch(batch))
    return output


def embed(text: str) -> list[float]:
    """Encode one string into a normalised 384-dimensional vector."""
    if not isinstance(text, str):
        raise TypeError("embed expects a string.")
    vectors = embed_many([text])
    return vectors[0]



