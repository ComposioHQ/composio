"""Tests for :func:`composio.utils.json_schema.dereference_json_schema`.

Mirrors the TypeScript SDK's ``jsonSchema.test.ts`` so the two SDKs share one
behavioral contract for inlining JSON Schema ``$ref`` pointers.
"""

import typing as t
from unittest.mock import patch

import pytest

from composio.exceptions import JSONSchemaRefResolutionError
from composio.utils import json_schema
from composio.utils.json_schema import (
    MAX_REF_CHAIN_DEPTH,
    UNRESOLVED_REF_DESCRIPTION,
    dereference_json_schema,
)


def _contains_ref(value: t.Any) -> bool:
    if isinstance(value, dict):
        if "$ref" in value:
            return True
        return any(_contains_ref(v) for v in value.values())
    if isinstance(value, list):
        return any(_contains_ref(v) for v in value)
    return False


PERMISSIVE: t.Dict[str, t.Any] = {"type": "object", "additionalProperties": True}
PERMISSIVE_WITH_HINT: t.Dict[str, t.Any] = {
    **PERMISSIVE,
    "description": UNRESOLVED_REF_DESCRIPTION,
}


class TestDereferenceJsonSchema:
    def test_inlines_single_internal_ref(self):
        out = dereference_json_schema(
            {
                "type": "object",
                "properties": {"user": {"$ref": "#/$defs/User"}},
                "required": ["user"],
                "$defs": {"User": {"type": "string"}},
            }
        )
        assert out == {
            "type": "object",
            "properties": {"user": {"type": "string"}},
            "required": ["user"],
        }
        assert _contains_ref(out) is False

    def test_resolves_chain_a_b_c(self):
        out = dereference_json_schema(
            {
                "type": "object",
                "properties": {"v": {"$ref": "#/$defs/A"}},
                "$defs": {
                    "A": {"$ref": "#/$defs/B"},
                    "B": {"$ref": "#/$defs/C"},
                    "C": {"type": "integer"},
                },
            }
        )
        assert _contains_ref(out) is False
        assert out["properties"]["v"] == {"type": "integer"}

    def test_walks_containers_reflectively(self):
        """Refs are resolved in keywords the file walkers never special-cased."""
        out = dereference_json_schema(
            {
                "type": "object",
                "properties": {
                    "a": {"type": "array", "items": {"$ref": "#/$defs/Leaf"}},
                    "b": {"oneOf": [{"$ref": "#/$defs/Leaf"}, {"type": "null"}]},
                    "c": {"anyOf": [{"$ref": "#/$defs/Leaf"}]},
                    "d": {"allOf": [{"$ref": "#/$defs/Leaf"}]},
                    "e": {"not": {"$ref": "#/$defs/Leaf"}},
                    "f": {
                        "type": "object",
                        "additionalProperties": {"$ref": "#/$defs/Leaf"},
                    },
                    "g": {
                        "type": "object",
                        "patternProperties": {"^x_": {"$ref": "#/$defs/Leaf"}},
                    },
                    "h": {"type": "array", "prefixItems": [{"$ref": "#/$defs/Leaf"}]},
                },
                "$defs": {"Leaf": {"type": "string"}},
            }
        )
        assert _contains_ref(out) is False

    def test_resolves_legacy_definitions(self):
        out = dereference_json_schema(
            {
                "type": "object",
                "properties": {"name": {"$ref": "#/definitions/Name"}},
                "definitions": {"Name": {"type": "string", "minLength": 1}},
            }
        )
        assert _contains_ref(out) is False
        assert out["properties"]["name"] == {"type": "string", "minLength": 1}

    def test_mixes_defs_and_definitions_transitively(self):
        out = dereference_json_schema(
            {
                "type": "object",
                "properties": {"v": {"$ref": "#/definitions/A"}},
                "definitions": {"A": {"$ref": "#/$defs/B"}},
                "$defs": {"B": {"type": "boolean"}},
            }
        )
        assert _contains_ref(out) is False
        assert out["properties"]["v"] == {"type": "boolean"}

    def test_sibling_keywords_win_on_collision(self):
        out = dereference_json_schema(
            {
                "type": "object",
                "properties": {
                    "v": {
                        "$ref": "#/$defs/Foo",
                        "description": "caller override",
                        "default": None,
                    },
                },
                "$defs": {
                    "Foo": {"type": "string", "description": "target description"}
                },
            }
        )
        v = out["properties"]["v"]
        assert v["type"] == "string"
        assert v["description"] == "caller override"
        assert v["default"] is None
        assert _contains_ref(out) is False

    def test_breaks_recursive_ref_cycles_with_sentinel(self):
        out = dereference_json_schema(
            {
                "$ref": "#/$defs/Tree",
                "$defs": {
                    "Tree": {
                        "type": "object",
                        "properties": {
                            "children": {
                                "type": "array",
                                "items": {"$ref": "#/$defs/Tree"},
                            },
                        },
                    },
                },
            }
        )
        assert out["type"] == "object"
        assert out["properties"]["children"]["items"] == PERMISSIVE
        assert _contains_ref(out) is False

    def test_strips_defs_and_definitions_from_root(self):
        out = dereference_json_schema(
            {
                "type": "object",
                "properties": {"x": {"$ref": "#/$defs/Foo"}},
                "$defs": {"Foo": {"type": "integer"}},
                "definitions": {"Bar": {"type": "string"}},
            }
        )
        assert "$defs" not in out
        assert "definitions" not in out

    def test_throws_when_target_missing(self):
        with pytest.raises(JSONSchemaRefResolutionError):
            dereference_json_schema(
                {
                    "type": "object",
                    "properties": {"v": {"$ref": "#/$defs/Missing"}},
                    "$defs": {},
                }
            )

    def test_throws_when_chain_depth_exceeds_cap(self):
        defs: t.Dict[str, t.Any] = {}
        for i in range(200):
            target = f"#/$defs/A{i + 1}" if i + 1 < 200 else "#/$defs/A0"
            defs[f"A{i}"] = {"$ref": target}
        with pytest.raises(JSONSchemaRefResolutionError):
            dereference_json_schema(
                {
                    "type": "object",
                    "properties": {"v": {"$ref": "#/$defs/A0"}},
                    "$defs": defs,
                }
            )

    def test_throws_on_pathologically_deep_nesting(self):
        leaf: t.Dict[str, t.Any] = {"type": "string"}
        for _ in range(1000):
            leaf = {"type": "object", "properties": {"x": leaf}}
        with pytest.raises(JSONSchemaRefResolutionError):
            dereference_json_schema(leaf)

    def test_breaks_identity_cycles_without_ref(self):
        """A live-object cycle that does not flow through a ``$ref``."""
        root: t.Dict[str, t.Any] = {"type": "object", "properties": {}}
        root["properties"]["self"] = root
        out = dereference_json_schema(root)
        assert out["properties"]["self"] == PERMISSIVE

    def test_leaves_external_ref_untouched_and_warns(self):
        with patch.object(json_schema.logger, "warning") as warn:
            out = dereference_json_schema(
                {
                    "type": "object",
                    "properties": {"v": {"$ref": "https://example.com/Foo"}},
                }
            )
        assert out["properties"]["v"]["$ref"] == "https://example.com/Foo"
        warn.assert_called_once()
        assert "https://example.com/Foo" in str(warn.call_args)

    def test_does_not_mutate_input(self):
        import copy

        schema = {
            "type": "object",
            "properties": {"v": {"$ref": "#/$defs/Foo"}},
            "$defs": {"Foo": {"type": "string"}},
        }
        snapshot = copy.deepcopy(schema)
        dereference_json_schema(schema)
        assert schema == snapshot

    def test_decodes_json_pointer_escapes(self):
        out = dereference_json_schema(
            {
                "type": "object",
                "properties": {
                    "a": {"$ref": "#/$defs/with~1slash"},
                    "b": {"$ref": "#/$defs/with~0tilde"},
                    "c": {"$ref": "#/$defs/tilde-then-slash~01"},
                },
                "$defs": {
                    "with/slash": {"type": "string"},
                    "with~tilde": {"type": "integer"},
                    "tilde-then-slash~1": {"type": "boolean"},
                },
            }
        )
        props = out["properties"]
        assert props["a"]["type"] == "string"
        assert props["b"]["type"] == "integer"
        assert props["c"]["type"] == "boolean"

    def test_resolves_array_index_pointers(self):
        out = dereference_json_schema(
            {
                "type": "object",
                "properties": {"v": {"$ref": "#/$defs/foo/oneOf/0"}},
                "$defs": {"foo": {"oneOf": [{"type": "string"}, {"type": "number"}]}},
            }
        )
        assert out["properties"]["v"]["type"] == "string"

    def test_passthrough_for_non_dict_input(self):
        assert dereference_json_schema("not-a-schema") == "not-a-schema"
        assert dereference_json_schema(None) is None


class TestSentinelMode:
    def test_replaces_dangling_ref_with_no_defs_block(self):
        """Mirrors GMAIL_FETCH_EMAILS: a ``$ref`` into ``#/$defs`` with no defs."""
        out = dereference_json_schema(
            {
                "type": "object",
                "properties": {
                    "data": {"$ref": "#/$defs/FetchEmailsResponse"},
                    "error": {"type": "string"},
                    "successful": {"type": "boolean"},
                },
                "required": ["data", "successful"],
                "title": "FetchEmailsResponseWrapper",
            },
            on_unresolved="sentinel",
        )
        assert out["properties"]["data"] == PERMISSIVE_WITH_HINT
        assert out["properties"]["error"] == {"type": "string"}
        assert out["properties"]["successful"] == {"type": "boolean"}
        assert out["required"] == ["data", "successful"]
        assert _contains_ref(out) is False

    def test_replaces_ref_into_empty_defs(self):
        out = dereference_json_schema(
            {
                "type": "object",
                "properties": {"v": {"$ref": "#/$defs/Missing"}},
                "$defs": {},
            },
            on_unresolved="sentinel",
        )
        assert out["properties"]["v"] == PERMISSIVE_WITH_HINT
        assert _contains_ref(out) is False

    def test_on_replace_called_once_per_replacement(self):
        calls: t.List[t.Tuple[str, str]] = []
        dereference_json_schema(
            {
                "type": "object",
                "properties": {
                    "a": {"$ref": "#/$defs/Missing"},
                    "b": {"$ref": "#/$defs/Missing"},
                    "c": {"$ref": "#/$defs/AlsoMissing"},
                },
            },
            on_unresolved="sentinel",
            on_replace=lambda ref, reason: calls.append((ref, reason)),
        )
        assert calls == [
            ("#/$defs/Missing", "missing-target"),
            ("#/$defs/Missing", "missing-target"),
            ("#/$defs/AlsoMissing", "missing-target"),
        ]

    def test_on_replace_malformed_pointer(self):
        calls: t.List[t.Tuple[str, str]] = []
        out = dereference_json_schema(
            {"type": "object", "properties": {"v": {"$ref": "#bar"}}},
            on_unresolved="sentinel",
            on_replace=lambda ref, reason: calls.append((ref, reason)),
        )
        assert calls == [("#bar", "malformed-pointer")]
        assert out["properties"]["v"] == PERMISSIVE_WITH_HINT

    def test_still_throws_on_chain_depth_cap(self):
        defs: t.Dict[str, t.Any] = {}
        for i in range(200):
            target = f"#/$defs/A{i + 1}" if i + 1 < 200 else "#/$defs/A0"
            defs[f"A{i}"] = {"$ref": target}
        with pytest.raises(JSONSchemaRefResolutionError):
            dereference_json_schema(
                {
                    "type": "object",
                    "properties": {"v": {"$ref": "#/$defs/A0"}},
                    "$defs": defs,
                },
                on_unresolved="sentinel",
            )

    def test_still_throws_on_node_depth_cap(self):
        leaf: t.Dict[str, t.Any] = {"type": "string"}
        for _ in range(1000):
            leaf = {"type": "object", "properties": {"x": leaf}}
        with pytest.raises(JSONSchemaRefResolutionError):
            dereference_json_schema(leaf, on_unresolved="sentinel")

    def test_explicit_throw_matches_default(self):
        with pytest.raises(JSONSchemaRefResolutionError):
            dereference_json_schema(
                {
                    "type": "object",
                    "properties": {"v": {"$ref": "#/$defs/Missing"}},
                    "$defs": {},
                },
                on_unresolved="throw",
            )

    def test_does_not_call_on_replace_in_strict_mode(self):
        calls: t.List[t.Any] = []
        with pytest.raises(JSONSchemaRefResolutionError):
            dereference_json_schema(
                {
                    "type": "object",
                    "properties": {"v": {"$ref": "#/$defs/Missing"}},
                    "$defs": {},
                },
                on_unresolved="throw",
                on_replace=lambda ref, reason: calls.append((ref, reason)),
            )
        assert calls == []

    def test_injects_default_description_when_no_sibling(self):
        out = dereference_json_schema(
            {"type": "object", "properties": {"v": {"$ref": "#/$defs/Missing"}}},
            on_unresolved="sentinel",
        )
        description = out["properties"]["v"]["description"]
        assert "Schema shape unresolved at the source" in description
        assert "https://github.com/ComposioHQ/composio/issues/3307" in description

    def test_preserves_caller_description_sibling(self):
        out = dereference_json_schema(
            {
                "type": "object",
                "properties": {
                    "v": {
                        "$ref": "#/$defs/Missing",
                        "description": "caller-supplied prose context",
                    },
                },
            },
            on_unresolved="sentinel",
        )
        assert out["properties"]["v"]["description"] == "caller-supplied prose context"
        assert out["properties"]["v"]["type"] == "object"

    def test_preserves_resolvable_defs_while_replacing_dangling_branch(self):
        out = dereference_json_schema(
            {
                "type": "object",
                "properties": {
                    "resolved": {"$ref": "#/$defs/Real"},
                    "dangling": {"$ref": "#/$defs/Ghost"},
                },
                "$defs": {"Real": {"type": "integer"}},
            },
            on_unresolved="sentinel",
        )
        assert out["properties"]["resolved"] == {"type": "integer"}
        assert out["properties"]["dangling"] == PERMISSIVE_WITH_HINT


def test_max_ref_chain_depth_is_exposed():
    """Guard against accidental removal of the safety cap constant."""
    assert MAX_REF_CHAIN_DEPTH == 100
