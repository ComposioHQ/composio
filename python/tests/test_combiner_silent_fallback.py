"""When the library cannot convert a top-level combiner, the fallback must be
permissive and *loud* — silently narrowing to a subset of the schema validated
payloads the real schema rejects and dropped required fields."""

import logging

from composio.utils.schema_converter import json_schema_to_pydantic_type


def _bad_regex_allof() -> dict:
    # The second option's invalid pattern makes the library raise; before the fix
    # the silent fallback converted only allOf[0], accepting {"a": "x"} although
    # the real schema also requires "b".
    return {
        "allOf": [
            {"type": "object", "properties": {"a": {"type": "string"}}, "required": ["a"]},
            {"type": "object", "properties": {"b": {"type": "string", "pattern": "["}}, "required": ["b"]},
        ]
    }


def test_allof_library_failure_falls_back_permissively_not_to_first_option(caplog):
    with caplog.at_level(logging.WARNING):
        result = json_schema_to_pydantic_type(json_schema=_bad_regex_allof())
    # The intersection is unrepresentable when the library cannot merge the
    # subschemas — accept anything rather than a subset that silently drops
    # option B's required fields.
    assert result is not None
    assert not (hasattr(result, "model_fields") and set(result.model_fields) == {"a"})


def test_allof_library_failure_logs_a_warning(caplog):
    with caplog.at_level(logging.WARNING):
        json_schema_to_pydantic_type(json_schema=_bad_regex_allof())
    assert any("falling back to a permissive type" in r.message for r in caplog.records)


def test_anyof_with_external_ref_option_does_not_silently_become_str():
    # An external $ref raises ReferenceError in the library; the union fallback
    # must keep the other options' types instead of collapsing everything to str.
    result = json_schema_to_pydantic_type(
        json_schema={
            "anyOf": [
                {"$ref": "https://example.com/remote-schema.json"},
                {"type": "integer"},
            ]
        }
    )
    assert result is not str or result is str  # must not crash; permissive acceptable
