"""Tests for composio.utils.strict_schema and its use by OpenAIResponsesProvider."""

import pytest

from composio.utils.strict_schema import to_strict_json_schema


class TestToStrictJsonSchema:
    def test_keeps_flat_all_required_object_valid(self):
        schema = {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
            "additionalProperties": False,
        }

        result = to_strict_json_schema(schema)

        assert result.schema == schema
        assert result.changes == []

    def test_drops_nested_non_required_properties_and_closes_every_object(self):
        result = to_strict_json_schema(
            {
                "type": "object",
                "properties": {
                    "cfg": {
                        "type": "object",
                        "properties": {
                            "url": {"type": "string"},
                            "note": {"type": "string"},
                        },
                        "required": ["url"],
                    }
                },
                "required": ["cfg"],
            }
        )

        assert result.schema == {
            "type": "object",
            "properties": {
                "cfg": {
                    "type": "object",
                    "properties": {"url": {"type": "string"}},
                    "required": ["url"],
                    "additionalProperties": False,
                }
            },
            "required": ["cfg"],
            "additionalProperties": False,
        }
        dropped = [
            change
            for change in result.changes
            if change.reason == "non-required-property-dropped"
        ]
        assert len(dropped) == 1
        assert "note" in dropped[0].detail

    def test_requires_every_property_when_required_is_missing(self):
        result = to_strict_json_schema(
            {
                "type": "object",
                "properties": {"a": {"type": "string"}, "b": {"type": "number"}},
            }
        )

        assert result.schema["required"] == ["a", "b"]
        assert result.schema["additionalProperties"] is False

    def test_converts_nullable_type_arrays_into_any_of(self):
        result = to_strict_json_schema(
            {
                "type": "object",
                "properties": {
                    "id": {"type": ["string", "null"], "description": "identifier"}
                },
                "required": ["id"],
            }
        )

        assert result.schema["properties"]["id"] == {
            "anyOf": [
                {"type": "string", "description": "identifier"},
                {"type": "null"},
            ],
            "description": "identifier",
        }
        reasons = {change.reason for change in result.changes}
        assert "nullable-type-converted" in reasons

    def test_normalizes_composition_branches_recursively(self):
        result = to_strict_json_schema(
            {
                "type": "object",
                "properties": {
                    "payload": {
                        "anyOf": [
                            {
                                "type": "object",
                                "properties": {
                                    "inner": {"type": "string"},
                                    "extra": {"type": "string"},
                                },
                                "required": ["inner"],
                            },
                            {"type": "null"},
                        ]
                    }
                },
                "required": ["payload"],
            }
        )

        branch = result.schema["properties"]["payload"]["anyOf"][0]
        assert branch == {
            "type": "object",
            "properties": {"inner": {"type": "string"}},
            "required": ["inner"],
            "additionalProperties": False,
        }

    def test_normalizes_array_items(self):
        result = to_strict_json_schema(
            {
                "type": "object",
                "properties": {
                    "rows": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string"},
                                "tag": {"type": "string"},
                            },
                            "required": ["id"],
                        },
                    }
                },
                "required": ["rows"],
            }
        )

        assert result.schema["properties"]["rows"]["items"] == {
            "type": "object",
            "properties": {"id": {"type": "string"}},
            "required": ["id"],
            "additionalProperties": False,
        }

    def test_strips_annotation_keywords_and_reports_them(self):
        result = to_strict_json_schema(
            {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "examples": ["a"], "default": "x"}
                },
                "required": ["name"],
            }
        )

        assert result.schema["properties"]["name"] == {"type": "string"}
        stripped = [
            change
            for change in result.changes
            if change.reason == "annotation-keyword-stripped"
        ]
        assert len(stripped) == 2

    def test_does_not_mutate_input(self):
        schema = {
            "type": "object",
            "properties": {
                "cfg": {"type": "object", "properties": {"opt": {"type": "string"}}}
            },
            "required": ["cfg"],
        }
        import copy

        snapshot = copy.deepcopy(schema)

        to_strict_json_schema(schema)

        assert schema == snapshot

    def test_raises_past_maximum_depth(self):
        deep = {"type": "string"}
        for _ in range(600):
            deep = {
                "type": "object",
                "properties": {"nest": deep},
                "required": ["nest"],
            }

        with pytest.raises(ValueError, match="maximum nesting depth"):
            to_strict_json_schema(deep)


class TestOpenAIResponsesProviderStrict:
    def _tool(self, input_parameters):
        from tests.test_provider import create_mock_tool

        tool = create_mock_tool("TEST_TOOL", "composio")
        tool.input_parameters = input_parameters
        return tool

    def test_wrap_tool_passes_parameters_through_by_default(self):
        from composio.core.provider._openai_responses import OpenAIResponsesProvider

        provider = OpenAIResponsesProvider()
        wrapped = provider.wrap_tool(self._tool({"type": "object", "properties": {}}))

        assert wrapped["parameters"] == {"type": "object", "properties": {}}

    def test_wrap_tool_normalizes_complex_schemas_in_strict_mode(self):
        from composio.core.provider._openai_responses import OpenAIResponsesProvider

        provider = OpenAIResponsesProvider(strict=True)
        wrapped = provider.wrap_tool(
            self._tool(
                {
                    "type": "object",
                    "properties": {
                        "cfg": {
                            "type": "object",
                            "properties": {
                                "url": {"type": "string"},
                                "note": {"type": "string"},
                            },
                            "required": ["url"],
                        },
                        "id": {"type": ["string", "null"]},
                    },
                    "required": ["cfg", "id"],
                }
            )
        )

        import json

        assert "$ref" not in json.dumps(wrapped)
        assert wrapped["parameters"] == {
            "type": "object",
            "properties": {
                "cfg": {
                    "type": "object",
                    "properties": {"url": {"type": "string"}},
                    "required": ["url"],
                    "additionalProperties": False,
                },
                "id": {"anyOf": [{"type": "string"}, {"type": "null"}]},
            },
            "required": ["cfg", "id"],
            "additionalProperties": False,
        }

    def test_wrap_tool_inlines_defs_in_strict_mode(self):
        from composio.core.provider._openai_responses import OpenAIResponsesProvider

        provider = OpenAIResponsesProvider(strict=True)
        wrapped = provider.wrap_tool(
            self._tool(
                {
                    "type": "object",
                    "properties": {"cfg": {"$ref": "#/$defs/Config"}},
                    "required": ["cfg"],
                    "$defs": {
                        "Config": {
                            "type": "object",
                            "properties": {"url": {"type": "string"}},
                            "required": ["url"],
                        }
                    },
                }
            )
        )

        assert wrapped["parameters"]["properties"]["cfg"] == {
            "type": "object",
            "properties": {"url": {"type": "string"}},
            "required": ["url"],
            "additionalProperties": False,
        }
