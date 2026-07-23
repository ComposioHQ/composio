"""Tests for composio.utils.schema_converter's boolean-schema pre-filter.

Focused regression coverage for the ``allOf``/``false`` combiner semantics:
JSON Schema draft-06+ allows boolean sub-schemas, and ``allOf`` is a logical
conjunction, so a ``false`` member must force the whole combiner (and thus
the schema) to reject every value -- unlike ``anyOf``/``oneOf``, where a
``false`` branch is simply inert and can be dropped.
"""

import pytest
from pydantic import TypeAdapter, ValidationError

from composio.utils.schema_converter import (
    _filter_boolean_schemas,
    json_schema_to_pydantic_type,
)


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


@pytest.mark.schema
def test_schema_converter_anyof_with_false_member_still_permissive():
    """anyOf/oneOf are unions: a `false` branch is inert and safely dropped."""
    schema = {"anyOf": [{"type": "string"}, False]}
    assert _filter_boolean_schemas(schema) == {"anyOf": [{"type": "string"}]}
