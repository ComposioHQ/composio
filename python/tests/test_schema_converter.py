"""Tests for the schema_converter boolean-schema pre-filter."""

import pytest
from pydantic import TypeAdapter, ValidationError

from composio.utils.schema_converter import (
    _filter_boolean_schemas,
    json_schema_to_pydantic_type,
)


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


def test_combiner_removed_when_all_entries_false():
    schema = {"type": "object", "anyOf": [False, False]}
    assert _filter_boolean_schemas(schema) == {"type": "object"}


def test_false_property_is_dropped():
    schema = {"properties": {"a": False, "b": {"type": "string"}}}
    assert _filter_boolean_schemas(schema) == {"properties": {"b": {"type": "string"}}}


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

    assert _filter_boolean_schemas(schema_with_false) is None

    pytype = json_schema_to_pydantic_type(schema_with_false)
    adapter = TypeAdapter(pytype)
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
    for value in ("some string", 123, {"a": "hello"}):
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
