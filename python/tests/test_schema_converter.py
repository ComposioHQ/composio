"""Tests for the schema_converter boolean-schema pre-filter."""

import pytest
from pydantic import TypeAdapter, ValidationError

from composio.utils.schema_converter import (
    _filter_boolean_schemas,
    json_schema_to_pydantic_type,
)
from composio.utils.shared import json_schema_to_model


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
