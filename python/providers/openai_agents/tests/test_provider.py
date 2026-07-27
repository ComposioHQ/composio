"""Tests for the OpenAI Agents provider."""

import copy
from unittest.mock import MagicMock

import pytest

from composio_openai_agents.provider import OpenAIAgentsProvider


def test_wrap_tool_does_not_mutate_input_parameters():
    """wrap_tool must not strip default/examples/pattern from the caller's schema.

    ``wrap_tool`` removes ``examples``/``pattern``/``default`` from the schema it
    hands to the OpenAI Agents SDK. It must do so on a *copy*: a shallow
    ``dict.copy()`` left the nested ``properties`` dicts shared with the original,
    so those in-place deletions leaked back into the caller's
    ``Tool.input_parameters``.
    """
    tool = MagicMock(
        slug="GITHUB_GET_REPO",
        name="Github Get Repo",
        description="Get a repository",
        input_parameters={
            "type": "object",
            "properties": {
                "owner": {"type": "string", "default": "me", "examples": ["octocat"]},
                "repo": {"type": "string", "pattern": "^[a-z]+$"},
            },
            "required": ["owner"],
        },
    )
    snapshot = copy.deepcopy(tool.input_parameters)

    wrapped_tool = OpenAIAgentsProvider().wrap_tool(tool, lambda **kwargs: {})

    # The caller's schema must be untouched.
    assert tool.input_parameters == snapshot
    owner = tool.input_parameters["properties"]["owner"]
    assert owner["default"] == "me"
    assert owner["examples"] == ["octocat"]
    assert tool.input_parameters["properties"]["repo"]["pattern"] == "^[a-z]+$"

    # The provider-local schema should still be normalized for OpenAI Agents.
    assert wrapped_tool.params_json_schema == {
        "type": "object",
        "properties": {
            "owner": {"type": "string"},
            "repo": {"type": "string"},
        },
        "required": ["owner"],
        "additionalProperties": False,
    }


@pytest.mark.parametrize(
    "items_schema",
    [
        {
            "anyOf": [
                {
                    "type": "object",
                    "properties": {"id": {"type": "string"}},
                    "required": ["id"],
                },
                {"type": "null"},
            ]
        },
        {
            "oneOf": [
                {"type": "integer"},
                {"type": "object", "additionalProperties": True},
            ]
        },
        {"$ref": "#/$defs/Entry"},
        {
            "properties": {"name": {"type": "string"}},
            "required": ["name"],
        },
        {},
    ],
    ids=["nullable-any-of", "one-of", "ref", "object-keywords", "empty-schema"],
)
def test_wrap_tool_preserves_array_item_schemas(items_schema):
    """Valid item schemas must not be intersected with an invented string type."""
    tool = MagicMock(
        slug="PROCESS_RECORDS",
        description="Process records",
        input_parameters={
            "type": "object",
            "$defs": {
                "Entry": {
                    "type": "object",
                    "properties": {"id": {"type": "string"}},
                }
            },
            "properties": {
                "records": {
                    "type": "array",
                    "items": copy.deepcopy(items_schema),
                }
            },
            "required": ["records"],
        },
    )

    wrapped_tool = OpenAIAgentsProvider().wrap_tool(tool, lambda **kwargs: {})

    assert (
        wrapped_tool.params_json_schema["properties"]["records"]["items"]
        == items_schema
    )
