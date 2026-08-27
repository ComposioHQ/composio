"""Tests for composio.utils.strict_schema and its use by OpenAIResponsesProvider."""

import copy
import json

import pytest

from composio.utils.strict_schema import omit_null_tool_arguments, to_strict_json_schema


def assert_strict_shape(node, path=""):
    """Structural invariants OpenAI enforces on every node of a strict schema."""
    if isinstance(node, list):
        for index, item in enumerate(node):
            assert_strict_shape(item, f"{path}[{index}]")
        return
    if not isinstance(node, dict):
        return
    if "anyOf" in node:
        assert "type" not in node, f"{path}: type beside anyOf"
    for keyword in ("default", "examples", "oneOf", "patternProperties"):
        assert keyword not in node, f"{path}: {keyword}"
    node_type = node.get("type")
    is_object = node_type == "object" or (
        isinstance(node_type, list) and "object" in node_type
    )
    if is_object or "properties" in node:
        properties = node.get("properties") or {}
        assert node.get("required") == list(properties.keys()), f"{path}: required"
        assert node.get("additionalProperties") is False, (
            f"{path}: additionalProperties"
        )
    for key, child in node.items():
        if key in ("enum", "const"):
            continue
        assert_strict_shape(child, f"{path}.{key}" if path else key)


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

    def test_keeps_optional_properties_required_and_nullable(self):
        result = to_strict_json_schema(
            {
                "type": "object",
                "properties": {
                    "cfg": {
                        "type": "object",
                        "properties": {
                            "url": {"type": "string"},
                            "note": {"type": "string", "description": "optional note"},
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
                    "properties": {
                        "url": {"type": "string"},
                        "note": {
                            "type": ["string", "null"],
                            "description": "optional note",
                        },
                    },
                    "required": ["url", "note"],
                    "additionalProperties": False,
                }
            },
            "required": ["cfg"],
            "additionalProperties": False,
        }
        assert [(c.path, c.reason) for c in result.changes] == [
            ("properties.cfg.properties.note", "optional-property-nullable")
        ]

    def test_requires_and_widens_every_property_when_required_is_missing(self):
        result = to_strict_json_schema(
            {
                "type": "object",
                "properties": {"a": {"type": "string"}, "b": {"type": "number"}},
            }
        )

        assert result.schema == {
            "type": "object",
            "properties": {
                "a": {"type": ["string", "null"]},
                "b": {"type": ["number", "null"]},
            },
            "required": ["a", "b"],
            "additionalProperties": False,
        }

    def test_keeps_nullable_type_arrays_and_closes_nullable_objects(self):
        result = to_strict_json_schema(
            {
                "type": "object",
                "properties": {
                    "id": {"type": ["string", "null"], "description": "identifier"},
                    "cfg": {
                        "type": ["object", "null"],
                        "properties": {"a": {"type": "string"}},
                        "required": ["a"],
                    },
                    "xs": {"type": ["array", "null"], "items": {"type": "string"}},
                },
                "required": ["id", "cfg", "xs"],
            }
        )

        assert result.schema["properties"]["cfg"] == {
            "type": ["object", "null"],
            "properties": {"a": {"type": "string"}},
            "required": ["a"],
            "additionalProperties": False,
        }
        assert result.schema["properties"]["id"] == {
            "type": ["string", "null"],
            "description": "identifier",
        }
        assert result.changes == []
        assert_strict_shape(result.schema)

    def test_widens_composition_and_enum_properties_without_type_beside_any_of(self):
        result = to_strict_json_schema(
            {
                "type": "object",
                "properties": {
                    "value": {"anyOf": [{"type": "string"}, {"type": "number"}]},
                    "already": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    "choice": {"enum": ["a", "b"], "description": "pick one"},
                    "multi": {"type": ["string", "number"]},
                },
            }
        )

        properties = result.schema["properties"]
        assert properties["value"] == {
            "anyOf": [{"type": "string"}, {"type": "number"}, {"type": "null"}]
        }
        assert properties["already"] == {
            "anyOf": [{"type": "string"}, {"type": "null"}]
        }
        assert properties["choice"] == {
            "description": "pick one",
            "anyOf": [{"enum": ["a", "b"]}, {"type": "null"}],
        }
        assert properties["multi"] == {"type": ["string", "number", "null"]}
        assert_strict_shape(result.schema)

    def test_normalizes_composition_branches_and_array_items_recursively(self):
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
                    },
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
                    },
                    "either": {"oneOf": [{"type": "string"}, {"type": "number"}]},
                },
                "required": ["payload", "rows", "either"],
            }
        )

        assert result.schema["properties"]["payload"]["anyOf"][0] == {
            "type": "object",
            "properties": {
                "inner": {"type": "string"},
                "extra": {"type": ["string", "null"]},
            },
            "required": ["inner", "extra"],
            "additionalProperties": False,
        }
        assert result.schema["properties"]["rows"]["items"]["required"] == ["id", "tag"]
        assert result.schema["properties"]["either"] == {
            "anyOf": [{"type": "string"}, {"type": "number"}]
        }
        assert "one-of-converted" in {c.reason for c in result.changes}
        assert_strict_shape(result.schema)

    def test_reports_dynamic_key_and_free_form_objects_as_unsupported(self):
        result = to_strict_json_schema(
            {
                "type": "object",
                "properties": {
                    "headers": {
                        "type": "object",
                        "additionalProperties": {"type": "string"},
                    },
                    "meta": {"type": "object", "description": "any json"},
                    "tagged": {
                        "type": "object",
                        "patternProperties": {"^x-": {"type": "string"}},
                    },
                    "open": {"type": "object", "additionalProperties": True},
                },
                "required": ["headers", "meta", "tagged", "open"],
            }
        )

        assert [(e.path, e.keyword) for e in result.unsupported] == [
            ("properties.headers", "additionalProperties"),
            ("properties.meta", "properties"),
            ("properties.tagged", "patternProperties"),
            ("properties.open", "additionalProperties"),
        ]
        # The schema-valued additionalProperties is preserved, not overwritten.
        assert result.schema["properties"]["headers"]["additionalProperties"] == {
            "type": "string"
        }
        assert "patternProperties" in result.schema["properties"]["tagged"]

    def test_strips_annotation_keywords_and_reports_keywords_it_cannot_rewrite(self):
        result = to_strict_json_schema(
            {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "examples": ["a"], "default": "x"},
                    "pair": {"type": "array", "prefixItems": [{"type": "number"}]},
                    "all": {"allOf": [{"type": "string"}]},
                },
                "required": ["name", "pair", "all"],
            }
        )

        assert result.schema["properties"]["name"] == {"type": "string"}
        reasons = [c.reason for c in result.changes]
        assert reasons.count("unsupported-keyword-stripped") == 2
        assert [(e.path, e.keyword) for e in result.unsupported] == [
            ("properties.pair", "prefixItems"),
            ("properties.all", "allOf"),
        ]

    def test_keeps_defs_and_refs_and_reports_dangling_refs(self):
        result = to_strict_json_schema(
            {
                "type": "object",
                "properties": {
                    "cfg": {"$ref": "#/$defs/Config"},
                    "optionalCfg": {
                        "$ref": "#/$defs/Config",
                        "description": "optional",
                    },
                    "missing": {"$ref": "#/$defs/Nope"},
                    "external": {"$ref": "https://example.com/schema.json"},
                },
                "required": ["cfg", "cfg", "missing", "external"],
                "$defs": {
                    "Config": {
                        "type": "object",
                        "properties": {
                            "url": {"type": "string"},
                            "note": {"type": "string"},
                        },
                        "required": ["url"],
                    }
                },
            }
        )

        assert result.schema["properties"]["cfg"] == {"$ref": "#/$defs/Config"}
        assert result.schema["properties"]["optionalCfg"] == {
            "description": "optional",
            "anyOf": [{"$ref": "#/$defs/Config"}, {"type": "null"}],
        }
        assert result.schema["$defs"] == {
            "Config": {
                "type": "object",
                "properties": {
                    "url": {"type": "string"},
                    "note": {"type": ["string", "null"]},
                },
                "required": ["url", "note"],
                "additionalProperties": False,
            }
        }
        assert result.schema["required"] == [
            "cfg",
            "optionalCfg",
            "missing",
            "external",
        ]
        assert [(e.path, e.keyword) for e in result.unsupported] == [
            ("properties.missing", "$ref"),
            ("properties.external", "$ref"),
        ]
        assert ("$defs.Config.properties.note", "optional-property-nullable") in [
            (c.path, c.reason) for c in result.changes
        ]

    def test_caps_the_change_log_without_losing_properties(self):
        properties = {f"p{i}": {"type": "string"} for i in range(60)}

        result = to_strict_json_schema(
            {"type": "object", "properties": properties, "required": ["p0"]}
        )

        assert len(result.schema["properties"]) == 60
        assert len(result.changes) == 50
        assert result.total_changes == 59

    def test_does_not_mutate_input(self):
        schema = {
            "type": "object",
            "properties": {
                "cfg": {
                    "type": "object",
                    "properties": {"opt": {"type": "string", "default": 1}},
                }
            },
            "required": ["cfg"],
        }
        snapshot = copy.deepcopy(schema)

        to_strict_json_schema(schema)

        assert schema == snapshot

    def test_is_idempotent(self):
        once = to_strict_json_schema(
            {
                "type": "object",
                "properties": {
                    "cfg": {"$ref": "#/$defs/Config"},
                    "id": {"type": ["string", "null"]},
                },
                "$defs": {
                    "Config": {
                        "type": "object",
                        "properties": {
                            "url": {"type": "string"},
                            "note": {"type": "string"},
                        },
                        "required": ["url"],
                    }
                },
            }
        ).schema

        twice = to_strict_json_schema(once)

        assert twice.schema == once
        assert twice.changes == []
        assert twice.unsupported == []

    def test_reports_non_object_roots_as_unsupported_and_keeps_recursive_defs(self):
        assert [
            (e.path, e.keyword)
            for e in to_strict_json_schema({"type": "string"}).unsupported
        ] == [("", "type")]
        nullable_root = to_strict_json_schema(
            {"type": ["object", "null"], "properties": {"a": {"type": "string"}}}
        )
        assert ("", "type") in [(e.path, e.keyword) for e in nullable_root.unsupported]

        cyclic = to_strict_json_schema(
            {
                "type": "object",
                "properties": {"node": {"$ref": "#/$defs/Node"}},
                "required": ["node"],
                "$defs": {
                    "Node": {
                        "type": "object",
                        "properties": {
                            "child": {"$ref": "#/$defs/Node"},
                            "label": {"type": "string"},
                        },
                        "required": ["label"],
                    }
                },
            }
        )
        # Recursion through $defs is representable in strict mode.
        assert cyclic.unsupported == []
        assert cyclic.schema["$defs"]["Node"] == {
            "type": "object",
            "properties": {
                "child": {"anyOf": [{"$ref": "#/$defs/Node"}, {"type": "null"}]},
                "label": {"type": "string"},
            },
            "required": ["child", "label"],
            "additionalProperties": False,
        }

    def test_raises_past_maximum_depth(self):
        deep = {"type": "string"}
        for _ in range(600):
            deep = {
                "type": "object",
                "properties": {"nest": deep},
                "required": ["nest"],
            }

        with pytest.raises(Exception, match="depth"):
            to_strict_json_schema(deep)


_OMIT_SCHEMA = {
    "type": "object",
    "properties": {
        "cfg": {
            "type": "object",
            "properties": {"url": {"type": "string"}, "note": {"type": "string"}},
            "required": ["url"],
        },
        "label": {"type": "string"},
        "clearable": {"type": ["string", "null"]},
        "choice": {"anyOf": [{"enum": ["a"]}, {"type": "null"}]},
        "rows": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"id": {"type": "string"}, "tag": {"type": "string"}},
            },
        },
        "refd": {"$ref": "#/$defs/Str"},
        "refdNullable": {"$ref": "#/$defs/NullableStr"},
    },
    "$defs": {"Str": {"type": "string"}, "NullableStr": {"type": ["string", "null"]}},
}


class TestOmitNullToolArguments:
    def test_drops_nulls_the_schema_rejects_and_keeps_the_ones_it_accepts(self):
        arguments = {
            "cfg": {"url": "https://example.com", "note": None},
            "label": None,
            "clearable": None,
            "choice": None,
            "unknown": None,
            "rows": [{"id": "1", "tag": None}, None],
            "refd": None,
            "refdNullable": None,
        }
        snapshot = copy.deepcopy(arguments)

        assert omit_null_tool_arguments(arguments, _OMIT_SCHEMA) == {
            "cfg": {"url": "https://example.com"},
            "clearable": None,
            "choice": None,
            "unknown": None,
            "rows": [{"id": "1"}, None],
            "refdNullable": None,
        }
        assert arguments == snapshot


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
        assert wrapped["strict"] is False

    def test_constructor_keeps_base_provider_config(self):
        from composio.core.provider._openai_responses import OpenAIResponsesProvider

        provider = OpenAIResponsesProvider(
            strict=True, schema_config={"skip_defaults": True}
        )

        assert provider.strict is True
        assert provider.skip_default is True

    def test_wrap_tool_emits_strict_and_normalizes_complex_schemas(self):
        from composio.core.provider._openai_responses import OpenAIResponsesProvider

        provider = OpenAIResponsesProvider(strict=True)
        wrapped = provider.wrap_tool(
            self._tool(
                {
                    "type": "object",
                    "properties": {
                        "cfg": {"$ref": "#/$defs/Config"},
                        "id": {"type": ["string", "null"]},
                        "label": {"type": "string"},
                    },
                    "required": ["cfg", "id"],
                    "$defs": {
                        "Config": {
                            "type": "object",
                            "properties": {
                                "url": {"type": "string"},
                                "note": {"type": "string"},
                            },
                            "required": ["url"],
                        }
                    },
                }
            )
        )

        assert wrapped["strict"] is True
        assert wrapped["parameters"] == {
            "type": "object",
            "properties": {
                "cfg": {"$ref": "#/$defs/Config"},
                "id": {"type": ["string", "null"]},
                "label": {"type": ["string", "null"]},
            },
            "required": ["cfg", "id", "label"],
            "additionalProperties": False,
            "$defs": {
                "Config": {
                    "type": "object",
                    "properties": {
                        "url": {"type": "string"},
                        "note": {"type": ["string", "null"]},
                    },
                    "required": ["url", "note"],
                    "additionalProperties": False,
                }
            },
        }

    def test_wrap_tool_sends_unsupported_schemas_without_strict(self):
        from composio.core.provider._openai_responses import OpenAIResponsesProvider

        provider = OpenAIResponsesProvider(strict=True)
        input_parameters = {
            "type": "object",
            "properties": {
                "headers": {
                    "type": "object",
                    "additionalProperties": {"type": "string"},
                },
                "name": {"type": "string"},
            },
            "required": ["headers"],
        }
        wrapped = provider.wrap_tool(self._tool(input_parameters))

        assert wrapped["strict"] is False
        assert wrapped["parameters"] == input_parameters

    def test_wrap_tool_emits_empty_closed_object_without_parameters(self):
        from composio.core.provider._openai_responses import OpenAIResponsesProvider

        provider = OpenAIResponsesProvider(strict=True)
        wrapped = provider.wrap_tool(self._tool(None))

        assert wrapped["strict"] is True
        assert wrapped["parameters"] == {
            "type": "object",
            "properties": {},
            "required": [],
            "additionalProperties": False,
        }

    def test_wrap_tool_keeps_explicit_empty_schema_without_strict(self):
        from composio.core.provider._openai_responses import OpenAIResponsesProvider

        provider = OpenAIResponsesProvider(strict=True)
        wrapped = provider.wrap_tool(self._tool({}))

        assert wrapped["strict"] is False
        assert wrapped["parameters"] == {}

    def test_execute_tool_call_omits_null_arguments_in_strict_mode(self):
        from openai.types.responses.response_output_item import ResponseFunctionToolCall

        from composio.core.provider._openai_responses import OpenAIResponsesProvider

        received = {}

        def execute_tool(slug, arguments, modifiers=None, **kwargs):
            received["slug"] = slug
            received["arguments"] = arguments
            return {"data": {}, "error": None, "successful": True}

        provider = OpenAIResponsesProvider(strict=True)
        provider.set_execute_tool_fn(execute_tool)
        provider.wrap_tool(
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
                        "label": {"type": "string"},
                        "clearable": {"type": ["string", "null"]},
                    },
                    "required": ["cfg"],
                }
            )
        )
        provider.execute_tool_call(
            user_id="user",
            tool_call=ResponseFunctionToolCall(
                type="function_call",
                call_id="call_1",
                name="TEST_TOOL",
                arguments=json.dumps(
                    {
                        "cfg": {"url": "u", "note": None},
                        "label": None,
                        "clearable": None,
                    }
                ),
            ),
        )

        assert received["slug"] == "TEST_TOOL"
        assert received["arguments"] == {"cfg": {"url": "u"}, "clearable": None}
