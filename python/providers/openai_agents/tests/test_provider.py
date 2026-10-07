"""Tests for the OpenAI Agents provider."""

import asyncio
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


def test_strict_mode_registers_a_strict_schema_with_optional_params_nullable():
    """Optional properties become required-nullable under strict mode.

    Mirrors the TypeScript OpenAIAgentsProvider's own strict-mode test.
    """
    tool = MagicMock(
        slug="CONFIGURE",
        description="Configure something",
        input_parameters={
            "type": "object",
            "properties": {
                "input": {"type": "string"},
                "cfg": {
                    "type": "object",
                    "properties": {
                        "url": {"type": "string"},
                        "note": {"type": "string"},
                    },
                    "required": ["url"],
                },
            },
            "required": ["input"],
        },
    )

    wrapped_tool = OpenAIAgentsProvider(strict=True).wrap_tool(
        tool, lambda **kwargs: {}
    )

    assert wrapped_tool.strict_json_schema is True
    assert wrapped_tool.params_json_schema == {
        "type": "object",
        "properties": {
            "input": {"type": "string"},
            "cfg": {
                "type": ["object", "null"],
                "properties": {
                    "url": {"type": "string"},
                    "note": {"type": ["string", "null"]},
                },
                "required": ["url", "note"],
                "additionalProperties": False,
            },
        },
        "required": ["input", "cfg"],
        "additionalProperties": False,
    }


def test_strict_mode_optional_enum_param_can_still_be_omitted():
    """An optional enum is widened to accept null, so the model can leave it out."""
    tool = MagicMock(
        slug="SORT",
        description="Sort something",
        input_parameters={
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "order": {"type": "string", "enum": ["asc", "desc"]},
            },
            "required": ["query"],
        },
    )

    wrapped_tool = OpenAIAgentsProvider(strict=True).wrap_tool(
        tool, lambda **kwargs: {}
    )

    assert wrapped_tool.strict_json_schema is True
    assert wrapped_tool.params_json_schema["properties"]["order"] == {
        "type": ["string", "null"],
        "enum": ["asc", "desc", None],
    }


def test_strict_mode_falls_back_when_schema_cannot_be_expressed_strict():
    """A schema strict mode can't express (arbitrary-key object) is
    registered without strict mode instead, using the existing non-strict
    schema-building path.
    """
    tool = MagicMock(
        slug="SET_HEADERS",
        description="Set request headers",
        input_parameters={
            "type": "object",
            "properties": {
                "headers": {
                    "type": "object",
                    "additionalProperties": {"type": "string"},
                }
            },
            "required": ["headers"],
        },
    )

    wrapped_tool = OpenAIAgentsProvider(strict=True).wrap_tool(
        tool, lambda **kwargs: {}
    )

    assert wrapped_tool.strict_json_schema is False
    assert wrapped_tool.params_json_schema == {
        "type": "object",
        "properties": {
            "headers": {"type": "object", "additionalProperties": {"type": "string"}}
        },
        "required": ["headers"],
        "additionalProperties": False,
    }


def test_strict_mode_omits_null_arguments_the_tool_schema_rejects():
    """Under strict mode, a null the tool's own schema doesn't accept is
    treated as omitted before the tool actually executes.
    """
    tool = MagicMock(
        slug="CONFIGURE",
        description="Configure something",
        input_parameters={
            "type": "object",
            "properties": {
                "input": {"type": "string"},
                "label": {"type": "string"},
                "clearable": {"type": ["string", "null"]},
            },
            "required": ["input"],
        },
    )
    execute_tool = MagicMock(return_value={})

    wrapped_tool = OpenAIAgentsProvider(strict=True).wrap_tool(tool, execute_tool)

    asyncio.run(
        wrapped_tool.on_invoke_tool(
            MagicMock(), '{"input": "x", "label": null, "clearable": null}'
        )
    )

    execute_tool.assert_called_once_with(
        slug="CONFIGURE", arguments={"input": "x", "clearable": None}
    )


def test_strict_defaults_to_false():
    """The default constructor keeps today's non-strict behavior."""
    tool = MagicMock(
        slug="GITHUB_GET_REPO",
        description="Get a repository",
        input_parameters={"type": "object", "properties": {}, "required": []},
    )

    wrapped_tool = OpenAIAgentsProvider().wrap_tool(tool, lambda **kwargs: {})

    assert wrapped_tool.strict_json_schema is False
