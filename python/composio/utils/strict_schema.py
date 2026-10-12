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
# Bounds on one null-acceptance check; past either, null is not proven accepted.
MAX_NULL_CHECK_DEPTH = 64
MAX_NULL_CHECK_NODES = 2_000

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


# The only keywords that can reject a ``null`` instance; every other keyword
# constrains strings, numbers, arrays or objects and ignores ``null``.
NULL_CONSTRAINT_KEYWORDS = (
    "type",
    "enum",
    "const",
    "$ref",
    "anyOf",
    "oneOf",
    "allOf",
    "not",
    "if",
    "then",
    "else",
)


def _widen_to_nullable(
    node: dict[str, t.Any], null_check: _NullCheck
) -> dict[str, t.Any]:
    """Accept ``null`` while keeping every other constraint the node declares.

    A node whose only obstacle is ``type`` or ``anyOf`` is widened in place.
    Anything else is wrapped whole, because JSON Schema keywords apply
    together: adding ``null`` to ``type`` does not lift a sibling ``enum``.
    ``null_check`` must answer for the strict output.
    """
    if null_check.accepts(node):
        return node
    constraints = [key for key in NULL_CONSTRAINT_KEYWORDS if key in node]
    if constraints == ["type"]:
        node_type = node["type"]
        members = node_type if isinstance(node_type, list) else [node_type]
        return {**node, "type": [*members, "null"]}
    if constraints == ["anyOf"]:
        return {**node, "anyOf": [*node["anyOf"], {"type": "null"}]}
    annotations: dict[str, t.Any] = {
        k: node[k] for k in ("description", "title") if k in node
    }
    rest = {k: v for k, v in node.items() if k not in annotations}
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


# Markers for what an answer leans on, besides the depth of a node on the path.
_NOTHING = MAX_NULL_CHECK_DEPTH + 1
_A_BOUND = -1


class _NullCheck:
    """Decides whether schemas of one document accept ``null`` as an instance.

    Every keyword in :data:`NULL_CONSTRAINT_KEYWORDS` that is present must
    accept it. This is the single definition of null acceptance: the strict
    rewrite and :func:`omit_null_tool_arguments` both decide with it.

    ``strict_output`` answers for the schema :func:`to_strict_json_schema`
    emits instead of the one it was given: the rewrite types every node that
    declares ``properties`` as an object, so such a node stops accepting null.

    One instance serves every check against a document, and an answer is
    computed once per node. A reference cycle never yields a null by itself,
    so a node met again while it is being evaluated counts as rejecting. An
    answer that leans on that is provisional until the node it leans on is
    done: it is kept if that node does reject null and discarded otherwise.

    Each check is bounded in depth and in nodes visited. A check that meets a
    bound proves nothing, so it rejects null whatever its other branches say,
    which costs at most a redundant null branch or a dropped null. The nodes
    it went through stay marked as unproven, so a later check that reaches
    one of them neither repeats the work nor trusts the answer.
    """

    def __init__(self, root: dict[str, t.Any], strict_output: bool = False) -> None:
        self.root = root
        self.strict_output = strict_output
        # id(node) -> (node, answer, what it leans on). Holding the node keeps
        # its id from being reused while the answer is remembered.
        self.answers: dict[int, tuple[dict[str, t.Any], bool, int]] = {}
        # Nodes whose answer is provisional, oldest first.
        self.provisional: list[int] = []
        # Nodes being evaluated, mapped to their depth on the current path.
        self.path: dict[int, int] = {}
        # Depths of the path nodes that were met again below themselves.
        self.met_again: set[int] = set()
        self.budget = 0
        # Shallowest thing the answers used since the last reset lean on.
        self.leans_on = _NOTHING

    def accepts(self, schema: t.Any) -> bool:
        if isinstance(schema, bool):
            return schema
        if not isinstance(schema, dict):
            return True
        key = id(schema)
        remembered = self.answers.get(key)
        if remembered is not None:
            if not self.path:
                return remembered[1] and remembered[2] != _A_BOUND
            self.leans_on = min(self.leans_on, remembered[2])
            return remembered[1]
        if key in self.path:
            self.met_again.add(self.path[key])
            self.leans_on = min(self.leans_on, self.path[key])
            return False
        depth = len(self.path)
        if depth == 0:
            self.budget = MAX_NULL_CHECK_NODES
        if depth >= MAX_NULL_CHECK_DEPTH or self.budget <= 0:
            self.leans_on = _A_BOUND
            return False
        self.budget -= 1

        outer, self.leans_on = self.leans_on, _NOTHING
        mark = len(self.provisional)
        self.path[key] = depth
        result = self._keywords_accept(schema)
        del self.path[key]

        leans_on = self.leans_on
        settled = leans_on >= depth
        below = self.provisional[mark:]
        del self.provisional[mark:]
        if result and depth in self.met_again:
            # The answers below took this node for rejecting null.
            for other in below:
                del self.answers[other]
        else:
            for other in below:
                node, answer, inner = self.answers[other]
                if settled:
                    inner = _NOTHING
                else:
                    inner = inner if inner < depth else leans_on
                    self.provisional.append(other)
                self.answers[other] = (node, answer, inner)
        self.met_again.discard(depth)

        if depth == 0 and leans_on == _A_BOUND:
            result = False
        self.answers[key] = (schema, result, _NOTHING if settled else leans_on)
        if not settled:
            self.provisional.append(key)
        self.leans_on = outer if settled else min(outer, leans_on)
        if depth == 0:
            # Whatever is still provisional leans on a bound, and stays so.
            self.provisional.clear()
            self.leans_on = _NOTHING
        return result

    def _keywords_accept(self, node: dict[str, t.Any]) -> bool:
        accepts = self.accepts
        node_type = node.get("type")
        if isinstance(node_type, str) and node_type != "null":
            return False
        if isinstance(node_type, list) and "null" not in node_type:
            return False
        if (
            self.strict_output
            and "type" not in node
            and isinstance(node.get("properties"), dict)
        ):
            return False
        if isinstance(node.get("enum"), list) and None not in node["enum"]:
            return False
        if "const" in node and node["const"] is not None:
            return False
        if "$ref" in node:
            ref = node["$ref"]
            resolution = (
                _try_resolve_pointer(self.root, ref) if isinstance(ref, str) else None
            )
            if resolution is None or not resolution.ok:
                return False
            if not accepts(resolution.value):
                return False
        any_of, one_of, all_of = node.get("anyOf"), node.get("oneOf"), node.get("allOf")
        if isinstance(any_of, list) and not any(accepts(b) for b in any_of):
            return False
        if isinstance(one_of, list):
            matches = sum(accepts(b) for b in one_of)
            # The strict rewrite turns oneOf into anyOf.
            if matches == 0 or (matches > 1 and not self.strict_output):
                return False
        if isinstance(all_of, list) and not all(accepts(b) for b in all_of):
            return False
        if "not" in node and accepts(node["not"]):
            return False
        if "if" in node:
            branch = "then" if accepts(node["if"]) else "else"
            if branch in node and not accepts(node[branch]):
                return False
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
        self.null_check = _NullCheck(root, strict_output=True)
        # Resolved references, re-checked against the rewritten schema.
        self.references: list[tuple[str, str]] = []

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
            else:
                self.references.append((path, ref))
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
            properties[name] = _widen_to_nullable(property_schema, self.null_check)
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
    if isinstance(normalized, dict):
        # Wrapping a property in a null branch moves everything nested in it.
        for path, ref in walker.references:
            if not _try_resolve_pointer(normalized, ref).ok:
                walker.reject(path, "$ref", f'$ref "{ref}" target moved by the rewrite')
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
    return t.cast(
        dict[str, t.Any], _omit_nulls(arguments, root, root, 0, _NullCheck(root))
    )


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
    value: t.Any,
    schema: t.Any,
    root: dict[str, t.Any],
    depth: int,
    null_check: _NullCheck,
) -> t.Any:
    if depth > MAX_NODE_DEPTH:
        raise ValueError(
            f"Tool arguments exceed maximum nesting depth of {MAX_NODE_DEPTH}"
        )
    node = _select_branch_for(schema, value, root) or {}
    if isinstance(value, list):
        items = node.get("items") if isinstance(node.get("items"), dict) else None
        return [_omit_nulls(item, items, root, depth + 1, null_check) for item in value]
    if not isinstance(value, dict):
        return value
    declared = node.get("properties")
    properties: dict[str, t.Any] = declared if isinstance(declared, dict) else {}
    clone: dict[str, t.Any] = {}
    for key, child in value.items():
        property_schema = properties.get(key)
        if child is None:
            if property_schema is None or null_check.accepts(property_schema):
                clone[key] = child
            continue
        clone[key] = _omit_nulls(child, property_schema, root, depth + 1, null_check)
    return clone
