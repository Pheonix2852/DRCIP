"""Tests for conservative overlap-aware retrieval-context deduplication."""
from __future__ import annotations

from types import SimpleNamespace

from app.services.retriever import dedupe_overlapping_chunks


def _point(
    text: str,
    *,
    page: int = 32,
    chunk_index: int = 0,
    source: str = "disaster.pdf",
    score: float = 0.8,
):
    return SimpleNamespace(
        score=score,
        payload={
            "text": text,
            "source": source,
            "page": page,
            "chunk_index": chunk_index,
        },
    )


OVERLAP = "shared overlap text " * 6
assert len(OVERLAP) == 120


class TestDedupeOverlappingChunks:
    def test_adjacent_overlap_is_removed_without_losing_distinct_facts(self):
        first = _point(f"Phailin: about one million evacuated. {OVERLAP}", chunk_index=0)
        second = _point(f"{OVERLAP}Kerala: about 480 deaths.", chunk_index=1)

        result = dedupe_overlapping_chunks([first, second])

        assert [p.payload["text"] for p in result] == [
            f"Phailin: about one million evacuated. {OVERLAP}",
            "Kerala: about 480 deaths.",
        ]
        assert "Phailin" in result[0].payload["text"]
        assert "Kerala" in result[1].payload["text"]
        assert second.payload["text"].startswith(OVERLAP)

    def test_same_page_distinct_records_are_preserved(self):
        first = _point("Phailin: about one million evacuated.", chunk_index=0)
        second = _point("Kerala: about 480 deaths.", chunk_index=1)

        result = dedupe_overlapping_chunks([first, second])

        assert [p.payload["text"] for p in result] == [
            "Phailin: about one million evacuated.",
            "Kerala: about 480 deaths.",
        ]

    def test_short_common_prefix_is_not_treated_as_chunk_overlap(self):
        prefix = "the " * 10
        first = _point(f"Fact one. {prefix}", chunk_index=0)
        second = _point(f"{prefix}Fact two.", chunk_index=1)

        result = dedupe_overlapping_chunks([first, second])

        assert [p.payload["text"] for p in result] == [
            first.payload["text"],
            second.payload["text"],
        ]

    def test_non_adjacent_chunks_are_not_deduplicated(self):
        first = _point(f"Fact one. {OVERLAP}", chunk_index=0)
        second = _point(f"{OVERLAP}Fact two.", chunk_index=2)

        result = dedupe_overlapping_chunks([first, second])

        assert [p.payload["text"] for p in result] == [
            first.payload["text"],
            second.payload["text"],
        ]

    def test_chunk_that_is_only_overlap_is_dropped(self):
        first = _point(f"Fact one. {OVERLAP}", chunk_index=0)
        second = _point(OVERLAP, chunk_index=1)

        result = dedupe_overlapping_chunks([first, second])

        assert [p.payload["text"] for p in result] == [first.payload["text"]]

    def test_three_adjacent_chunks_are_deduplicated_in_order(self):
        first = _point(f"Fact one. {OVERLAP}", chunk_index=0)
        second = _point(f"{OVERLAP}Fact two. {OVERLAP}", chunk_index=1)
        third = _point(f"{OVERLAP}Fact three.", chunk_index=2)

        result = dedupe_overlapping_chunks([first, second, third])

        assert [p.payload["text"] for p in result] == [
            f"Fact one. {OVERLAP}",
            f"Fact two. {OVERLAP}",
            "Fact three.",
        ]

    def test_retrieval_order_and_scores_are_preserved(self):
        first = _point(f"Fact one. {OVERLAP}", chunk_index=0, score=0.9)
        second = _point(f"{OVERLAP}Fact two.", chunk_index=1, score=0.7)

        result = dedupe_overlapping_chunks([second, first])

        assert [p.score for p in result] == [0.7, 0.9]
        assert result[0].payload["text"] == "Fact two."
        assert result[1].payload["text"] == first.payload["text"]
