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


class _ProviderError(Exception):
    def __init__(self, body):
        super().__init__("provider detail")
        self.body = body


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

    def test_tool_prompt_routes_current_totals_to_live_tools(self):
        prompt = " ".join(generator._TOOL_SYSTEM_PROMPT.lower().split())
        assert "overall total, count, availability, or current status" in prompt
        assert "never present a value from a document excerpt as the current operational total" in prompt
        assert "historical, event-specific, policy, guideline and report questions" in prompt

    def test_synthesis_prompt_forbids_document_count_substitution(self):
        prompt = " ".join(generator._SYNTHESIS_SYSTEM_PROMPT.lower().split())
        assert "the live result is the only valid source" in prompt
        assert "never substitute a number from a document excerpt" in prompt


class TestToolCallFinishHandling:
    schema = {
        "type": "object",
        "properties": {
            "status": {"type": "string"},
            "limit": {"type": "integer"},
        },
        "additionalProperties": False,
    }
    tools = [
        {
            "name": "get_active_incidents",
            "description": "Active incidents.",
            "parameters": schema,
        }
    ]

    @staticmethod
    def _tool_call(call_id, name, arguments):
        return SimpleNamespace(
            id=call_id,
            function=SimpleNamespace(name=name, arguments=arguments),
        )

    def test_single_valid_tool_call_finish_is_returned_without_retry(self):
        client = MagicMock()
        client.chat.completions.create.return_value = _response(
            SimpleNamespace(
                message=SimpleNamespace(
                    content="",
                    tool_calls=[
                        self._tool_call("call_1", "get_active_incidents", "{}")
                    ],
                ),
                finish_reason="tool_calls",
            )
        )

        content, proposals = generator.propose(
            client=client,
            model="test-model",
            question="Total incidents",
            chunks=[],
            tools=self.tools,
        )

        assert content == ""
        assert proposals == [
            {
                "id": "call_1",
                "name": "get_active_incidents",
                "arguments": {},
            }
        ]
        assert client.chat.completions.create.call_count == 1

    def test_multiple_valid_tool_calls_are_all_returned_without_retry(self):
        client = MagicMock()
        client.chat.completions.create.return_value = _response(
            SimpleNamespace(
                message=SimpleNamespace(
                    content="",
                    tool_calls=[
                        self._tool_call(
                            "call_1",
                            "get_active_incidents",
                            '{"status":"REPORTED"}',
                        ),
                        self._tool_call("call_2", "get_active_incidents", "{}"),
                    ],
                ),
                finish_reason="tool_calls",
            )
        )

        _, proposals = generator.propose(
            client=client,
            model="test-model",
            question="Total active incidents",
            chunks=[],
            tools=self.tools,
        )

        assert [proposal["id"] for proposal in proposals] == ["call_1", "call_2"]
        assert [proposal["arguments"] for proposal in proposals] == [
            {"status": "REPORTED"},
            {},
        ]
        assert client.chat.completions.create.call_count == 1

    def test_malformed_arguments_are_surfaced_without_retry(self):
        client = MagicMock()
        client.chat.completions.create.return_value = _response(
            SimpleNamespace(
                message=SimpleNamespace(
                    content="",
                    tool_calls=[
                        self._tool_call(
                            "call_1", "get_active_incidents", "{not-json"
                        )
                    ],
                ),
                finish_reason="tool_calls",
            )
        )

        _, proposals = generator.propose(
            client=client,
            model="test-model",
            question="Total incidents",
            chunks=[],
            tools=self.tools,
        )

        assert proposals == [
            {
                "id": "call_1",
                "name": "get_active_incidents",
                "arguments": {},
                "error_code": "MALFORMED_ARGUMENTS",
            }
        ]
        assert client.chat.completions.create.call_count == 1

    def test_unknown_tool_is_surfaced_without_retry(self):
        client = MagicMock()
        client.chat.completions.create.return_value = _response(
            SimpleNamespace(
                message=SimpleNamespace(
                    content="",
                    tool_calls=[
                        self._tool_call("call_1", "execute_sql", '{"query":"x"}')
                    ],
                ),
                finish_reason="tool_calls",
            )
        )

        _, proposals = generator.propose(
            client=client,
            model="test-model",
            question="Total incidents",
            chunks=[],
            tools=self.tools,
        )

        assert proposals == [
            {
                "id": "call_1",
                "name": "execute_sql",
                "arguments": {},
                "error_code": "UNKNOWN_TOOL",
            }
        ]
        assert client.chat.completions.create.call_count == 1

    def test_tool_calls_finish_reason_without_calls_is_unusable(self):
        client = MagicMock()
        client.chat.completions.create.return_value = _response(
            SimpleNamespace(
                message=SimpleNamespace(content="", tool_calls=[]),
                finish_reason="tool_calls",
            )
        )

        with pytest.raises(generator.GenerationUnusableError):
            generator.propose(
                client=client,
                model="test-model",
                question="Total incidents",
                chunks=[],
                tools=self.tools,
            )

        assert client.chat.completions.create.call_count == 2

    def test_length_finish_retries_then_raises_truncated(self):
        client = MagicMock()
        client.chat.completions.create.side_effect = [
            _response(_choice("partial", finish_reason="length")),
            _response(_choice("still partial", finish_reason="length")),
        ]

        with pytest.raises(generator.GenerationTruncatedError):
            generator.propose(
                client=client,
                model="test-model",
                question="Total incidents",
                chunks=[],
                tools=self.tools,
            )

        assert client.chat.completions.create.call_count == 2

    def test_transient_provider_error_retries_once(self):
        client = MagicMock()
        client.chat.completions.create.side_effect = [
            RuntimeError("temporary provider failure"),
            _response(
                SimpleNamespace(
                    message=SimpleNamespace(
                        content="",
                        tool_calls=[
                            self._tool_call(
                                "call_1", "get_active_incidents", "{}"
                            )
                        ],
                    ),
                    finish_reason="tool_calls",
                )
            ),
        ]

        _, proposals = generator.propose(
            client=client,
            model="test-model",
            question="Total incidents",
            chunks=[],
            tools=self.tools,
        )

        assert proposals[0]["name"] == "get_active_incidents"
        assert client.chat.completions.create.call_count == 2

    def test_propose_uses_tool_reminder_for_document_chunks(self):
        client = MagicMock()
        client.chat.completions.create.return_value = _response(
            SimpleNamespace(
                message=SimpleNamespace(
                    content="",
                    tool_calls=[
                        self._tool_call("call_1", "get_active_incidents", "{}")
                    ],
                ),
                finish_reason="tool_calls",
            )
        )

        generator.propose(
            client=client,
            model="test-model",
            question="Total incidents",
            chunks=[_chunk("Historical total incidents: 120")],
            tools=self.tools,
        )

        messages = client.chat.completions.create.call_args.kwargs["messages"]
        assert generator._TOOL_ATTRIBUTION_REMINDER in messages[1]["content"]
        assert generator._ATTRIBUTION_REMINDER not in messages[1]["content"]


class TestToolArgumentNormalization:
    schema = {
        "type": "object",
        "properties": {
            "resource_type": {"type": "string"},
            "latitude": {"type": "number"},
            "limit": {"type": "integer", "default": 10},
        },
        "required": ["latitude"],
    }

    def test_provider_schema_allows_null_only_for_optional_properties(self):
        parameters = generator._provider_parameters(self.schema)

        assert parameters["properties"]["resource_type"] == {
            "anyOf": [{"type": "string"}, {"type": "null"}]
        }
        assert parameters["properties"]["limit"] == {
            "anyOf": [{"type": "integer", "default": 10}, {"type": "null"}]
        }
        assert parameters["properties"]["latitude"] == {"type": "number"}
        assert parameters["required"] == ["latitude"]
        assert generator._provider_parameters(self.schema) is not parameters

    def test_parser_drops_null_optional_arguments(self):
        tool_call = SimpleNamespace(
            id="call_1",
            function=SimpleNamespace(
                name="get_resource_stock",
                arguments=(
                    '{"resource_type": null, "latitude": 22.5, '
                    '"limit": 10}'
                ),
            ),
        )

        proposals = generator._parse_tool_calls(
            [tool_call],
            {"get_resource_stock": self.schema},
        )

        assert proposals == [
            {
                "id": "call_1",
                "name": "get_resource_stock",
                "arguments": {"latitude": 22.5, "limit": 10},
            }
        ]

    def test_parser_rejects_null_required_arguments(self):
        tool_call = SimpleNamespace(
            id="call_1",
            function=SimpleNamespace(
                name="get_resource_stock",
                arguments='{"latitude": null, "limit": 10}',
            ),
        )

        proposals = generator._parse_tool_calls(
            [tool_call],
            {"get_resource_stock": self.schema},
        )

        assert proposals == [
            {
                "id": "call_1",
                "name": "get_resource_stock",
                "arguments": {"latitude": None, "limit": 10},
                "error_code": "INVALID_ARGUMENTS",
            }
        ]

    def test_parser_rejects_unknown_arguments(self):
        tool_call = SimpleNamespace(
            id="call_1",
            function=SimpleNamespace(
                name="get_resource_stock",
                arguments='{"latitude": 22.5, "unexpected": null}',
            ),
        )

        proposals = generator._parse_tool_calls(
            [tool_call],
            {"get_resource_stock": self.schema},
        )

        assert proposals == [
            {
                "id": "call_1",
                "name": "get_resource_stock",
                "arguments": {"latitude": 22.5, "unexpected": None},
                "error_code": "INVALID_ARGUMENTS",
            }
        ]

    def test_parser_preserves_unknown_tool_for_node_audit(self):
        tool_call = SimpleNamespace(
            id="call_1",
            function=SimpleNamespace(
                name="execute_sql",
                arguments='{"query": "select 1"}',
            ),
        )

        proposals = generator._parse_tool_calls(
            [tool_call],
            {"get_resource_stock": self.schema},
        )

        assert proposals == [
            {
                "id": "call_1",
                "name": "execute_sql",
                "arguments": {},
                "error_code": "UNKNOWN_TOOL",
            }
        ]

    def test_parser_preserves_malformed_json_for_node_audit(self):
        tool_call = SimpleNamespace(
            id="call_1",
            function=SimpleNamespace(
                name="get_resource_stock",
                arguments="{not-json",
            ),
        )

        proposals = generator._parse_tool_calls(
            [tool_call],
            {"get_resource_stock": self.schema},
        )

        assert proposals == [
            {
                "id": "call_1",
                "name": "get_resource_stock",
                "arguments": {},
                "error_code": "MALFORMED_ARGUMENTS",
            }
        ]

    def test_parser_preserves_non_object_arguments_for_node_audit(self):
        tool_call = SimpleNamespace(
            id="call_1",
            function=SimpleNamespace(
                name="get_resource_stock",
                arguments='["latitude", 22.5]',
            ),
        )

        proposals = generator._parse_tool_calls(
            [tool_call],
            {"get_resource_stock": self.schema},
        )

        assert proposals == [
            {
                "id": "call_1",
                "name": "get_resource_stock",
                "arguments": {},
                "error_code": "MALFORMED_ARGUMENTS",
            }
        ]

    def test_propose_retries_a_length_cut_proposal_with_a_larger_budget(self):
        tool_call = SimpleNamespace(
            id="call_1",
            function=SimpleNamespace(
                name="get_resource_stock",
                arguments='{"latitude": 22.5}',
            ),
        )
        client = MagicMock()
        client.chat.completions.create.side_effect = [
            _response(_choice("partial", finish_reason="length")),
            _response(
                SimpleNamespace(
                    message=SimpleNamespace(content="", tool_calls=[tool_call]),
                    finish_reason="stop",
                )
            ),
        ]

        content, proposals = generator.propose(
            client=client,
            model="test-model",
            question="What is the total resource stock?",
            chunks=[],
            tools=[
                {
                    "name": "get_resource_stock",
                    "description": "Stock.",
                    "parameters": self.schema,
                }
            ],
        )

        assert content == ""
        assert proposals == [
            {
                "id": "call_1",
                "name": "get_resource_stock",
                "arguments": {"latitude": 22.5},
            }
        ]
        calls = client.chat.completions.create.call_args_list
        assert calls[0].kwargs["max_tokens"] == 768
        assert calls[1].kwargs["max_tokens"] == 1536

    def test_propose_retries_empty_choices_then_fails_controlled(self):
        client = MagicMock()
        client.chat.completions.create.side_effect = [_response(), _response()]

        with pytest.raises(generator.GenerationUnusableError):
            generator.propose(
                client=client,
                model="test-model",
                question="What is the total resource stock?",
                chunks=[],
                tools=[
                    {
                        "name": "get_resource_stock",
                        "description": "Stock.",
                        "parameters": self.schema,
                    }
                ],
            )

        assert client.chat.completions.create.call_count == 2

    def test_synthesize_retries_truncation_then_raises(self):
        client = MagicMock()
        client.chat.completions.create.return_value = _response(
            _choice("partial", finish_reason="length")
        )

        with pytest.raises(generator.GenerationTruncatedError):
            generator.synthesize(
                client=client,
                model="test-model",
                question="List incidents.",
                chunks=[],
                tool_results=[{"tool": "get_active_incidents", "outcome": "SUCCESS"}],
            )

        calls = client.chat.completions.create.call_args_list
        assert calls[0].kwargs["max_tokens"] == 2048
        assert calls[1].kwargs["max_tokens"] == 4096

    def test_synthesize_retries_empty_choices_then_fails_controlled(self):
        client = MagicMock()
        client.chat.completions.create.side_effect = [_response(), _response()]

        with pytest.raises(generator.GenerationUnusableError):
            generator.synthesize(
                client=client,
                model="test-model",
                question="List incidents.",
                chunks=[],
                tool_results=[{"tool": "get_active_incidents", "outcome": "SUCCESS"}],
            )

        assert client.chat.completions.create.call_count == 2

    def test_tool_use_failure_is_identified_from_provider_body(self):
        exc = _ProviderError({"error": {"code": "tool_use_failed"}})

        assert generator._is_tool_use_failure(exc) is True

    def test_propose_maps_tool_use_failure_to_rejected_error(self):
        error = _ProviderError(
            {"error": {"code": "tool_use_failed", "message": "invalid"}}
        )
        client = MagicMock()
        client.chat.completions.create.side_effect = error

        with pytest.raises(generator.ToolCallRejectedError):
            generator.propose(
                client=client,
                model="test-model",
                question="What is the total resource stock?",
                chunks=[],
                tools=[
                    {
                        "name": "get_resource_stock",
                        "description": "Stock.",
                        "parameters": self.schema,
                    }
                ],
            )
