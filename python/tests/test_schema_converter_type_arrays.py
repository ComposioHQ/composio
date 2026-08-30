"""Draft-06+ type arrays (e.g. ``{"type": ["string", "null"]}``) must not crash the
schema converter — they are valid JSON Schema that OpenAPI 3.1 backends emit."""

from composio.utils.schema_converter import json_schema_to_pydantic_type
from composio.utils.shared import json_schema_to_model


def test_type_array_collapses_to_primary_type() -> None:
    model = json_schema_to_model(
        {
            "properties": {
                "maybe_str": {"type": ["string", "null"]},
                "maybe_int": {"type": ["integer", "null"]},
                "plain": {"type": "string"},
            }
        }
    )
    assert model.model_fields["maybe_str"].annotation is str
    assert model.model_fields["maybe_int"].annotation is int
    assert model.model_fields["plain"].annotation is str


def test_type_array_in_nested_schema_does_not_crash() -> None:
    # The library path (_convert_with_library) also receives the schema; the
    # normalizer must keep the simple-type gate from raising TypeError before
    # delegation.
    model = json_schema_to_model(
        {
            "properties": {
                "spec": {
                    "type": "object",
                    "properties": {"flag": {"type": ["boolean", "null"]}},
                }
            }
        }
    )
    assert model.model_fields["spec"].annotation is not None


def test_json_schema_to_pydantic_type_accepts_type_arrays() -> None:
    assert json_schema_to_pydantic_type(json_schema={"type": ["string", "null"]}) is str
    assert json_schema_to_pydantic_type(json_schema={"type": ["number", "null"]}) is float


def test_multi_non_null_type_array_delegates_instead_of_crashing() -> None:
    # ["string", "integer"] has no single primary type; it must not raise and
    # must fall back to a usable annotation rather than TypeError.
    result = json_schema_to_pydantic_type(json_schema={"type": ["string", "integer"]})
    assert result is not None
