"""Regression matrix for whole-schema JSON Schema acceptance.

These cases combine keywords that previously took different conversion paths.
Every fixture is checked against the Draft 7 oracle before the public Pydantic
entry point, so a passing test cannot merely preserve two matching mistakes.
"""

import typing as t

import pytest
from jsonschema import Draft7Validator
from pydantic import TypeAdapter, ValidationError

from composio.utils.schema_converter import json_schema_to_pydantic_type
from composio.utils.shared import (
    json_schema_to_model,
    pydantic_model_from_param_schema,
)

REJECTION_CASES: tuple[tuple[str, dict[str, t.Any], t.Any], ...] = (
    (
        "typeless scalar dispatch must not discard object assertions",
        {"minLength": 2, "required": ["x"]},
        {},
    ),
    (
        "anyOf must compose with adjacent assertions",
        {
            "type": "string",
            "minLength": 2,
            "anyOf": [{"const": "a"}, {"const": "abc"}],
        },
        "a",
    ),
    (
        "allOf must compose with adjacent assertions",
        {"type": "string", "maxLength": 1, "allOf": [{"pattern": "^ab"}]},
        "ab",
    ),
    (
        "oneOf must compose with adjacent assertions",
        {
            "type": "number",
            "minimum": 10,
            "oneOf": [{"maximum": 5}, {"minimum": 0}],
        },
        7,
    ),
    (
        "not must compose with adjacent assertions",
        {"type": "string", "minLength": 2, "not": {"const": "x"}},
        "a",
    ),
    (
        "if and then are a complete conditional without else",
        {"if": {"type": "string"}, "then": {"minLength": 2}},
        "a",
    ),
    (
        "conditionals must compose with adjacent primitive assertions",
        {
            "type": "number",
            "if": {"minimum": 0},
            "then": {"maximum": 10},
            "else": {"minimum": -10},
        },
        20,
    ),
    (
        "contains must be enforced for typed arrays",
        {"type": "array", "contains": {"const": 1}},
        [2],
    ),
    (
        "uniqueItems must be enforced for typed arrays",
        {"type": "array", "uniqueItems": True},
        [1, 1],
    ),
    (
        "minItems must be enforced for typed arrays",
        {"type": "array", "minItems": 2},
        [1],
    ),
    (
        "maxItems must be enforced for typed arrays",
        {"type": "array", "maxItems": 1},
        [1, 2],
    ),
    (
        "propertyNames must be enforced for typed objects",
        {"type": "object", "propertyNames": {"pattern": "^x"}},
        {"bad": 1},
    ),
    (
        "required must be enforced for property-less typed objects",
        {"type": "object", "required": ["x"]},
        {},
    ),
    (
        "local references must constrain direct converter callers",
        {
            "$defs": {"positive": {"type": "number", "minimum": 1}},
            "$ref": "#/$defs/positive",
        },
        0,
    ),
)


@pytest.mark.unit
@pytest.mark.schema
@pytest.mark.parametrize(
    ("name", "schema", "value"),
    REJECTION_CASES,
    ids=[case[0] for case in REJECTION_CASES],
)
def test_whole_schema_rejections_match_draft7(
    name: str,
    schema: dict[str, t.Any],
    value: t.Any,
) -> None:
    del name
    Draft7Validator.check_schema(schema)
    assert not Draft7Validator(schema).is_valid(value)

    adapter = TypeAdapter(json_schema_to_pydantic_type(schema))
    with pytest.raises(ValidationError):
        adapter.validate_python(value)


@pytest.mark.unit
@pytest.mark.schema
@pytest.mark.parametrize("literal_keyword", ["const", "enum"])
def test_typed_object_compound_literals_do_not_fall_back_to_string(
    literal_keyword: str,
) -> None:
    literal = {} if literal_keyword == "const" else [{}]
    schema = {
        "type": "object",
        "properties": {"x": {"type": "string", "default": "generated"}},
        literal_keyword: literal,
    }
    Draft7Validator.check_schema(schema)

    adapter = TypeAdapter(json_schema_to_pydantic_type(schema))
    result = adapter.validate_python({})
    assert adapter.dump_python(result, mode="json") == {}


@pytest.mark.unit
@pytest.mark.schema
@pytest.mark.parametrize(
    ("schema", "value"),
    [
        (
            {
                "type": "array",
                "minimum": 0,
                "exclusiveMinimum": True,
                "contains": {"const": 1},
            },
            [2],
        ),
        (
            {
                "type": "object",
                "minimum": 0,
                "exclusiveMinimum": True,
                "propertyNames": {"pattern": "^x"},
            },
            {"bad": 1},
        ),
    ],
    ids=["contains", "property-names"],
)
def test_draft4_bounds_do_not_disable_draft7_siblings(
    schema: dict[str, t.Any],
    value: t.Any,
) -> None:
    adapter = TypeAdapter(json_schema_to_pydantic_type(schema))
    with pytest.raises(ValidationError):
        adapter.validate_python(value)


@pytest.mark.unit
@pytest.mark.schema
def test_scalar_allof_acceptance_survives_pydantic_materialization() -> None:
    schema = {
        "title": "ScalarAllOf",
        "type": "object",
        "properties": {
            "value": {
                "allOf": [
                    {"type": "string", "minLength": 2},
                    {"type": "string", "pattern": "^[A-Z]+$"},
                ]
            }
        },
        "required": ["value"],
    }
    Draft7Validator.check_schema(schema)
    assert Draft7Validator(schema).is_valid({"value": "OK"})

    annotations = (
        json_schema_to_pydantic_type(schema),
        json_schema_to_model(schema),
        pydantic_model_from_param_schema(schema),
    )
    for annotation in annotations:
        TypeAdapter(annotation).validate_python({"value": "OK"})
