"""Regression matrix for whole-schema JSON Schema acceptance.

These cases combine keywords that previously took different conversion paths.
Every fixture is checked against the Draft 7 oracle before the public Pydantic
entry point, so a passing test cannot merely preserve two matching mistakes.
"""

import json
import threading
import time
import typing as t
from http.server import BaseHTTPRequestHandler, HTTPServer

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


@pytest.mark.unit
@pytest.mark.schema
@pytest.mark.parametrize(
    ("schema", "value"),
    [
        ({"properties": {"x": {"type": "string"}}}, 42),
        ({"required": ["x"]}, 42),
        ({"items": {"type": "string"}}, 42),
        ({"minItems": 2}, {"not": "an array"}),
        ({"propertyNames": {"pattern": "^x"}}, 42),
        ({"dependencies": {"a": ["b"]}}, 42),
        ({"not": {"type": "string"}}, 42),
        ({"if": {"type": "string"}, "then": {"minLength": 2}}, 42),
    ],
)
def test_typeless_assertions_accept_nonmatching_instance_types(
    schema: dict[str, t.Any],
    value: t.Any,
) -> None:
    Draft7Validator.check_schema(schema)
    assert Draft7Validator(schema).is_valid(value)
    TypeAdapter(json_schema_to_pydantic_type(schema)).validate_python(value)


@pytest.mark.unit
@pytest.mark.schema
def test_direct_local_ref_accepts_a_valid_referenced_value() -> None:
    schema = {
        "$defs": {"positive": {"type": "number", "minimum": 1}},
        "$ref": "#/$defs/positive",
    }
    Draft7Validator.check_schema(schema)
    assert Draft7Validator(schema).is_valid(2)
    TypeAdapter(json_schema_to_pydantic_type(schema)).validate_python(2)


@pytest.mark.unit
@pytest.mark.schema
def test_nested_typeless_object_assertion_accepts_a_non_object_property() -> None:
    schema = {
        "title": "NestedTypelessObject",
        "type": "object",
        "properties": {
            "value": {"properties": {"x": {"type": "string"}}},
        },
        "required": ["value"],
    }
    value = {"value": 42}
    Draft7Validator.check_schema(schema)
    assert Draft7Validator(schema).is_valid(value)

    annotations = (
        json_schema_to_pydantic_type(schema),
        json_schema_to_model(schema),
        pydantic_model_from_param_schema(schema),
    )
    for annotation in annotations:
        TypeAdapter(annotation).validate_python(value)


@pytest.mark.unit
@pytest.mark.schema
@pytest.mark.parametrize("entry_point", ("pydantic_type", "model", "param_schema"))
def test_external_ref_is_refused_without_network_io(entry_point: str) -> None:
    """A remote `$ref` must never make the validator fetch over the network."""
    requests: list[str] = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 - http.server API
            requests.append(self.path)
            body = json.dumps({"type": "string"}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args: t.Any) -> None:
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        url = f"http://127.0.0.1:{server.server_address[1]}/schema"
        schema = {
            "title": "ExternalRef",
            "type": "object",
            "properties": {"value": {"$ref": url}},
            "required": ["value"],
        }
        converters: t.Dict[str, t.Callable[..., t.Any]] = {
            "pydantic_type": json_schema_to_pydantic_type,
            "model": json_schema_to_model,
            "param_schema": pydantic_model_from_param_schema,
        }
        convert = converters[entry_point]
        with pytest.raises(ValueError, match="External schema reference"):
            annotation = convert(schema)
            TypeAdapter(annotation).validate_python({"value": "x"})
    finally:
        server.shutdown()
        server.server_close()
    assert requests == []


@pytest.mark.unit
@pytest.mark.schema
def test_backtracking_pattern_rejects_in_linear_time() -> None:
    schema = {
        "type": "object",
        "properties": {"value": {"type": "string", "pattern": "(a+)+$"}},
    }
    value = {"value": "a" * 24 + "!"}
    assert not Draft7Validator(schema).is_valid(value)
    model = json_schema_to_model(schema)

    started = time.perf_counter()
    with pytest.raises(ValidationError):
        model.model_validate(value)
    assert time.perf_counter() - started < 0.2

    model.model_validate({"value": "aaa"})


@pytest.mark.unit
@pytest.mark.schema
@pytest.mark.parametrize("combiner", ("anyOf", "oneOf"))
def test_simple_union_rejects_bool_for_integer_or_null(combiner: str) -> None:
    schema = {combiner: [{"type": "integer"}, {"type": "null"}]}
    assert not Draft7Validator(schema).is_valid(True)

    adapter = TypeAdapter(json_schema_to_pydantic_type(schema))
    with pytest.raises(ValidationError):
        adapter.validate_python(True)
    assert adapter.validate_python(1) == 1
    assert adapter.validate_python(None) is None


@pytest.mark.unit
@pytest.mark.schema
@pytest.mark.parametrize("combiner", ("anyOf", "oneOf"))
def test_toplevel_combiner_model_keeps_sibling_assertions(combiner: str) -> None:
    schema = {
        combiner: [{"type": "object", "properties": {"a": {"type": "string"}}}],
        "required": ["a"],
    }
    assert not Draft7Validator(schema).is_valid({})

    adapter = TypeAdapter(json_schema_to_pydantic_type(schema))
    with pytest.raises(ValidationError):
        adapter.validate_python({})
    assert adapter.dump_python(adapter.validate_python({"a": "x"}), mode="json") == {
        "a": "x"
    }


@pytest.mark.unit
@pytest.mark.schema
def test_property_less_param_schema_keeps_assertions() -> None:
    schema = {"title": "NonEmpty", "type": "object", "minProperties": 1}
    assert not Draft7Validator(schema).is_valid({})

    adapter = TypeAdapter(pydantic_model_from_param_schema(schema))
    with pytest.raises(ValidationError):
        adapter.validate_python({})
    assert adapter.validate_python({"k": 1}) == {"k": 1}


@pytest.mark.unit
@pytest.mark.schema
def test_exact_validated_array_items_keep_materialized_defaults() -> None:
    schema = {
        "type": "object",
        "title": "DynamicArrayArguments",
        "patternProperties": {
            "^items_": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "null_default": {
                            "anyOf": [{"type": "string"}, {"type": "null"}],
                            "default": None,
                        }
                    },
                },
            }
        },
        "additionalProperties": False,
    }
    adapter = TypeAdapter(json_schema_to_pydantic_type(schema))
    assert adapter.dump_python(
        adapter.validate_python({"items_a": [{}]}), mode="json"
    ) == {"items_a": [{"null_default": None}]}


@pytest.mark.unit
@pytest.mark.schema
def test_property_less_param_schema_admits_non_objects() -> None:
    schema = {"title": "Either", "anyOf": [{"type": "string"}, {"type": "object"}]}
    assert Draft7Validator(schema).is_valid("x")

    adapter = TypeAdapter(pydantic_model_from_param_schema(schema))
    assert adapter.validate_python("x") == "x"
    assert adapter.validate_python({"k": 1}) == {"k": 1}
    with pytest.raises(ValidationError):
        adapter.validate_python(1)
