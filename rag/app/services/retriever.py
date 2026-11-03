"""
Retrieval service — vector search against Qdrant Cloud.

Returns up to `top_k` chunks whose cosine similarity to the query vector
is ≥ `score_threshold`.  An empty list triggers abstention upstream.
"""
from __future__ import annotations

import copy
from typing import Any

from qdrant_client import QdrantClient
from qdrant_client.http.models import ScoredPoint

# Adjacent ingestion chunks deliberately share a character overlap. Only trim
# substantial shared prefixes; small coincidental phrases are left untouched.
_MIN_OVERLAP_CHARS = 60
_MAX_OVERLAP_CHARS = 200


def _payload(point: Any) -> dict[str, Any]:
    payload = getattr(point, "payload", None)
    return payload if isinstance(payload, dict) else {}


def _text(point: Any) -> str:
    return str(_payload(point).get("text", ""))


def _chunk_index(point: Any) -> int | None:
    value = _payload(point).get("chunk_index")
    return value if isinstance(value, int) else None


def _overlap_length(previous: str, current: str) -> int:
    """Return the longest suffix/prefix match that looks like chunk overlap."""
    limit = min(len(previous), len(current), _MAX_OVERLAP_CHARS)
    for length in range(limit, _MIN_OVERLAP_CHARS - 1, -1):
        if previous[-length:] == current[:length]:
            return length
    return 0


def _with_text(point: Any, text: str) -> Any:
    if hasattr(point, "model_copy"):
        cloned = point.model_copy(deep=True)
    else:
        cloned = copy.deepcopy(point)
    cloned.payload["text"] = text
    return cloned


def dedupe_overlapping_chunks(chunks: list[ScoredPoint]) -> list[ScoredPoint]:
    """Trim repeated adjacent-chunk overlap without removing distinct facts.

    Only chunks sharing the same source, page and consecutive ``chunk_index``
    are compared. The later chunk's repeated prefix is removed; the chunk is
    dropped only when nothing distinct remains. Ranking order is preserved.
    """
    if len(chunks) < 2:
        return list(chunks)

    by_page: dict[tuple[Any, Any], list[int]] = {}
    for index, point in enumerate(chunks):
        payload = _payload(point)
        by_page.setdefault((payload.get("source"), payload.get("page")), []).append(index)

    result = list(chunks)
    for indices in by_page.values():
        if len(indices) < 2:
            continue
        ordered = sorted(
            indices,
            key=lambda index: _chunk_index(chunks[index])
            if _chunk_index(chunks[index]) is not None
            else index,
        )
        for previous_index, current_index in zip(ordered, ordered[1:]):
            previous_chunk = _chunk_index(chunks[previous_index])
            current_chunk = _chunk_index(chunks[current_index])
            if (
                previous_chunk is None
                or current_chunk is None
                or current_chunk != previous_chunk + 1
            ):
                continue

            overlap = _overlap_length(_text(chunks[previous_index]), _text(chunks[current_index]))
            if overlap == 0:
                continue

            trimmed = _text(chunks[current_index])[overlap:].lstrip()
            result[current_index] = _with_text(chunks[current_index], trimmed)

    return [point for point in result if _text(point).strip()]


def search(
    client: QdrantClient,
    collection: str,
    vector: list[float],
    top_k: int,
    score_threshold: float,
) -> list[ScoredPoint]:
    """
    Perform cosine-similarity search and return matching points.

    Each returned ScoredPoint carries:
      .score   — cosine similarity (0-1, higher = more relevant)
      .payload — {"text", "source", "page", "chunk_index"}
    """
    result = client.query_points(
        collection_name=collection,
        query=vector,
        limit=top_k,
        score_threshold=score_threshold,
        with_payload=True,
    )
    return result.points
