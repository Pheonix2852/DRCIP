"""
Unit tests for the PDF chunker.

These tests run fully offline — no Qdrant, no Groq, no model loading.
"""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest

from ingest.chunker import CHUNK_OVERLAP, CHUNK_SIZE, extract_chunks
from ingest.ingest import embed_and_upsert

PDF_PATH = Path(__file__).resolve().parents[1] / "disaster.pdf"


@pytest.fixture(scope="module")
def chunks():
    return list(extract_chunks(str(PDF_PATH)))


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestChunkerBasic:
    def test_single_short_page_yields_one_chunk(self, monkeypatch):
        text = "Evacuate immediately when a Flood Alert Level 3 is declared."

        monkeypatch.setattr(
            "ingest.chunker.PdfReader",
            lambda path: _FakePdfReader([text]),
        )
        chunks = list(extract_chunks("fake.pdf"))
        assert len(chunks) == 1
        assert chunks[0]["text"] == text
        assert chunks[0]["page"] == 1
        assert chunks[0]["source"] == "fake.pdf"

    def test_long_page_yields_multiple_chunks(self, monkeypatch):
        # Create text definitely longer than CHUNK_SIZE
        text = "word " * 300  # 1500 chars
        monkeypatch.setattr(
            "ingest.chunker.PdfReader",
            lambda path: _FakePdfReader([text]),
        )
        chunks = list(extract_chunks("fake.pdf"))
        assert len(chunks) > 1

    def test_chunk_size_respected(self, monkeypatch):
        text = "A" * (CHUNK_SIZE * 3)
        monkeypatch.setattr(
            "ingest.chunker.PdfReader",
            lambda path: _FakePdfReader([text]),
        )
        chunks = list(extract_chunks("fake.pdf"))
        for c in chunks:
            assert len(c["text"]) <= CHUNK_SIZE

    def test_empty_page_skipped(self, monkeypatch):
        monkeypatch.setattr(
            "ingest.chunker.PdfReader",
            lambda path: _FakePdfReader(["", "   ", "Real content here for testing."]),
        )
        chunks = list(extract_chunks("fake.pdf"))
        # Only the third page should produce chunks
        assert all(c["page"] == 3 for c in chunks)

    def test_page_metadata_is_accurate(self, monkeypatch):
        monkeypatch.setattr(
            "ingest.chunker.PdfReader",
            lambda path: _FakePdfReader([
                "Page one content about flood evacuation procedures and emergency response.",
                "Page two content about earthquake safety guidelines and shelter locations.",
            ]),
        )
        chunks = list(extract_chunks("fake.pdf"))
        pages = [c["page"] for c in chunks]
        assert 1 in pages
        assert 2 in pages

    def test_chunk_ids_are_deterministic(self, monkeypatch):
        text = "Some consistent text for testing determinism."
        monkeypatch.setattr(
            "ingest.chunker.PdfReader",
            lambda path: _FakePdfReader([text]),
        )
        run1 = [c["id"] for c in extract_chunks("fake.pdf")]
        run2 = [c["id"] for c in extract_chunks("fake.pdf")]
        assert run1 == run2

    def test_chunk_index_is_global_sequential(self, monkeypatch):
        monkeypatch.setattr(
            "ingest.chunker.PdfReader",
            lambda path: _FakePdfReader(
                ["First page with some content.", "Second page with more content."]
            ),
        )
        chunks = list(extract_chunks("fake.pdf"))
        indices = [c["chunk_index"] for c in chunks]
        assert indices == list(range(len(chunks)))

    def test_overlap_shares_content(self, monkeypatch):
        # Long enough page to get at least two chunks
        text = ("The quick brown fox jumped over the lazy dog. " * 30)
        monkeypatch.setattr(
            "ingest.chunker.PdfReader",
            lambda path: _FakePdfReader([text]),
        )
        chunks = list(extract_chunks("fake.pdf"))
        if len(chunks) >= 2:
            # End of chunk 0 and start of chunk 1 should overlap
            tail = chunks[0]["text"][-CHUNK_OVERLAP:]
            # They share some characters (overlap region)
            assert tail[:20] in chunks[1]["text"]


class TestTableAwareChunking:
    def test_page_32_has_one_chunk_per_event(self, chunks):
        page_32 = [c for c in chunks if c["page"] == 32]

        assert len(page_32) == 14
        assert all(c["text"].startswith("Event: ") for c in page_32)

    @pytest.mark.parametrize(
        ("event", "date", "place", "fact"),
        [
            ("Cyclone Phailin", "12 Oct 2013", "Odisha", "About one million people evacuated"),
            ("Kerala floods", "Aug 2018", "Kerala", "About 480 deaths"),
            ("Cyclone Fani", "3 May 2019", "Odisha", "About 1.2 million evacuated"),
            ("Cyclone Amphan", "20 May 2020", "West Bengal and Odisha", "Sundarbans and Kolkata"),
            ("Chamoli flood", "7 Feb 2021", "Uttarakhand", "hydropower projects hit"),
            ("Cyclone Biparjoy", "Jun 2023", "Gujarat (Kutch)", "Large pre-emptive evacuation"),
        ],
    )
    def test_selected_page_32_records_keep_their_fields_together(
        self, chunks, event, date, place, fact
    ):
        matches = [
            c
            for c in chunks
            if c["page"] == 32 and c["text"].startswith(f"Event: {event}")
        ]

        assert len(matches) == 1
        text = matches[0]["text"]
        assert f"Date: {date}" in text
        assert f"Place: {place}" in text
        assert fact in text

    def test_page_32_does_not_mix_unrelated_events(self, chunks):
        page_32 = [c for c in chunks if c["page"] == 32]
        event_names = [
            "Mumbai floods",
            "Kosi flood",
            "Heat wave",
            "Uttarakhand floods",
            "Cyclone Phailin",
            "Chennai floods",
            "Kerala floods",
            "Cyclone Fani",
            "Cyclone Amphan",
            "Chamoli flood",
            "Yamuna record flood",
            "Cyclone Biparjoy",
            "South Lhonak GLOF",
            "Wayanad landslides",
        ]

        assert len(page_32) == len(event_names)
        for chunk in page_32:
            assert sum(name in chunk["text"] for name in event_names) == 1

    def test_page_31_event_table_is_also_row_aware(self, chunks):
        page_31_events = [
            c for c in chunks if c["page"] == 31 and c["text"].startswith("Event: ")
        ]

        assert len(page_31_events) == 5
        bhopal = next(c for c in page_31_events if c["text"].startswith("Event: Bhopal"))
        assert "Date: 2 to 3 Dec 1984" in bhopal["text"]
        assert "Place: Madhya Pradesh" in bhopal["text"]
        assert "thousands killed immediately" in bhopal["text"]
        assert "very many more affected for decades" in bhopal["text"]

    def test_repeated_wrapped_event_name_is_kept_with_its_record(self, chunks):
        kedarnath = [
            c
            for c in chunks
            if c["page"] == 32
            and c["text"].startswith("Event: Uttarakhand floods (Kedarnath)")
        ]

        assert len(kedarnath) == 1
        assert "thousands dead or missing" in kedarnath[0]["text"]

    def test_layout_extraction_failure_falls_back_to_plain_text(self, monkeypatch):
        text = "Event Date Place Key facts (approximate) " + (
            "Cyclone Phailin about one million people evacuated. " * 3
        )

        class BrokenLayoutPage:
            def extract_text(self, *args, **kwargs):
                if kwargs:
                    raise RuntimeError("layout extraction unavailable")
                return text

        class BrokenLayoutReader:
            pages = [BrokenLayoutPage()]

        monkeypatch.setattr(
            "ingest.chunker.PdfReader",
            lambda path: BrokenLayoutReader(),
        )

        result = list(extract_chunks("fake.pdf"))

        assert result
        assert any("Cyclone Phailin" in chunk["text"] for chunk in result)


# ── Fake pypdf reader ─────────────────────────────────────────────────────────

class _FakePage:
    def __init__(self, text: str):
        self._text = text

    def extract_text(self) -> str:
        return self._text


class _FakePdfReader:
    def __init__(self, page_texts: list[str]):
        self.pages = [_FakePage(t) for t in page_texts]


class TestIngestEmbedding:
    @staticmethod
    def _chunk(index: int) -> dict:
        return {
            "id": f"00000000-0000-0000-0000-00000000000{index}",
            "text": f"chunk text {index}",
            "source": "disaster.pdf",
            "page": index + 1,
            "chunk_index": index,
        }

    def test_embed_and_upsert_batches_and_preserves_payload(self):
        client = MagicMock()
        chunks = [self._chunk(0), self._chunk(1), self._chunk(2)]
        embedded: list[list[str]] = []

        def fake_embed_many(texts):
            embedded.append(list(texts))
            return [[0.1] * 384 for _ in texts]

        total = embed_and_upsert(
            client, "disaster_docs", chunks, batch_size=2, embed_many=fake_embed_many
        )

        assert total == 3
        assert embedded == [
            ["chunk text 0", "chunk text 1"],
            ["chunk text 2"],
        ]
        assert client.upsert.call_count == 2

        first_points = client.upsert.call_args_list[0].kwargs["points"]
        assert [point.id for point in first_points] == [chunks[0]["id"], chunks[1]["id"]]
        assert first_points[0].payload == {
            "text": "chunk text 0",
            "source": "disaster.pdf",
            "page": 1,
            "chunk_index": 0,
        }
        assert first_points[0].vector == [0.1] * 384

    def test_vector_count_mismatch_aborts_before_upsert(self):
        client = MagicMock()

        with pytest.raises(RuntimeError, match="0 vectors for 1 chunks"):
            embed_and_upsert(
                client,
                "disaster_docs",
                [self._chunk(0)],
                embed_many=lambda texts: [],
            )

        client.upsert.assert_not_called()

    def test_empty_chunks_are_a_noop(self):
        client = MagicMock()

        assert embed_and_upsert(client, "disaster_docs", [], embed_many=lambda texts: []) == 0
        client.upsert.assert_not_called()
