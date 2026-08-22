"""Normalize JSON Schemas for OpenAI structured outputs (``strict`` mode).

Python counterpart of the TypeScript SDK's ``toStrictJsonSchema``
(``ts/packages/core/src/utils/jsonSchema.ts``). OpenAI's structured-output
contract requires *every* object node — not just the root — to list all of its
properties in ``required``, set ``additionalProperties: False``, avoid
annotation-only keywords, and express nullable / multi-typed fields via
``anyOf``. Tool parameter schemas that nest objects or use ``type`` arrays are
otherwise rejected by the API with a 400.

Every structural change is recorded so callers can surface diagnostics instead
of failing silently. The input is never mutated. Dereference ``$ref`` pointers
first (see :func:`composio.utils.json_schema.dereference_json_schema`) so
definitions under ``$defs`` are normalized too.
"""

from __future__ import annotations

import typing as t

MAX_NODE_DEPTH = 512
MAX_CHANGES = 50

# Annotation-only keywords OpenAI structured outputs rejects; safe to strip.
STRICT_STRIP_KEYWORDS = frozenset({"examples", "default"})

# Keywords whose values are literal data, not schemas - never recursed as schemas.
STRICT_INSTANCE_VALUE_KEYWORDS = frozenset({"const", "enum"})

STRICT_SCHEMA_SINGLE_KEYS = frozenset(
    {
        "additionalItems",
        "additionalProperties",
        "contains",
        "contentSchema",
        "else",
        "if",
        "not",
        "propertyNames",
        "then",
        "unevaluatedItems",
        "unevaluatedProperties",
    }
)
STRICT_SCHEMA_ARRAY_KEYS = frozenset({"allOf", "anyOf", "oneOf", "prefixItems"})
STRICT_SCHEMA_MAP_KEYS = frozenset(
    {"$defs", "definitions", "dependentSchemas", "patternProperties", "properties"}
)


class StrictSchemaChange(t.NamedTuple):
    """A single structural change applied by :func:`to_strict_json_schema`."""

    path: str
    reason: str
    detail: str = ""


class StrictJsonSchemaResult(t.NamedTuple):
    """Normalized schema plus a change log."""

    schema: t.Any
    changes: list[StrictSchemaChange]


def _join_path(parent: str, key: str) -> str:
    return f"{parent}.{key}" if parent else key


def _split_type_array(
    node: dict[str, t.Any], path: str, changes: list[StrictSchemaChange]
) -> dict[str, t.Any]:
    type_values = node["type"]
    branches = [
        {"type": "null"} if value == "null" else {**node, "type": value}
        for value in type_values
    ]
    rest = {key: value for key, value in node.items() if key != "type"}
    reason = (
        "nullable-type-converted" if "null" in type_values else "multi-type-converted"
    )
    if len(changes) < MAX_CHANGES:
        changes.append(
            StrictSchemaChange(
                path=path,
                reason=reason,
                detail=f"type [{', '.join(str(value) for value in type_values)}] converted to anyOf",
            )
        )
    return {**rest, "anyOf": branches}


def _walk(
    value: t.Any,
    mode: str,
    depth: int,
    path: str,
    changes: list[StrictSchemaChange],
) -> t.Any:
    if depth > MAX_NODE_DEPTH:
        raise ValueError(
            f"JSON Schema exceeds maximum nesting depth of {MAX_NODE_DEPTH}"
        )

    if isinstance(value, list):
        item_mode = "schema" if mode == "schema-array" else "value"
        return [
            _walk(item, item_mode, depth + 1, f"{path}[{index}]", changes)
            for index, item in enumerate(value)
        ]

    if not isinstance(value, dict) or mode == "value":
        return value

    node: dict[str, t.Any] = value

    # Nullable / multi-type arrays must become anyOf before anything else so
    # the generated branches flow through the normal recursion below.
    if isinstance(node.get("type"), list):
        node = _split_type_array(node, path, changes)

    stripped: dict[str, t.Any] = {}
    for key, child in node.items():
        if key in STRICT_STRIP_KEYWORDS:
            if len(changes) < MAX_CHANGES:
                changes.append(
                    StrictSchemaChange(
                        path=path,
                        reason="annotation-keyword-stripped",
                        detail=f'keyword "{key}" removed',
                    )
                )
            continue
        stripped[key] = child
    node = stripped

    has_properties_keyword = isinstance(node.get("properties"), dict)
    if not (has_properties_keyword or node.get("type") == "object"):
        return _walk_children(node, mode, depth, path, changes)

    properties = node["properties"] if has_properties_keyword else {}
    declared_required = [
        entry for entry in node.get("required", []) if isinstance(entry, str)
    ]
    keep_only_required = len(declared_required) > 0
    kept = set(declared_required if keep_only_required else properties.keys())

    next_properties: dict[str, t.Any] = {}
    for name, property_schema in properties.items():
        child_path = _join_path(path, f"properties.{name}")
        if name in kept:
            next_properties[name] = _walk(
                property_schema, "schema", depth + 1, child_path, changes
            )
        elif len(changes) < MAX_CHANGES:
            changes.append(
                StrictSchemaChange(
                    path=child_path,
                    reason="non-required-property-dropped",
                    detail=f'property "{name}" is not listed in "required"',
                )
            )

    managed = ("type", "properties", "required", "additionalProperties")
    rest = {key: child for key, child in node.items() if key not in managed}

    return {
        **_walk_children(rest, "schema", depth, path, changes),
        "type": "object",
        "properties": next_properties,
        "required": list(next_properties.keys()),
        "additionalProperties": False,
    }


def _walk_children(
    node: dict[str, t.Any],
    mode: str,
    depth: int,
    path: str,
    changes: list[StrictSchemaChange],
) -> dict[str, t.Any]:
    clone: dict[str, t.Any] = {}
    for key, child in node.items():
        child_mode = "value"
        if mode == "schema-map":
            child_mode = "schema"
        elif mode == "schema" and key not in STRICT_INSTANCE_VALUE_KEYWORDS:
            if key in STRICT_SCHEMA_MAP_KEYS:
                child_mode = "schema-map"
            elif key in STRICT_SCHEMA_ARRAY_KEYS or (
                key == "items" and isinstance(child, list)
            ):
                child_mode = "schema-array"
            elif key in STRICT_SCHEMA_SINGLE_KEYS or key == "items":
                child_mode = "schema"

        if child_mode == "schema-map" and isinstance(child, dict):
            map_clone: dict[str, t.Any] = {}
            for name, sub_schema in child.items():
                map_clone[name] = _walk(
                    sub_schema,
                    "schema",
                    depth + 1,
                    _join_path(_join_path(path, key), name),
                    changes,
                )
            clone[key] = map_clone
            continue
        clone[key] = _walk(child, child_mode, depth + 1, _join_path(path, key), changes)
    return clone


def to_strict_json_schema(schema: t.Any) -> StrictJsonSchemaResult:
    """Normalize a JSON Schema for OpenAI structured outputs.

    Applies the strict contract at every depth:

    - Objects with a non-empty ``required`` keep only those properties;
      objects without one keep every property but require them all.
    - ``type`` arrays become ``anyOf`` branches with an explicit null variant.
    - Annotation keywords (``examples``, ``default``) are stripped.
    - Composition keywords, array items and property maps normalize recursively.

    :param schema: The JSON schema to normalize; never mutated.
    :return: A :class:`StrictJsonSchemaResult` with the normalized schema and
        a change log capped at 50 entries.
    """
    changes: list[StrictSchemaChange] = []
    normalized = _walk(schema, "schema", 0, "", changes)
    return StrictJsonSchemaResult(schema=normalized, changes=changes)
