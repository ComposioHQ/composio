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


NULL_BRANCH = {"type": "null"}
DIRECTION = {"enum": ["asc", None]}


def _wrapped(schema):
    return {"anyOf": [schema, NULL_BRANCH]}


class TestNullAcceptance:
    """Null widening and null omission decide with every keyword, not the first."""

    @pytest.mark.parametrize(
        "property_schema, expected",
        [
            (
                {"type": "string", "enum": ["asc", "desc"]},
                _wrapped({"type": "string", "enum": ["asc", "desc"]}),
            ),
            (
                {"type": ["string", "null"], "enum": ["asc", "desc"]},
                _wrapped({"type": ["string", "null"], "enum": ["asc", "desc"]}),
            ),
            (
                {"type": "string", "const": "asc"},
                _wrapped({"type": "string", "const": "asc"}),
            ),
            (
                {"type": "integer", "enum": [1, 2], "description": "page size"},
                {
                    "description": "page size",
                    **_wrapped({"type": "integer", "enum": [1, 2]}),
                },
            ),
            (
                {"type": "string", "anyOf": [{"minLength": 1}]},
                _wrapped({"type": "string", "anyOf": [{"minLength": 1}]}),
            ),
            (
                {"enum": ["asc"], "anyOf": [{"type": "string"}, NULL_BRANCH]},
                _wrapped({"enum": ["asc"], "anyOf": [{"type": "string"}, NULL_BRANCH]}),
            ),
            (
                {"$ref": "#/$defs/Direction", "type": "string"},
                _wrapped({"$ref": "#/$defs/Direction", "type": "string"}),
            ),
            # Already nullable: left alone.
            (
                {"type": ["string", "null"], "enum": ["asc", None]},
                {"type": ["string", "null"], "enum": ["asc", None]},
            ),
            ({"$ref": "#/$defs/Direction"}, {"$ref": "#/$defs/Direction"}),
            (
                {"anyOf": [{"type": ["string", "null"]}]},
                {"anyOf": [{"type": ["string", "null"]}]},
            ),
            # `type` or `anyOf` as the only obstacle: widened in place.
            (
                {"type": "string", "minLength": 1},
                {"type": ["string", "null"], "minLength": 1},
            ),
            (
                {"anyOf": [{"type": "string"}], "description": "d"},
                {"anyOf": [{"type": "string"}, NULL_BRANCH], "description": "d"},
            ),
        ],
    )
    def test_widening_keeps_every_constraint(self, property_schema, expected):
        source = {
            "type": "object",
            "properties": {"value": property_schema},
            "$defs": {"Direction": DIRECTION},
        }
        snapshot = copy.deepcopy(source)
        result = to_strict_json_schema(source)

        assert result.unsupported == []
        assert result.schema["properties"]["value"] == expected
        assert result.schema["required"] == ["value"]
        assert source == snapshot
        again = to_strict_json_schema(result.schema)
        assert again.schema == result.schema
        assert again.changes == []

    @pytest.mark.parametrize(
        "property_schema, kept",
        [
            ({"type": ["string", "null"], "enum": ["asc", "desc"]}, False),
            ({"type": ["string", "null"], "const": "asc"}, False),
            ({"type": ["string", "null"], "enum": ["asc", None]}, True),
            ({"type": ["string", "null"], "const": None}, True),
            ({"$ref": "#/$defs/Direction"}, True),
            ({"$ref": "#/$defs/Direction", "type": "string"}, False),
            ({"$ref": "#/$defs/Direction", "enum": ["asc"]}, False),
            ({"$ref": "#/$defs/Missing"}, False),
            ({"$ref": 1}, False),
            ({"allOf": [{"type": ["string", "null"]}, {"enum": ["asc"]}]}, False),
            ({"allOf": [{"type": ["string", "null"]}, DIRECTION]}, True),
            ({"oneOf": [NULL_BRANCH, {"type": "string"}]}, True),
            ({"oneOf": [NULL_BRANCH, {"enum": [None]}]}, False),
            ({"not": NULL_BRANCH}, False),
            ({"not": {"type": "string"}}, True),
            ({"if": NULL_BRANCH, "then": {"type": "string"}}, False),
            ({"if": {"type": "string"}, "then": {"type": "string"}}, True),
            ({"if": {"type": "string"}, "else": {"type": "string"}}, False),
            (True, True),
            (False, False),
        ],
    )
    def test_null_is_kept_only_when_every_keyword_accepts_it(
        self, property_schema, kept
    ):
        schema = {
            "type": "object",
            "properties": {"value": property_schema},
            "$defs": {"Direction": DIRECTION},
        }
        arguments = {"value": None}
        expected = {"value": None} if kept else {}
        assert omit_null_tool_arguments(arguments, schema) == expected
        assert arguments == {"value": None}

    @pytest.mark.parametrize(
        "definitions, kept",
        [
            ({"a": {"$ref": "#/$defs/a"}}, False),
            ({"a": {"$ref": "#/$defs/b"}, "b": {"$ref": "#/$defs/a"}}, False),
            ({"a": {"anyOf": [{"$ref": "#/$defs/a"}]}}, False),
            ({"a": {"type": "null", "oneOf": [{"$ref": "#/$defs/a"}]}}, False),
            (
                {
                    "a": {"anyOf": [{"$ref": "#/$defs/b"}]},
                    "b": {"anyOf": [{"$ref": "#/$defs/a"}]},
                },
                False,
            ),
            ({"a": {"anyOf": [{"$ref": "#/$defs/a"}, NULL_BRANCH]}}, True),
            ({"a": {"oneOf": [{"$ref": "#/$defs/a"}, NULL_BRANCH]}}, True),
        ],
    )
    def test_reference_cycles_terminate(self, definitions, kept):
        schema = {
            "type": "object",
            "properties": {"value": {"$ref": "#/$defs/a"}},
            "$defs": definitions,
        }
        expected = {"value": None} if kept else {}
        assert omit_null_tool_arguments({"value": None}, schema) == expected
        assert to_strict_json_schema(schema).unsupported == []

    def test_a_node_reached_twice_outside_a_cycle_is_checked_each_time(self):
        shared = {"anyOf": [NULL_BRANCH]}
        schema = {
            "type": "object",
            "properties": {"value": {"allOf": [shared, shared]}},
        }
        assert omit_null_tool_arguments({"value": None}, schema) == {"value": None}

    @staticmethod
    def _diamond(levels, keyword, leaf):
        """``a0`` is the leaf; every ``a(i)`` references ``a(i-1)`` twice."""
        definitions = {"a0": leaf}
        for i in range(1, levels + 1):
            ref = {"$ref": f"#/$defs/a{i - 1}"}
            definitions[f"a{i}"] = {keyword: [ref, ref]}
        return {
            "type": "object",
            "properties": {"value": {"$ref": f"#/$defs/a{levels}"}},
            "$defs": definitions,
        }

    def test_a_definition_shared_by_many_branches_is_evaluated_once(self):
        rejecting = self._diamond(20, "anyOf", {"type": "string"})
        strict = to_strict_json_schema(rejecting).schema
        assert strict["properties"]["value"] == _wrapped({"$ref": "#/$defs/a20"})
        assert omit_null_tool_arguments({"value": None}, rejecting) == {}

        accepting = self._diamond(20, "allOf", NULL_BRANCH)
        assert omit_null_tool_arguments({"value": None}, accepting) == {"value": None}

    def test_stays_bounded_when_cycles_keep_answers_from_being_remembered(self):
        # Every level also points back at the top, so no answer below it is final.
        levels = 20
        top = {"$ref": f"#/$defs/a{levels}"}
        definitions = {"a0": {"type": "string"}}
        for i in range(1, levels + 1):
            ref = {"$ref": f"#/$defs/a{i - 1}"}
            definitions[f"a{i}"] = {"anyOf": [ref, ref, top]}
        schema = {"type": "object", "properties": {"value": top}, "$defs": definitions}
        assert omit_null_tool_arguments({"value": None}, schema) == {}
        strict = to_strict_json_schema(schema).schema
        assert strict["properties"]["value"] == _wrapped(top)

    def test_null_is_not_proven_through_a_reference_chain_past_the_depth_bound(self):
        definitions = {"a0": NULL_BRANCH}
        for i in range(1, 101):
            definitions[f"a{i}"] = {"$ref": f"#/$defs/a{i - 1}"}

        def schema(name):
            return {
                "type": "object",
                "properties": {"value": {"$ref": f"#/$defs/{name}"}},
                "$defs": definitions,
            }

        assert omit_null_tool_arguments({"value": None}, schema("a100")) == {}
        assert omit_null_tool_arguments({"value": None}, schema("a10")) == {
            "value": None
        }

    def test_ref_to_a_target_the_rewrite_types_as_an_object_gets_a_null_branch(self):
        source = {
            "type": "object",
            "properties": {"node": {"$ref": "#/$defs/Node"}},
            "$defs": {
                "Node": {
                    "properties": {
                        "label": {"type": "string"},
                        "child": {"$ref": "#/$defs/Node"},
                    }
                }
            },
        }
        result = to_strict_json_schema(source)
        node = result.schema["$defs"]["Node"]

        assert result.unsupported == []
        assert result.schema["properties"]["node"] == _wrapped({"$ref": "#/$defs/Node"})
        assert node["type"] == "object"
        assert node["properties"]["child"] == _wrapped({"$ref": "#/$defs/Node"})
        # The tool's own schema accepts the null, so it is forwarded.
        assert omit_null_tool_arguments({"node": None}, source) == {"node": None}

    def test_ref_into_a_property_that_wrapping_moved_is_reported(self):
        result = to_strict_json_schema(
            {
                "type": "object",
                "properties": {
                    "value": {
                        "type": "string",
                        "enum": ["asc"],
                        "$defs": {"Text": {"type": "string"}},
                    },
                    "alias": {"$ref": "#/properties/value/$defs/Text"},
                },
                "required": ["alias"],
            }
        )
        assert [(e.path, e.keyword) for e in result.unsupported] == [
            ("properties.alias", "$ref")
        ]

    def test_many_properties_share_what_was_learned_about_a_cyclic_definition(self):
        levels = 20
        top = f"#/$defs/a{levels}"
        definitions = {"a0": {"type": "string"}}
        for i in range(1, levels + 1):
            lower = f"#/$defs/a{i - 1}"
            definitions[f"a{i}"] = {
                "anyOf": [{"$ref": lower}, {"$ref": lower}, {"$ref": top}]
            }
        names = [f"p{i}" for i in range(400)]
        schema = {
            "type": "object",
            "properties": {name: {"$ref": top} for name in names},
            "$defs": definitions,
        }
        strict = to_strict_json_schema(schema).schema
        assert all(
            strict["properties"][name] == _wrapped({"$ref": top}) for name in names
        )
        assert omit_null_tool_arguments(dict.fromkeys(names), schema) == {}

    def test_a_check_that_runs_out_of_budget_does_not_affect_the_next_one(self):
        schema = {
            "type": "object",
            "properties": {
                "wide": {"anyOf": [{"type": "string"} for _ in range(5000)]},
                "note": {"type": ["string", "null"]},
                "same": {"anyOf": [{"type": "string"}, NULL_BRANCH]},
            },
        }
        arguments = {"wide": None, "note": None, "same": None}
        assert omit_null_tool_arguments(arguments, schema) == {
            "note": None,
            "same": None,
        }
        strict = to_strict_json_schema(schema).schema["properties"]
        assert strict["note"] == {"type": ["string", "null"]}
        assert strict["same"] == {"anyOf": [{"type": "string"}, NULL_BRANCH]}

    def test_a_check_that_meets_a_bound_proves_nothing(self):
        # Both branches accept null, so `oneOf` rejects it; the second is only
        # reachable past the depth bound and must not count as a rejection.
        definitions = {"a0": NULL_BRANCH}
        for i in range(1, 71):
            definitions[f"a{i}"] = {"$ref": f"#/$defs/a{i - 1}"}
        deep = {"$ref": "#/$defs/a70"}
        schema = {
            "type": "object",
            "properties": {
                "one": {"oneOf": [NULL_BRANCH, deep]},
                "negated": {"not": deep},
                "guarded": {"if": deep, "else": NULL_BRANCH},
                # Reaches a node the checks above left unproven.
                "later": {"not": {"$ref": "#/$defs/a69"}},
            },
            "$defs": definitions,
        }
        arguments = dict.fromkeys(schema["properties"])
        assert omit_null_tool_arguments(arguments, schema) == {}

    def test_an_unproven_definition_is_not_evaluated_again_for_each_property(self):
        # `top` is cyclic and wider than the budget, so nothing about it settles.
        definitions = {
            "top": {"anyOf": [{"$ref": f"#/$defs/b{i}"} for i in range(3000)]}
        }
        for i in range(3000):
            definitions[f"b{i}"] = {
                "anyOf": [{"$ref": "#/$defs/top"}, {"type": "string"}]
            }
        names = [f"p{i}" for i in range(2000)]
        schema = {
            "type": "object",
            "properties": {name: {"$ref": "#/$defs/top"} for name in names},
            "$defs": definitions,
        }
        assert omit_null_tool_arguments(dict.fromkeys(names), schema) == {}
        strict = to_strict_json_schema(schema).schema["properties"]
        assert all(strict[name] == _wrapped({"$ref": "#/$defs/top"}) for name in names)
