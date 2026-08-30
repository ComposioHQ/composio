"""Boolean sub-schemas (``True``/``False`` properties) are valid draft-06+ JSON
Schema; helpers that walk fetched tool schemas must skip them instead of crashing."""

from composio.core.models._files import FileHelper


def test_enhance_schema_descriptions_skips_boolean_subschemas() -> None:
    """`True`/`False` property schemas used to crash the enhancer with
    AttributeError ('bool' object has no attribute 'get') — it runs unconditionally
    on fetched tool schemas, before the converter's boolean pre-filter."""
    helper = FileHelper(client=None)
    schema = {
        "properties": {
            "x": True,  # accept anything
            "y": False,  # reject everything
            "name": {"type": "string"},
        },
        "required": ["name"],
    }
    result = helper.enhance_schema_descriptions(schema)

    assert result["properties"]["x"] is True
    assert result["properties"]["y"] is False
    assert "value of type string" in result["properties"]["name"]["description"]
    assert "required" in result["properties"]["name"]["description"].lower()
