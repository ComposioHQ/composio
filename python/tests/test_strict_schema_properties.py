"""Property-based null semantics for strict mode.

The oracle is the `jsonschema` Draft 2020-12 validator. Strict mode makes every
optional parameter required and uses ``null`` to mean "omitted", so for every
generated optional property:

- the strict schema accepts ``null``
- the arguments left after :func:`omit_null_tool_arguments` validate against
  the tool's own schema, and a ``null`` that schema accepts is kept
- the strict schema accepts every non-null value the tool's schema accepts,
  and nothing more unless a ``oneOf`` was converted to ``anyOf``
- the rewrite is idempotent

The TypeScript counterpart is
``ts/packages/core/test/utils/jsonSchema.strict.property.test.ts``; keep the
generators and invariants aligned.

Those generators never produce reference cycles: a cycle that consumes no input
makes the oracle recurse forever. Cycles are checked separately against the
least fixed point of the definitions, computed by plain iteration: a null is
accepted only when a finite chain of branches proves it.
"""

import copy
import typing as t

from hypothesis import assume, given, settings
from hypothesis import strategies as st
from jsonschema import Draft202012Validator

from composio.utils.strict_schema import omit_null_tool_arguments, to_strict_json_schema

TYPES = ("string", "integer", "boolean", "null")
LITERALS: tuple[t.Any, ...] = ("asc", "desc", 1, True, None)
SAMPLES: tuple[t.Any, ...] = ("asc", "desc", "other", 1, 2, True, False)
DEFINITIONS: dict[str, t.Any] = {
    "Direction": {"type": "string", "enum": ["asc", "desc"]},
    "NullableDirection": {"enum": ["asc", None]},
    "Text": {"type": "string"},
    "NullableText": {"type": ["string", "null"]},
    "Config": {"properties": {"url": {"type": "string"}}},
}
# The rewrite types this definition as an object, so the strict schema rejects
# the non-object values the tool's schema lets through.
TYPELESS_OBJECT_REF = "#/$defs/Config"
# Compositions strict mode supports, and the ones only the tool's schema uses.
STRICT_COMPOSITIONS = ("anyOf", "oneOf")
ALL_COMPOSITIONS = (*STRICT_COMPOSITIONS, "allOf", "not", "if")


@st.composite
def property_schemas(
    draw: st.DrawFn, compositions: tuple[str, ...], depth: int = 0
) -> dict[str, t.Any]:
    schema: dict[str, t.Any] = {}
    type_kind = draw(st.sampled_from(("none", "single", "list")))
    if type_kind == "single":
        schema["type"] = draw(st.sampled_from(TYPES))
    elif type_kind == "list":
        schema["type"] = draw(
            st.lists(st.sampled_from(TYPES), min_size=1, max_size=3, unique=True)
        )
    literal_kind = draw(st.sampled_from(("none", "none", "enum", "const")))
    if literal_kind == "enum":
        schema["enum"] = draw(
            st.lists(st.sampled_from(LITERALS), min_size=1, max_size=3, unique_by=repr)
        )
    elif literal_kind == "const":
        schema["const"] = draw(st.sampled_from(LITERALS))
    if draw(st.integers(0, 3)) == 0:
        schema["$ref"] = "#/$defs/" + draw(st.sampled_from(sorted(DEFINITIONS)))
    if draw(st.booleans()):
        schema["description"] = "a parameter"

    if depth >= 2:
        return schema
    nested = property_schemas(compositions, depth + 1)
    keyword = draw(st.sampled_from((None, None, *compositions)))
    if keyword in ("anyOf", "oneOf", "allOf"):
        schema[keyword] = draw(st.lists(nested, min_size=1, max_size=3))
    elif keyword == "not":
        schema["not"] = draw(nested)
    elif keyword == "if":
        schema["if"] = draw(nested)
        for branch in ("then", "else"):
            if draw(st.booleans()):
                schema[branch] = draw(nested)
    return schema


def tool_schema(property_schema: dict[str, t.Any]) -> dict[str, t.Any]:
    return {
        "type": "object",
        "properties": {"value": property_schema},
        "$defs": copy.deepcopy(DEFINITIONS),
    }


def mentions(node: t.Any, keyword: str, value: t.Any = None) -> bool:
    """Whether any node carries ``keyword`` (with ``value``, when given)."""
    if isinstance(node, list):
        return any(mentions(item, keyword, value) for item in node)
    if not isinstance(node, dict):
        return False
    if keyword in node and (value is None or node[keyword] == value):
        return True
    return any(mentions(child, keyword, value) for child in node.values())


@settings(max_examples=500, deadline=None)
@given(property_schemas(STRICT_COMPOSITIONS))
def test_null_stands_for_omission_without_changing_other_values(
    property_schema: dict[str, t.Any],
) -> None:
    source = tool_schema(property_schema)
    snapshot = copy.deepcopy(source)
    result = to_strict_json_schema(source)
    assert source == snapshot
    assume(not result.unsupported)

    original = Draft202012Validator(source)
    strict = Draft202012Validator(result.schema)

    assert strict.is_valid({"value": None})
    sent = omit_null_tool_arguments({"value": None}, result.source)
    assert original.is_valid(sent)
    assert sent == ({"value": None} if original.is_valid({"value": None}) else {})

    if not mentions(property_schema, "$ref", TYPELESS_OBJECT_REF):
        for sample in SAMPLES:
            arguments = {"value": sample}
            if original.is_valid(arguments):
                assert strict.is_valid(arguments)
            elif not mentions(property_schema, "oneOf"):
                assert not strict.is_valid(arguments)

    again = to_strict_json_schema(result.schema)
    assert again.schema == result.schema
    assert again.changes == []


@settings(max_examples=500, deadline=None)
@given(property_schemas(ALL_COMPOSITIONS))
def test_null_is_kept_exactly_when_the_tool_schema_accepts_it(
    property_schema: dict[str, t.Any],
) -> None:
    source = tool_schema(property_schema)
    accepted = Draft202012Validator(source).is_valid({"value": None})
    expected = {"value": None} if accepted else {}
    assert omit_null_tool_arguments({"value": None}, source) == expected


LEAVES: tuple[dict[str, t.Any], ...] = ({"type": "null"}, {"type": "string"}, {})


@st.composite
def reference_graphs(draw: st.DrawFn) -> dict[str, dict[str, t.Any]]:
    """Definitions that reference each other freely, cycles included."""
    names = [f"d{index}" for index in range(draw(st.integers(1, 7)))]
    references = st.lists(
        st.sampled_from(names).map(lambda name: {"$ref": f"#/$defs/{name}"}),
        min_size=1,
        max_size=3,
    )
    definitions: dict[str, dict[str, t.Any]] = {}
    for name in names:
        kind = draw(st.sampled_from(("leaf", "anyOf", "anyOf", "allOf", "allOf")))
        if kind == "leaf":
            definitions[name] = dict(draw(st.sampled_from(LEAVES)))
        else:
            branches: list[dict[str, t.Any]] = draw(references)
            if draw(st.booleans()):
                branches.append(dict(draw(st.sampled_from(LEAVES))))
            definitions[name] = {kind: branches}
    return definitions


def least_fixed_point(definitions: dict[str, dict[str, t.Any]]) -> dict[str, bool]:
    accepted = dict.fromkeys(definitions, False)

    def holds(node: dict[str, t.Any]) -> bool:
        if "$ref" in node:
            return accepted[node["$ref"].rsplit("/", 1)[1]]
        if "anyOf" in node:
            return any(holds(branch) for branch in node["anyOf"])
        if "allOf" in node:
            return all(holds(branch) for branch in node["allOf"])
        return node.get("type") != "string"

    changed = True
    while changed:
        changed = False
        for name, definition in definitions.items():
            if not accepted[name] and holds(definition):
                accepted[name] = changed = True
    return accepted


@settings(max_examples=500, deadline=None)
@given(reference_graphs())
def test_cyclic_references_resolve_to_the_least_fixed_point(
    definitions: dict[str, dict[str, t.Any]],
) -> None:
    source = {
        "type": "object",
        "properties": {name: {"$ref": f"#/$defs/{name}"} for name in definitions},
        "$defs": definitions,
    }
    expected = least_fixed_point(definitions)
    arguments = dict.fromkeys(definitions)
    kept = omit_null_tool_arguments(arguments, source)
    assert kept == {name: None for name in definitions if expected[name]}

    # `allOf` makes the tool unsupported, but its properties are still widened.
    result = to_strict_json_schema(source)
    for name in definitions:
        reference = {"$ref": f"#/$defs/{name}"}
        widened = result.schema["properties"][name]
        if expected[name]:
            assert widened == reference
        else:
            assert widened == {"anyOf": [reference, {"type": "null"}]}
