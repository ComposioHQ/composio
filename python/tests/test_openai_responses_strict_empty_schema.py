"""Regression coverage for OpenAI Responses strict-mode empty schemas."""

from composio.core.provider._openai_responses import OpenAIResponsesProvider
from tests.test_provider import create_mock_tool


def test_explicit_empty_schema_is_not_treated_as_missing_parameters():
    tool = create_mock_tool("TEST_TOOL", "composio")
    tool.input_parameters = {}

    wrapped = OpenAIResponsesProvider(strict=True).wrap_tool(tool)

    # An explicit {} is a free-form schema and therefore cannot be narrowed
    # into a closed strict object. This must match the TypeScript provider.
    assert wrapped["strict"] is False
    assert wrapped["parameters"] == {}
