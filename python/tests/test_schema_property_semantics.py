"""Property-based acceptance parity for scalar JSON Schema conversion.

The oracle is the `jsonschema` Draft 7 validator: for every generated scalar
schema and instance, the converted Pydantic artifacts must agree with it.

The generator deliberately stays inside the semantics the converters claim to
support today; shrinking an exclusion is the way to turn a fixed behavior into
a permanent regression guard. The remaining exclusions are deliberate
divergences or oracle limits, not open bugs:

- ``multipleOf`` is always an integer: the converters check decimal multiples
  through decimal scaling (see the ``primitive-float-multiple-of`` corpus
  case), while the oracle uses raw float modulo
- draft-4 boolean ``exclusiveMinimum``/``exclusiveMaximum`` are never
  generated: they are not Draft 7, so the oracle cannot express them (the
  ``primitive-draft4-boolean-exclusive-bounds`` corpus case covers them)
"""

import typing as t

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from jsonschema import Draft7Validator
from pydantic import TypeAdapter, ValidationError

from composio.utils.schema_converter import json_schema_to_pydantic_type
from composio.utils.shared import pydantic_model_from_param_schema

SCALAR_TYPES = ("string", "integer", "number", "boolean", "null")

PATTERN_POOL = ("^[a-z]+$", "^[A-Z]{2}$", "[0-9]", "^a.*z$", "^(?=.*[a-y])a")

scalar_values = st.one_of(
    st.none(),
    st.booleans(),
    st.integers(min_value=-100, max_value=100),
    st.floats(
        min_value=-100,
        max_value=100,
        allow_nan=False,
        allow_infinity=False,
    ),
    st.text(
        alphabet=st.characters(min_codepoint=97, max_codepoint=122),
        max_size=6,
    ),
)


@st.composite
def scalar_schemas(draw: st.DrawFn) -> dict[str, t.Any]:
    schema: dict[str, t.Any] = {}
    declared: tuple[str, ...] = ()

    if draw(st.booleans()):
        members = draw(
            st.lists(st.sampled_from(SCALAR_TYPES), min_size=1, max_size=3, unique=True)
        )
        if len(members) == 1 and draw(st.booleans()):
            schema["type"] = members[0]
            declared = (members[0],)
        else:
            schema["type"] = members
            declared = tuple(members)

    literal_kind = draw(st.sampled_from(("none", "enum", "const", "both")))
    if literal_kind in ("enum", "both"):
        schema["enum"] = draw(
            st.lists(scalar_values, min_size=1, max_size=4, unique_by=repr)
        )
    if literal_kind in ("const", "both"):
        schema["const"] = draw(scalar_values)

    # Constraints attach independently of the declared type (or its absence):
    # Draft 7 scopes every scalar keyword to matching instance types anyway.
    del declared
    if draw(st.booleans()):
        schema["minLength"] = draw(st.integers(min_value=0, max_value=4))
    if draw(st.booleans()):
        schema["maxLength"] = draw(st.integers(min_value=0, max_value=6))
    if draw(st.booleans()):
        schema["pattern"] = draw(st.sampled_from(PATTERN_POOL))
    if draw(st.booleans()):
        schema["minimum"] = draw(st.integers(min_value=-20, max_value=20))
    if draw(st.booleans()):
        schema["maximum"] = draw(st.integers(min_value=-20, max_value=20))
    if draw(st.booleans()):
        schema["exclusiveMinimum"] = draw(st.integers(min_value=-20, max_value=20))
    if draw(st.booleans()):
        schema["exclusiveMaximum"] = draw(st.integers(min_value=-20, max_value=20))
    if draw(st.booleans()):
        schema["multipleOf"] = draw(st.integers(min_value=1, max_value=5))

    return schema


@st.composite
def schema_and_instance(draw: st.DrawFn) -> tuple[dict[str, t.Any], t.Any]:
    schema = draw(scalar_schemas())

    pools: list[st.SearchStrategy[t.Any]] = [scalar_values]
    interesting: list[t.Any] = []
    if "enum" in schema:
        interesting.extend(schema["enum"])
    if "const" in schema:
        interesting.append(schema["const"])
    for keyword in ("minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"):
        if keyword in schema:
            bound = schema[keyword]
            interesting.extend((bound, bound + 1, bound - 1))
    if interesting:
        pools.append(st.sampled_from(interesting))

    return schema, draw(st.one_of(pools))


def _oracle_accepts(object_schema: dict[str, t.Any], instance: t.Any) -> bool:
    return Draft7Validator(object_schema).is_valid(instance)


def _pydantic_accepts(annotation: t.Any, instance: t.Any) -> bool:
    try:
        TypeAdapter(annotation).validate_python(instance)
        return True
    except ValidationError:
        return False


def _wrap(schema: dict[str, t.Any]) -> dict[str, t.Any]:
    return {
        "type": "object",
        "properties": {"value": schema},
        "required": ["value"],
        "title": "PropertyCase",
    }


@pytest.mark.unit
@pytest.mark.schema
@settings(
    max_examples=200,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow],
)
@given(schema_and_instance())
def test_object_conversion_matches_draft7_oracle(
    case: tuple[dict[str, t.Any], t.Any],
) -> None:
    """`json_schema_to_pydantic_type` on an object schema must agree with Draft 7."""
    schema, value = case
    object_schema = _wrap(schema)
    instance = {"value": value}

    expected = _oracle_accepts(object_schema, instance)
    actual = _pydantic_accepts(json_schema_to_pydantic_type(object_schema), instance)

    assert actual == expected, (
        f"object path disagreed with Draft 7 oracle for schema={schema!r} "
        f"value={value!r}: oracle={expected} converted={actual}"
    )


@pytest.mark.unit
@pytest.mark.schema
@settings(
    max_examples=200,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow],
)
@given(schema_and_instance())
def test_legacy_model_matches_draft7_oracle(
    case: tuple[dict[str, t.Any], t.Any],
) -> None:
    """`pydantic_model_from_param_schema` enforces exact Draft 7 acceptance."""
    schema, value = case
    object_schema = _wrap(schema)
    instance = {"value": value}

    expected = _oracle_accepts(object_schema, instance)
    model = pydantic_model_from_param_schema(object_schema)
    try:
        model.model_validate(instance)
        actual = True
    except ValidationError:
        actual = False

    assert actual == expected, (
        f"legacy path disagreed with Draft 7 oracle for schema={schema!r} "
        f"value={value!r}: oracle={expected} converted={actual}"
    )


@pytest.mark.unit
@pytest.mark.schema
@settings(
    max_examples=200,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow],
)
@given(schema_and_instance())
def test_toplevel_conversion_never_rejects_draft7_valid_input(
    case: tuple[dict[str, t.Any], t.Any],
) -> None:
    """The top-level scalar path may coerce, but must not over-reject."""
    schema, value = case

    if not Draft7Validator(schema).is_valid(value):
        return

    annotation = json_schema_to_pydantic_type(schema)
    assert _pydantic_accepts(annotation, value), (
        f"top-level path rejected a Draft 7-valid instance for schema={schema!r} "
        f"value={value!r}"
    )
