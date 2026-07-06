"""Tests for the schema_converter boolean-schema pre-filter."""

from composio.utils.schema_converter import _filter_boolean_schemas


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
