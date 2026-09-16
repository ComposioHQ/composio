"""Normalize JSON Schemas for OpenAI structured outputs (``strict`` mode).

Python counterpart of the TypeScript SDK's ``toStrictJsonSchema``
(``ts/packages/core/src/utils/jsonSchema.ts``). OpenAI's structured-output
contract requires *every* object node — not just the root — to list all of its
properties in ``required``, set ``additionalProperties: False`` and avoid
annotation-only keywords. Optional fields are emulated the way OpenAI
documents: the property stays, becomes required, and is widened to accept
``null`` (``"type": ["string", "null"]`` or an extra ``anyOf`` branch). Nothing
is dropped, so the model keeps every parameter it could pass before; the strict
provider drops a ``null`` the tool's own schema does not accept before
executing the tool (see :func:`omit_null_tool_arguments`).

Local ``$ref`` pointers into ``$defs``/``definitions`` are kept (the API
supports them, including recursion) and the definitions themselves are
normalized; an optional ``$ref`` property is widened with an ``anyOf`` null
branch. Constructs strict mode cannot express — objects that accept arbitrary
keys (schema-valued or ``True`` ``additionalProperties``, ``patternProperties``,
property-less free-form objects), ``allOf``, ``prefixItems``, external or
dangling ``$ref`` pointers and a non-object root — are reported in
``unsupported`` instead of being rewritten into something narrower; the
provider sends such a tool without strict mode.

The input is never mutated, every rewrite is recorded (capped at 50 entries;
``total_changes`` carries the real count) and ``required`` arrays are
de-duplicated at the end.
"""

from __future__ import annotations

import typing as t

from composio.utils.json_schema import MAX_REF_CHAIN_DEPTH, _try_resolve_pointer

MAX_NODE_DEPTH = 512
MAX_CHANGES = 50

# Annotation-only keywords OpenAI structured outputs rejects; safe to strip.
STRICT_STRIP_KEYWORDS = frozenset({"examples", "default"})

# Keywords whose values are literal data, not schemas - never recursed as schemas.
INSTANCE_VALUE_KEYWORDS = frozenset({"const", "default", "enum", "examples"})

SCHEMA_KEYWORDS = frozenset(
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
SCHEMA_ARRAY_KEYWORDS = frozenset({"allOf", "anyOf", "oneOf", "prefixItems"})
SCHEMA_MAP_KEYWORDS = frozenset(
    {"$defs", "definitions", "dependentSchemas", "patternProperties", "properties"}
)

# Keywords OpenAI structured outputs reject and that have no lossless rewrite.
STRICT_UNSUPPORTED_KEYWORDS = (
    "allOf",
    "prefixItems",
    "additionalItems",
    "contains",
    "dependencies",
    "dependentSchemas",
    "else",
    "if",
    "not",
    "propertyNames",
    "then",
    "unevaluatedItems",
    "unevaluatedProperties",
)


def _is_object_type(node_type: t.Any) -> bool:
    """Whether a ``type`` value declares exactly the object type."""
    return node_type == "object" or (
        isinstance(node_type, list) and node_type == ["object"]
    )


StrictSchemaChangeReason = t.Literal[
    "optional-property-nullable",
    "unsupported-keyword-stripped",
    "one-of-converted",
]


class StrictSchemaChange(t.NamedTuple):
    """A single lossless rewrite applied by :func:`to_strict_json_schema`."""

    path: str
    reason: StrictSchemaChangeReason
    detail: str = ""


class StrictSchemaIncompatibility(t.NamedTuple):
    """A construct strict structured outputs cannot express."""

    path: str
    keyword: str
    detail: str


class StrictJsonSchemaResult(t.NamedTuple):
    """Result of :func:`to_strict_json_schema`."""

    schema: dict[str, t.Any]
    """The strict schema; only usable when ``unsupported`` is empty."""
    source: dict[str, t.Any]
    """The input schema optionality was decided against."""
    changes: list[StrictSchemaChange]
    total_changes: int
    unsupported: list[StrictSchemaIncompatibility]


def _join_path(parent: str, key: str) -> str:
    return f"{parent}.{key}" if parent else key


def _widen_to_nullable(node: dict[str, t.Any]) -> dict[str, t.Any]:
    """Accept ``null`` without placing ``type`` beside ``anyOf``."""
    any_of = node.get("anyOf")
    if isinstance(any_of, list):
        if any(isinstance(b, dict) and b.get("type") == "null" for b in any_of):
            return node
        return {**node, "anyOf": [*any_of, {"type": "null"}]}
    node_type = node.get("type")
    if isinstance(node_type, str):
        return node if node_type == "null" else {**node, "type": [node_type, "null"]}
    if isinstance(node_type, list):
        return node if "null" in node_type else {**node, "type": [*node_type, "null"]}
    if (isinstance(node.get("enum"), list) and None in node["enum"]) or (
        "const" in node and node["const"] is None
    ):
        return node
    annotations: dict[str, t.Any] = {
        k: node[k] for k in ("description", "title") if k in node
    }
    rest = {k: v for k, v in node.items() if k not in annotations}
    if not rest:
        return node
    return {**annotations, "anyOf": [rest, {"type": "null"}]}


def _resolve_local_refs(node: t.Any, root: dict[str, t.Any]) -> t.Any:
    """Follow local ``$ref`` pointers until a concrete node is reached."""
    current = node
    for _ in range(MAX_REF_CHAIN_DEPTH):
        if not isinstance(current, dict) or not isinstance(current.get("$ref"), str):
            return current
        resolution = _try_resolve_pointer(root, current["$ref"])
        if not resolution.ok:
            return current
        current = resolution.value
    return current


def _schema_accepts_null(schema: t.Any, root: dict[str, t.Any]) -> bool:
    """Whether a schema node accepts ``null`` as an instance."""
    node = _resolve_local_refs(schema, root)
    if not isinstance(node, dict):
        return True
    node_type = node.get("type")
    if isinstance(node_type, str):
        return node_type == "null"
    if isinstance(node_type, list):
        return "null" in node_type
    if isinstance(node.get("enum"), list):
        return None in node["enum"]
    if "const" in node:
        return node["const"] is None
    for keyword in ("anyOf", "oneOf"):
        branches = node.get(keyword)
        if isinstance(branches, list):
            return any(_schema_accepts_null(b, root) for b in branches)
    return True


def _dedupe_required(value: t.Any, is_schema: bool = True, depth: int = 0) -> t.Any:
    if depth > MAX_NODE_DEPTH:
        raise ValueError(
            f"JSON Schema exceeds maximum nesting depth of {MAX_NODE_DEPTH}"
        )
    if isinstance(value, list):
        return [_dedupe_required(item, is_schema, depth + 1) for item in value]
    if not isinstance(value, dict):
        return value
    clone: dict[str, t.Any] = {}
    for key, child in value.items():
        if is_schema and key == "required" and isinstance(child, list):
            clone[key] = list(dict.fromkeys(child))
        else:
            clone[key] = _dedupe_required(
                child, is_schema and key not in INSTANCE_VALUE_KEYWORDS, depth + 1
            )
    return clone


class _Walker:
    def __init__(self, root: dict[str, t.Any]) -> None:
        self.root = root
        self.changes: list[StrictSchemaChange] = []
        self.total_changes = 0
        self.unsupported: list[StrictSchemaIncompatibility] = []

    def record(self, path: str, reason: StrictSchemaChangeReason, detail: str) -> None:
        self.total_changes += 1
        if len(self.changes) < MAX_CHANGES:
            self.changes.append(StrictSchemaChange(path, reason, detail))

    def reject(self, path: str, keyword: str, detail: str) -> None:
        self.unsupported.append(StrictSchemaIncompatibility(path, keyword, detail))

    def walk_children(
        self, node: dict[str, t.Any], mode: str, depth: int, path: str
    ) -> dict[str, t.Any]:
        clone: dict[str, t.Any] = {}
        for key, child in node.items():
            child_mode = "value"
            if mode == "schema-map":
                child_mode = "schema"
            elif mode == "schema" and key not in INSTANCE_VALUE_KEYWORDS:
                if key in SCHEMA_MAP_KEYWORDS:
                    child_mode = "schema-map"
                elif key in SCHEMA_ARRAY_KEYWORDS or (
                    key == "items" and isinstance(child, list)
                ):
                    child_mode = "schema-array"
                elif key in SCHEMA_KEYWORDS or key == "items":
                    child_mode = "schema"

            if child_mode == "schema-map" and isinstance(child, dict):
                clone[key] = {
                    name: self.walk(
                        sub_schema,
                        "schema",
                        depth + 1,
                        _join_path(_join_path(path, key), name),
                    )
                    for name, sub_schema in child.items()
                }
                continue
            clone[key] = self.walk(child, child_mode, depth + 1, _join_path(path, key))
        return clone

    def walk(self, value: t.Any, mode: str, depth: int, path: str) -> t.Any:
        if depth > MAX_NODE_DEPTH:
            raise ValueError(
                f"JSON Schema exceeds maximum nesting depth of {MAX_NODE_DEPTH}"
            )
        if isinstance(value, list):
            item_mode = "schema" if mode == "schema-array" else "value"
            return [
                self.walk(item, item_mode, depth + 1, f"{path}[{index}]")
                for index, item in enumerate(value)
            ]
        if not isinstance(value, dict) or mode == "value":
            return value

        node: dict[str, t.Any] = {}
        for key, child in value.items():
            if key in STRICT_STRIP_KEYWORDS:
                self.record(
                    path, "unsupported-keyword-stripped", f'keyword "{key}" removed'
                )
                continue
            node[key] = child
        if isinstance(node.get("oneOf"), list) and "anyOf" not in node:
            node["anyOf"] = node.pop("oneOf")
            self.record(path, "one-of-converted", "oneOf became anyOf")
        for keyword in STRICT_UNSUPPORTED_KEYWORDS:
            if keyword in node:
                self.reject(path, keyword, f'"{keyword}" has no strict-mode equivalent')
        if "oneOf" in node:
            self.reject(path, "oneOf", "oneOf beside anyOf cannot be merged")
        if isinstance(node.get("items"), list):
            self.reject(path, "items", "tuple-form items has no strict-mode equivalent")
        elif isinstance(node.get("items"), bool):
            self.reject(path, "items", "boolean subschema")
        if "properties" in node and not isinstance(node["properties"], dict):
            self.reject(path, "properties", "properties is not an object")

        out = self.walk_children(node, mode, depth, path)

        ref = node.get("$ref")
        if isinstance(ref, str):
            resolved = (ref == "#" or ref.startswith("#/")) and _try_resolve_pointer(
                self.root, ref
            ).ok
            if not resolved:
                self.reject(path, "$ref", f'unresolved $ref "{ref}"')
            # The referenced definition is normalized where it is declared.
            return out

        node_type = out.get("type")
        declares_object = node_type == "object" or (
            isinstance(node_type, list) and "object" in node_type
        )
        if not declares_object and not isinstance(out.get("properties"), dict):
            return out
        if "properties" in out and not isinstance(out["properties"], dict):
            return out

        properties: dict[str, t.Any] = dict(out.get("properties") or {})
        required = out.get("required")
        declared_required = {
            entry
            for entry in (required if isinstance(required, list) else [])
            if isinstance(entry, str)
        }
        for name, property_schema in properties.items():
            if isinstance(property_schema, bool):
                self.reject(
                    _join_path(path, f"properties.{name}"),
                    "properties",
                    "boolean subschema",
                )
                continue
            if name in declared_required or not isinstance(property_schema, dict):
                continue
            properties[name] = _widen_to_nullable(property_schema)
            self.record(
                _join_path(path, f"properties.{name}"),
                "optional-property-nullable",
                f'property "{name}" is now required and accepts null',
            )

        additional = out.get("additionalProperties")
        accepts_dynamic_keys = additional is True or isinstance(additional, dict)
        if accepts_dynamic_keys:
            self.reject(path, "additionalProperties", "object accepts arbitrary keys")
        elif "patternProperties" in out:
            self.reject(
                path, "patternProperties", "object accepts pattern-matched keys"
            )
        elif not properties and "additionalProperties" not in out:
            self.reject(path, "properties", "free-form object accepts arbitrary keys")

        result = {**out}
        if "type" not in result:
            result["type"] = "object"
        result["properties"] = properties
        result["required"] = list(properties.keys())
        if not accepts_dynamic_keys:
            result["additionalProperties"] = False
        return result


def to_strict_json_schema(schema: t.Any) -> StrictJsonSchemaResult:
    """Normalize a tool parameter schema for OpenAI structured outputs.

    Applies the strict contract at every depth: every object lists all of its
    properties in ``required`` and is closed; optional properties are widened
    to accept ``null`` instead of being dropped; ``oneOf`` becomes ``anyOf``;
    ``default`` and ``examples`` are stripped; local ``$ref`` pointers into
    ``$defs`` or ``definitions`` are kept and the definitions are normalized
    where they are declared; ``required`` arrays are de-duplicated last.
    Constructs strict mode cannot express are listed in ``unsupported``; when
    that list is non-empty the returned ``schema`` must not be sent as strict.

    :param schema: The JSON schema to normalize; never mutated.
    :return: A :class:`StrictJsonSchemaResult`.
    """
    root: dict[str, t.Any] = schema if isinstance(schema, dict) else {}
    walker = _Walker(root)
    normalized = _dedupe_required(walker.walk(root, "schema", 0, ""))
    if not isinstance(normalized, dict) or not _is_object_type(normalized.get("type")):
        walker.reject("", "type", "root must be a non-nullable object")
    return StrictJsonSchemaResult(
        schema=normalized,
        source=root,
        changes=walker.changes,
        total_changes=walker.total_changes,
        unsupported=walker.unsupported,
    )


def omit_null_tool_arguments(
    arguments: dict[str, t.Any], schema: t.Any
) -> dict[str, t.Any]:
    """Drop ``None``-valued arguments the tool's own schema does not accept.

    Strict structured outputs cannot express optional parameters, so
    :func:`to_strict_json_schema` makes every parameter required and nullable.
    The model then sends ``null`` for a parameter it would otherwise have
    omitted; forwarding it to the tool would fail validation against the
    tool's real schema, so it is treated as "omitted". A ``null`` the original
    schema accepts is kept. ``schema`` is the tool schema the strict rewrite
    was computed from (``StrictJsonSchemaResult.source``). The input is not
    mutated.
    """
    root: dict[str, t.Any] = schema if isinstance(schema, dict) else {}
    return t.cast(dict[str, t.Any], _omit_nulls(arguments, root, root, 0))


def _select_branch_for(
    schema: t.Any, value: t.Any, root: dict[str, t.Any]
) -> dict[str, t.Any] | None:
    """Pick the composition branch that describes a value's shape."""
    resolved = _resolve_local_refs(schema, root)
    if not isinstance(resolved, dict):
        return None
    wanted = "items" if isinstance(value, list) else "properties"

    def find(node: t.Any, depth: int) -> dict[str, t.Any] | None:
        candidate = _resolve_local_refs(node, root)
        if not isinstance(candidate, dict) or depth > MAX_NODE_DEPTH:
            return None
        if wanted in candidate:
            return candidate
        for keyword in ("anyOf", "oneOf"):
            branches = candidate.get(keyword)
            if not isinstance(branches, list):
                continue
            for branch in branches:
                found = find(branch, depth + 1)
                if found is not None:
                    return found
        return None

    return find(resolved, 0) or resolved


def _omit_nulls(
    value: t.Any, schema: t.Any, root: dict[str, t.Any], depth: int
) -> t.Any:
    if depth > MAX_NODE_DEPTH:
        raise ValueError(
            f"Tool arguments exceed maximum nesting depth of {MAX_NODE_DEPTH}"
        )
    node = _select_branch_for(schema, value, root) or {}
    if isinstance(value, list):
        items = node.get("items") if isinstance(node.get("items"), dict) else None
        return [_omit_nulls(item, items, root, depth + 1) for item in value]
    if not isinstance(value, dict):
        return value
    declared = node.get("properties")
    properties: dict[str, t.Any] = declared if isinstance(declared, dict) else {}
    clone: dict[str, t.Any] = {}
    for key, child in value.items():
        property_schema = properties.get(key)
        if child is None:
            if property_schema is None or _schema_accepts_null(property_schema, root):
                clone[key] = child
            continue
        clone[key] = _omit_nulls(child, property_schema, root, depth + 1)
    return clone
