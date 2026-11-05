"""Opt-in live Groq tests for RAG tool calling.

Run with a real key and an available model:

    RUN_GROQ_INTEGRATION=1 GROQ_API_KEY=... \
        GROQ_INTEGRATION_MODEL=openai/gpt-oss-120b \
        python -m pytest tests/test_groq_tool_integration.py -q

These tests call the real provider and are skipped by default.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest
from groq import Groq

from app.services import generator

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_GROQ_INTEGRATION") != "1",
    reason="set RUN_GROQ_INTEGRATION=1 to call the real Groq API",
)


@pytest.fixture(scope="module")
def production_tools():
    """Load the exact provider-facing definitions shipped by the Node backend."""
    npx = shutil.which("npx")
    assert npx is not None, "npx is required to load the production tool definitions"
    script = (
        "import { RAG_TOOL_DEFINITIONS } from "
        "'./backend/src/services/ragToolDefinitions.ts'; "
        "console.log(JSON.stringify(RAG_TOOL_DEFINITIONS));"
    )
    output = subprocess.check_output(
        [npx, "tsx", "-e", script],
        cwd=Path(__file__).resolve().parents[2],
        text=True,
    )
    return json.loads(output)

_CASES = [
    ("How many active incidents are there right now?", "get_active_incidents"),
    ("Total incidents", "get_active_incidents"),
    ("Total active incidents", "get_active_incidents"),
    ("Total resources available", "get_resource_stock"),
    (
        "Which ambulances are within 10 km of latitude 22.5, longitude 88.3?",
        "get_nearby_ambulances",
    ),
    ("Which rescue teams are currently available?", "get_available_rescue_teams"),
    ("What shelter capacity is available?", "get_shelter_capacity"),
    ("What is the total resource stock available?", "get_resource_stock"),
    ("Which teams are currently assigned?", "get_current_assignments"),
]


def _client() -> Groq:
    return Groq(api_key=os.environ["GROQ_API_KEY"])


def _model() -> str:
    return os.getenv(
        "GROQ_INTEGRATION_MODEL",
        os.getenv("GROQ_MODEL", "openai/gpt-oss-20b"),
    )


@pytest.mark.parametrize(("question", "expected"), _CASES)
def test_natural_language_selects_the_expected_tool(
    question, expected, production_tools
):
    _, proposals = generator.propose(
        client=_client(),
        model=_model(),
        question=question,
        chunks=[],
        tools=production_tools,
    )

    assert proposals, f"no tool proposal for: {question}"
    assert proposals[0]["name"] == expected
    assert all(
        value is not None
        for proposal in proposals
        for value in proposal["arguments"].values()
    )


def test_provider_accepts_null_optional_arguments_and_normalization_removes_them(
    production_tools,
):
    tool = next(
        tool for tool in production_tools if tool["name"] == "get_resource_stock"
    )
    response = _client().chat.completions.create(
        model=_model(),
        messages=[
            {
                "role": "system",
                "content": (
                    "Call get_resource_stock with every optional filter set to "
                    "null and limit 10."
                ),
            },
            {"role": "user", "content": "What is the total resources available?"},
        ],
        temperature=0.1,
        max_tokens=768,
        tools=generator._openai_tools([tool]),
        tool_choice="auto",
    )

    raw_calls = response.choices[0].message.tool_calls or []
    assert raw_calls
    proposals = generator._parse_tool_calls(
        raw_calls,
        {tool["name"]: tool["parameters"]},
    )

    assert proposals
    assert all(
        value is not None
        for proposal in proposals
        for value in proposal["arguments"].values()
    )


def test_malformed_required_arguments_are_identified_as_tool_use_failures(
    production_tools,
):
    tool = next(
        tool
        for tool in production_tools
        if tool["name"] == "get_nearby_ambulances"
    )

    with pytest.raises(Exception) as raised:
        _client().chat.completions.create(
            model=_model(),
            messages=[
                {
                    "role": "system",
                    "content": "Call the tool with an empty arguments object.",
                },
                {"role": "user", "content": "Find nearby ambulances."},
            ],
            temperature=0.1,
            max_tokens=768,
            tools=[
                {
                    "type": "function",
                    "function": {
                        "name": tool["name"],
                        "description": tool["description"],
                        "parameters": tool["parameters"],
                    },
                }
            ],
            tool_choice={
                "type": "function",
                "function": {"name": tool["name"]},
            },
        )

    assert generator._is_tool_use_failure(raised.value)
