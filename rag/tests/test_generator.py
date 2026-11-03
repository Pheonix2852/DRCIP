"""Focused tests for generation reliability and prompt guidance."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.services import generator


def _chunk(text: str = "Grounded document context."):
    return SimpleNamespace(
        score=0.9,
        payload={
            "text": text,
            "source": "disaster.pdf",
            "page": 1,
            "chunk_index": 0,
        },
    )


def _choice(content: str, finish_reason: str | None = "stop"):
    return SimpleNamespace(
        message=SimpleNamespace(content=content),
        finish_reason=finish_reason,
    )


def _response(*choices):
    return SimpleNamespace(choices=list(choices))


@pytest.fixture(autouse=True)
def _no_retry_sleep(monkeypatch):
    monkeypatch.setattr(generator, "_RETRY_DELAY_SECONDS", 0)


class TestGenerate:
    def test_normal_completion_returns_content_once(self):
        client = MagicMock()
        client.chat.completions.create.return_value = _response(_choice("Grounded answer."))

        answer = generator.generate(
            client=client,
            model="test-model",
            question="Question?",
            chunks=[_chunk()],
        )

        assert answer == "Grounded answer."
        assert client.chat.completions.create.call_count == 1

    def test_generate_sends_grouped_attribution_context(self):
        client = MagicMock()
        client.chat.completions.create.return_value = _response(_choice("Answer."))
        chunks = [
            _chunk(
                "[SEC 3.1.4 | HAZARD: Flood | PHASE: Recovery | AUTHORITY: NDMA] "
                "Post-disaster recovery: dewatering and sanitation."
            ),
            _chunk(
                "Event: Kerala floods | Date: Aug 2018 | Place: Kerala | "
                "Key facts: large rescue by fishermen, NDRF and forces"
            ),
        ]

        generator.generate(
            client=client,
            model="test-model",
            question="What response activities were carried out after the Kerala floods?",
            chunks=chunks,
        )

        messages = client.chat.completions.create.call_args.kwargs["messages"]
        user_content = messages[1]["content"]
        assert "Event-specific records" in user_content
        assert "Reference excerpts" in user_content
        assert "event record: Kerala floods" in user_content
        assert "reference: Flood — Recovery" in user_content
        assert "Answer requirements" in user_content
        assert "not evidence that the event followed them" in user_content

    def test_empty_completion_retries_then_succeeds(self):
        client = MagicMock()
        client.chat.completions.create.side_effect = [
            _response(_choice("")),
            _response(_choice("Recovered answer.")),
        ]

        answer = generator.generate(
            client=client,
            model="test-model",
            question="Question?",
            chunks=[_chunk()],
        )

        assert answer == "Recovered answer."
        assert client.chat.completions.create.call_count == 2

    def test_empty_choices_retries_then_succeeds(self):
        client = MagicMock()
        client.chat.completions.create.side_effect = [
            _response(),
            _response(_choice("Recovered answer.")),
        ]

        answer = generator.generate(
            client=client,
            model="test-model",
            question="Question?",
            chunks=[_chunk()],
        )

        assert answer == "Recovered answer."
        assert client.chat.completions.create.call_count == 2

    def test_truncated_completion_retries_with_larger_limit(self):
        client = MagicMock()
        client.chat.completions.create.side_effect = [
            _response(_choice("Cut off", finish_reason="length")),
            _response(_choice("Complete answer.", finish_reason="stop")),
        ]

        answer = generator.generate(
            client=client,
            model="test-model",
            question="Question?",
            chunks=[_chunk()],
        )

        assert answer == "Complete answer."
        calls = client.chat.completions.create.call_args_list
        assert len(calls) == 2
        assert calls[1].kwargs["max_tokens"] > calls[0].kwargs["max_tokens"]

    def test_truncation_exhaustion_raises(self):
        client = MagicMock()
        client.chat.completions.create.side_effect = [
            _response(_choice("Cut off", finish_reason="length")),
            _response(_choice("Still cut off", finish_reason="length")),
        ]

        with pytest.raises(generator.GenerationTruncatedError):
            generator.generate(
                client=client,
                model="test-model",
                question="Question?",
                chunks=[_chunk()],
            )

        assert client.chat.completions.create.call_count == 2

    def test_empty_exhaustion_raises(self):
        client = MagicMock()
        client.chat.completions.create.side_effect = [
            _response(_choice("")),
            _response(_choice("   ")),
        ]

        with pytest.raises(generator.GenerationUnusableError):
            generator.generate(
                client=client,
                model="test-model",
                question="Question?",
                chunks=[_chunk()],
            )

        assert client.chat.completions.create.call_count == 2

    def test_provider_error_retries_then_succeeds(self):
        client = MagicMock()
        client.chat.completions.create.side_effect = [
            RuntimeError("temporary provider failure"),
            _response(_choice("Recovered answer.")),
        ]

        answer = generator.generate(
            client=client,
            model="test-model",
            question="Question?",
            chunks=[_chunk()],
        )

        assert answer == "Recovered answer."
        assert client.chat.completions.create.call_count == 2

    def test_provider_error_exhaustion_reraises(self):
        client = MagicMock()
        client.chat.completions.create.side_effect = [
            RuntimeError("provider down"),
            RuntimeError("provider still down"),
        ]

        with pytest.raises(RuntimeError, match="still down"):
            generator.generate(
                client=client,
                model="test-model",
                question="Question?",
                chunks=[_chunk()],
            )

        assert client.chat.completions.create.call_count == 2

    def test_no_chunks_returns_sentinel_without_calling_provider(self):
        client = MagicMock()

        assert (
            generator.generate(
                client=client,
                model="test-model",
                question="Question?",
                chunks=[],
            )
            == generator._SENTINEL
        )
        client.chat.completions.create.assert_not_called()


class TestEvidenceAttribution:
    def test_event_row_is_classified_as_event_record(self):
        kind, label = generator._classify_excerpt(
            "Event: Kerala floods | Date: Aug 2018 | Place: Kerala | "
            "Key facts: About 480 deaths; large rescue by fishermen, NDRF and forces"
        )

        assert kind == "event record"
        assert label == "Kerala floods"

    def test_reference_metadata_is_classified_as_reference(self):
        kind, label = generator._classify_excerpt(
            "[SEC 3.1.4 | HAZARD: Flood | PHASE: Recovery | AUTHORITY: NDMA] "
            "Post-disaster recovery: dewatering and sanitation."
        )

        assert kind == "reference"
        assert label == "Flood — Recovery"

    def test_historical_example_in_reference_text_is_not_an_event_record(self):
        kind, label = generator._classify_excerpt(
            "India's worst industrial disaster was the Bhopal gas tragedy "
            "(2 to 3 December 1984; thousands killed and very many more "
            "injured over decades)."
        )

        assert kind == "reference"
        assert label == ""

    def test_context_groups_event_records_before_reference_guidance(self):
        chunks = [
            _chunk(
                "[SEC 3.1.4 | HAZARD: Flood | PHASE: Recovery | AUTHORITY: NDMA] "
                "Post-disaster recovery: dewatering and sanitation."
            ),
            _chunk(
                "Event: Kerala floods | Date: Aug 2018 | Place: Kerala | "
                "Key facts: About 480 deaths; large rescue by fishermen, NDRF and forces"
            ),
        ]

        context = generator._build_context(chunks)

        assert context.index("Event-specific records") < context.index(
            "Reference excerpts"
        )
        assert (
            "[Excerpt 2 | disaster.pdf — Page 1 | event record: Kerala floods]"
            in context
        )
        assert (
            "[Excerpt 1 | disaster.pdf — Page 1 | reference: Flood — Recovery]"
            in context
        )
        assert "dewatering and sanitation" in context
        assert "large rescue by fishermen" in context

    def test_context_preserves_original_excerpt_numbers(self):
        chunks = [
            _chunk("Reference-only text."),
            _chunk(
                "Event: Kosi flood | Date: Aug 2008 | Place: Bihar | "
                "Key facts: millions affected"
            ),
        ]

        context = generator._build_context(chunks)

        assert context.count("[Excerpt 1 |") == 1
        assert context.count("[Excerpt 2 |") == 1
        assert "Reference-only text." in context
        assert "Event: Kosi flood" in context


class TestPromptGuidance:
    def test_prompt_distinguishes_approximate_values_from_missing_values(self):
        prompt = generator._SYSTEM_PROMPT.lower()
        assert "approximate" in prompt
        assert "do not turn an approximate value into a precise number" in prompt
        assert "not specified" in prompt

    def test_prompt_distinguishes_event_records_from_general_guidance(self):
        prompt = generator._SYSTEM_PROMPT.lower()
        assert "event-specific records" in prompt
        assert "reference excerpts" in prompt
        assert "recommendation is not evidence" in prompt

    def test_prompt_distinguishes_during_event_from_post_event_recovery(self):
        prompt = " ".join(generator._SYSTEM_PROMPT.lower().split())
        assert "during an event" in prompt
        assert "post-event recovery" in prompt
        assert (
            "do not describe a during-event action as an action carried out after"
            in prompt
        )

    def test_prompt_requires_event_specific_limitation_without_abstention(self):
        prompt = " ".join(generator._SYSTEM_PROMPT.lower().split())
        assert "does not establish post-event actions" in prompt
        assert "general guidance (not event-specific)" in prompt
        assert "do not return insufficient_context when the excerpts support general guidance" in prompt
        assert "do not use this when the excerpts support a partial answer" in prompt
