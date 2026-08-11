"""Tests for the schema_converter boolean-schema pre-filter."""

import pytest
from jsonschema import Draft7Validator
from jsonschema.exceptions import SchemaError
from pydantic import TypeAdapter, ValidationError

from composio.utils.schema_converter import (
    _filter_boolean_schemas,
    json_schema_to_pydantic_type,
)
from composio.utils.shared import json_schema_to_model
from tests.fixtures.json_schema_conversion_corpus import load_object_cases


def test_true_becomes_empty_schema():
    assert _filter_boolean_schemas(True) == {}


def test_false_becomes_none():
    assert _filter_boolean_schemas(False) is None


def test_non_schema_value_passes_through():
    assert _filter_boolean_schemas("passthrough") == "passthrough"


def test_list_drops_false_and_keeps_rest():
    assert _filter_boolean_schemas([True, False, {"type": "string"}]) == [
        {},
        {"type": "string"},
    ]


def test_list_of_all_false_becomes_none():
    assert _filter_boolean_schemas([False, False]) is None


def test_combiner_drops_false_entries():
    schema = {"anyOf": [{"type": "string"}, False]}
    assert _filter_boolean_schemas(schema) == {"anyOf": [{"type": "string"}]}


def test_combiner_with_all_false_entries_rejects_every_value():
    schema = {"type": "object", "anyOf": [False, False]}
    adapter = TypeAdapter(json_schema_to_pydantic_type(schema))
    for value in (None, "some string", 123, {}, []):
        with pytest.raises(ValidationError):
            adapter.validate_python(value)


def test_false_property_is_preserved_as_rejecting():
    schema = {"properties": {"a": False, "b": {"type": "string"}}}
    filtered = _filter_boolean_schemas(schema)
    assert "a" in filtered["properties"]
    assert filtered["properties"]["b"] == {"type": "string"}


def test_plain_keys_are_preserved():
    schema = {"type": "string", "title": "X"}
    assert _filter_boolean_schemas(schema) == {"type": "string", "title": "X"}


@pytest.mark.schema
def test_schema_converter_allof_with_false_member_rejects():
    """allOf: [false, X] must reject every value (false AND X == false)."""
    schema_with_false = {
        "allOf": [
            False,
            {"type": "object", "properties": {"a": {"type": "string"}}},
        ]
    }

    pytype = json_schema_to_pydantic_type(schema_with_false)
    adapter = TypeAdapter(pytype)
    assert adapter.json_schema() == {"not": {}}
    with pytest.raises(ValidationError):
        adapter.validate_python({"a": "hello"})


@pytest.mark.schema
def test_schema_converter_allof_with_false_member_rejects_non_dict_values_too():
    """The unsatisfiable-schema fallback must not just reject dicts by
    coincidence (str previously accepted any string). It should match the
    bare-`false`-schema convention used elsewhere in this module."""
    schema = {"allOf": [False, {"type": "string"}]}
    pytype = json_schema_to_pydantic_type(schema)
    adapter = TypeAdapter(pytype)
    for value in (None, "some string", 123, {"a": "hello"}):
        with pytest.raises(ValidationError):
            adapter.validate_python(value)


@pytest.mark.schema
def test_schema_converter_allof_without_false_member_still_validates():
    """Control: the same allOf schema minus the `false` member must still work."""
    schema_without_false = {
        "allOf": [
            {"type": "object", "properties": {"a": {"type": "string"}}},
        ]
    }

    pytype = json_schema_to_pydantic_type(schema_without_false)
    adapter = TypeAdapter(pytype)
    result = adapter.validate_python({"a": "hello"})
    assert result.a == "hello"


@pytest.mark.schema
def test_schema_converter_nested_unsatisfiable_allof_rejects():
    schema = {"allOf": [{"allOf": [False, {"type": "string"}]}]}
    adapter = TypeAdapter(json_schema_to_pydantic_type(schema))

    for value in (None, "some string", 123, {}, []):
        with pytest.raises(ValidationError):
            adapter.validate_python(value)


@pytest.mark.schema
def test_schema_converter_unsatisfiable_array_items_allow_only_empty_arrays():
    schema = {
        "type": "array",
        "items": {"allOf": [False, {"type": "string"}]},
    }
    adapter = TypeAdapter(json_schema_to_pydantic_type(schema))

    assert adapter.validate_python([]) == []
    with pytest.raises(ValidationError):
        adapter.validate_python(["some string"])


@pytest.mark.schema
def test_schema_converter_unsatisfiable_property_stays_rejecting():
    schema = {
        "type": "object",
        "properties": {
            "allowed": {"type": "string"},
            "impossible": {"allOf": [False, {"type": "string"}]},
        },
        "required": ["allowed"],
    }
    adapter = TypeAdapter(json_schema_to_pydantic_type(schema))

    result = adapter.validate_python({"allowed": "yes"})
    assert result.allowed == "yes"
    for impossible_value in (None, "some string", 123):
        with pytest.raises(ValidationError):
            adapter.validate_python({"allowed": "yes", "impossible": impossible_value})


@pytest.mark.schema
def test_schema_converter_unsatisfiable_definition_keeps_ref_rejecting():
    schema = {
        "$defs": {"Impossible": {"allOf": [False, {"type": "string"}]}},
        "$ref": "#/$defs/Impossible",
    }
    adapter = TypeAdapter(json_schema_to_pydantic_type(schema))

    for value in (None, "some string", 123, {}, []):
        with pytest.raises(ValidationError):
            adapter.validate_python(value)


@pytest.mark.schema
def test_schema_converter_unsatisfiable_property_works_in_shared_model():
    schema = {
        "type": "object",
        "title": "ToolArguments",
        "properties": {
            "required_value": {"type": "string"},
            "impossible": {"allOf": [False, {"type": "string"}]},
        },
        "required": ["required_value"],
    }
    model = json_schema_to_model(schema)

    assert model(required_value="yes").required_value == "yes"
    for impossible_value in (None, "some string", 123):
        with pytest.raises(ValidationError):
            model(required_value="yes", impossible=impossible_value)


@pytest.mark.schema
def test_schema_converter_required_unsatisfiable_property_has_no_valid_value():
    schema = {
        "type": "object",
        "title": "RequiredImpossibleArgument",
        "properties": {
            "impossible": {"allOf": [False, {"type": "string"}]},
        },
        "required": ["impossible"],
    }
    model = json_schema_to_model(schema)

    with pytest.raises(ValidationError):
        model()
    for impossible_value in (None, "some string", 123):
        with pytest.raises(ValidationError):
            model(impossible=impossible_value)


@pytest.mark.parametrize(
    "converter",
    [json_schema_to_model, json_schema_to_pydantic_type],
    ids=["model", "pydantic-type"],
)
def test_unsatisfiable_declared_property_keeps_root_dynamic_policy(converter):
    schema = {
        "type": "object",
        "properties": {"impossible": {"allOf": [False, {"type": "string"}]}},
        "patternProperties": {"^count_": {"type": "integer"}},
    }
    adapter = TypeAdapter(converter(schema))

    result = adapter.validate_python({"count_a": 1})
    assert adapter.dump_python(
        result,
        mode="json",
        by_alias=True,
        exclude_none=True,
    ) == {"count_a": 1}
    with pytest.raises(ValidationError):
        adapter.validate_python({"count_a": "1"})
    with pytest.raises(ValidationError):
        adapter.validate_python({"impossible": None})


def test_dynamic_default_materialization_preserves_plain_python_values():
    model = json_schema_to_model(
        {
            "type": "object",
            "patternProperties": {
                "^item_": {
                    "type": "object",
                    "properties": {
                        "implicit": {
                            "anyOf": [{"type": "string"}, {"type": "null"}],
                        },
                        "defaulted": {"type": "integer", "default": 1},
                    },
                },
            },
            "additionalProperties": False,
        }
    )

    result = model.model_validate({"item_a": {}})

    assert result.model_extra == {"item_a": {"defaulted": 1}}
    assert isinstance(result.model_extra["item_a"], dict)
    assert getattr(result, "item_a") == {"defaulted": 1}


@pytest.mark.parametrize(
    "invalid_object_schema,error_type,error_match",
    [
        (
            {
                "type": "object",
                "patternProperties": {
                    "^value_": {"$ref": "https://example.com/schema.json"}
                },
            },
            ValueError,
            "must be a local JSON Pointer",
        ),
        (
            {
                "type": "object",
                "patternProperties": {"^value_": {"$ref": "#/$defs/missing"}},
            },
            ValueError,
            "Unresolvable dynamic-key schema reference",
        ),
        (
            {
                "type": "object",
                "patternProperties": {"^value_": {"$ref": "#anchor"}},
            },
            ValueError,
            "must be a local JSON Pointer",
        ),
        (
            {
                "type": "object",
                "patternProperties": {"[": {"type": "string"}},
            },
            ValueError,
            "Invalid patternProperties regular expression",
        ),
        (
            {
                "type": "object",
                "patternProperties": {"^value_": {"type": "not-a-json-schema-type"}},
            },
            SchemaError,
            "not valid under any of the given schemas",
        ),
        (
            {
                "type": "object",
                "additionalProperties": {"$ref": "https://example.com/schema.json"},
            },
            ValueError,
            "must be a local JSON Pointer",
        ),
        (
            {
                "type": "object",
                "additionalProperties": {"$ref": "#/$defs/missing"},
            },
            ValueError,
            "Unresolvable dynamic-key schema reference",
        ),
        (
            {
                "type": "object",
                "additionalProperties": {"$ref": "#anchor"},
            },
            ValueError,
            "must be a local JSON Pointer",
        ),
        (
            {
                "type": "object",
                "additionalProperties": {"type": "not-a-json-schema-type"},
            },
            SchemaError,
            "not valid under any of the given schemas",
        ),
    ],
    ids=[
        "pattern-external-ref",
        "pattern-missing-local-ref",
        "pattern-anchored-ref",
        "invalid-pattern",
        "pattern-invalid-draft7",
        "additional-external-ref",
        "additional-missing-local-ref",
        "additional-anchored-ref",
        "additional-invalid-draft7",
    ],
)
@pytest.mark.parametrize(
    "converter",
    [json_schema_to_model, json_schema_to_pydantic_type],
    ids=["model", "pydantic-type"],
)
@pytest.mark.parametrize("nested", [False, True], ids=["root", "nested"])
def test_invalid_dynamic_object_schema_fails_closed_across_public_entry_points(
    invalid_object_schema,
    error_type,
    error_match,
    converter,
    nested,
):
    schema = invalid_object_schema
    if nested:
        schema = {
            "type": "object",
            "properties": {"payload": invalid_object_schema},
            "required": ["payload"],
        }

    with pytest.raises(error_type, match=error_match):
        converter(schema)


_INVALID_DYNAMIC_POLICY = {
    "type": "object",
    "patternProperties": {"[": {"type": "string"}},
}


@pytest.mark.parametrize(
    "schema",
    [
        {"type": "object", "properties": {"payload": _INVALID_DYNAMIC_POLICY}},
        {"type": "array", "items": _INVALID_DYNAMIC_POLICY},
        {"type": "array", "items": [{}, _INVALID_DYNAMIC_POLICY]},
        {"allOf": [_INVALID_DYNAMIC_POLICY]},
        {"anyOf": [_INVALID_DYNAMIC_POLICY]},
        {"oneOf": [_INVALID_DYNAMIC_POLICY]},
        {"not": _INVALID_DYNAMIC_POLICY},
        {"if": _INVALID_DYNAMIC_POLICY},
        {"then": _INVALID_DYNAMIC_POLICY},
        {"else": _INVALID_DYNAMIC_POLICY},
        {"type": "array", "contains": _INVALID_DYNAMIC_POLICY},
        {"type": "object", "propertyNames": _INVALID_DYNAMIC_POLICY},
        {
            "type": "array",
            "items": [{}],
            "additionalItems": _INVALID_DYNAMIC_POLICY,
        },
        {
            "type": "object",
            "dependencies": {"flag": _INVALID_DYNAMIC_POLICY},
        },
        {
            "$defs": {"Invalid": _INVALID_DYNAMIC_POLICY},
            "$ref": "#/$defs/Invalid",
        },
        {
            "definitions": {"Invalid": _INVALID_DYNAMIC_POLICY},
            "$ref": "#/definitions/Invalid",
        },
    ],
    ids=[
        "property",
        "array-items",
        "tuple-items",
        "all-of",
        "any-of",
        "one-of",
        "not",
        "if",
        "then",
        "else",
        "contains",
        "property-names",
        "additional-items",
        "dependency-schema",
        "defs-reference",
        "legacy-definitions-reference",
    ],
)
def test_invalid_dynamic_policy_is_found_in_reachable_draft7_schema_positions(schema):
    with pytest.raises(ValueError, match="Invalid patternProperties"):
        json_schema_to_pydantic_type(schema)


def _recursive_dynamic_schema(dynamic_keyword, nested):
    recursive_ref = "#/$defs/Recursive" if nested else "#"

    def make_recursive_object():
        dynamic_schema = {
            "allOf": [{"$ref": recursive_ref}],
            "default": {},
        }
        recursive_object = {"type": "object"}
        if dynamic_keyword == "patternProperties":
            recursive_object[dynamic_keyword] = {"^child_": dynamic_schema}
        else:
            recursive_object[dynamic_keyword] = dynamic_schema
        return recursive_object

    recursive_object = make_recursive_object()
    recursive_input = {"child_one": {}}

    if not nested:
        return recursive_object, recursive_input

    return (
        {
            "$defs": {"Recursive": recursive_object},
            "type": "object",
            "properties": {"payload": make_recursive_object()},
            "required": ["payload"],
        },
        {"payload": recursive_input},
    )


@pytest.mark.parametrize(
    "dynamic_keyword",
    ["patternProperties", "additionalProperties"],
    ids=["pattern-properties", "additional-properties"],
)
@pytest.mark.parametrize(
    "converter",
    [json_schema_to_model, json_schema_to_pydantic_type],
    ids=["model", "pydantic-type"],
)
@pytest.mark.parametrize("nested", [False, True], ids=["root", "nested"])
def test_recursive_dynamic_schema_with_default_does_not_reenter_policy_validation(
    dynamic_keyword,
    converter,
    nested,
):
    schema, input_value = _recursive_dynamic_schema(dynamic_keyword, nested)
    Draft7Validator.check_schema(schema)

    annotation = converter(schema)
    adapter = TypeAdapter(annotation)
    result = adapter.validate_python(input_value)

    assert adapter.dump_python(result, mode="json", by_alias=True) == input_value

    invalid_value = {"child_one": "not-an-object"}
    if nested:
        invalid_value = {"payload": invalid_value}
    with pytest.raises(ValidationError):
        adapter.validate_python(invalid_value)


@pytest.mark.parametrize(
    "case,index",
    [
        (case, index)
        for case in load_object_cases()
        for index in range(len(case.instances))
    ],
    ids=[
        f"{case.id}[{index}]"
        for case in load_object_cases()
        for index in range(len(case.instances))
    ],
)
def test_shared_object_corpus_through_json_schema_to_pydantic_type(case, index):
    """`json_schema_to_pydantic_type` must agree with `json_schema_to_model`.

    The two entry points return different things — a Pydantic type versus a
    `BaseModel` subclass — so the type is exercised through a `TypeAdapter` and
    compared as a JSON-shaped value.
    """
    instance = case.instances[index]
    adapter = TypeAdapter(json_schema_to_pydantic_type(case.schema_))

    if not instance.accepted_for("python"):
        with pytest.raises(ValidationError):
            adapter.validate_python(instance.input)
        return

    result = adapter.validate_python(instance.input)
    if instance.python is not None and instance.python.has_output:
        assert (
            adapter.dump_python(result, mode="json", by_alias=True)
            == instance.python.output
        )
