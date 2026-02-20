"""Tests for json_schema_to_model robustness."""

from composio.utils.shared import json_schema_to_model


def test_json_schema_to_model_generates_name_when_title_missing() -> None:
    """Anonymous/untitled schemas should not crash create_model."""
    schema = {
        "type": "object",
        # Intentionally omit "title" to match real-world tool schemas.
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    # Intentionally omit nested object title.
                    "properties": {"a": {"type": "string"}},
                    "required": ["a"],
                },
            }
        },
        "required": ["items"],
    }

    Model = json_schema_to_model(schema)
    assert isinstance(Model.__name__, str)
    assert Model.__name__

    instance = Model(items=[{"a": "x"}])
    assert instance.items[0].a == "x"
