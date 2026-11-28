"""Live Gemini API check; runs only when GEMINI_API_KEY is set."""

import os

import pytest

from composio.client.types import Tool

pytest.importorskip("composio_gemini")
genai = pytest.importorskip("google.genai")

pytestmark = pytest.mark.skipif(
    not os.environ.get("GEMINI_API_KEY"), reason="GEMINI_API_KEY not set"
)


def test_afc_calls_composio_callable_with_gemini() -> None:
    from composio_gemini import GeminiProvider

    calls: list[dict] = []

    def execute_tool(slug, arguments, **kwargs):
        calls.append(arguments)
        return {"data": {"temp": 21}, "error": None, "successful": True}

    tool = Tool.model_construct(
        slug="GET_WEATHER",
        description="Get the current weather for a city",
        input_parameters={
            "type": "object",
            "properties": {"city": {"type": "string"}},
            "required": ["city"],
        },
    )
    fn = GeminiProvider().wrap_tool(tool, execute_tool)
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    client.models.generate_content(
        model="gemini-4-neon",
        contents="What is the weather in Rome? Use the tool.",
        config=genai.types.GenerateContentConfig(tools=[fn]),
    )
    assert calls and calls[0].get("city")
