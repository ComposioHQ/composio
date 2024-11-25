"""
Test shared module.
"""

from inspect import Parameter

import pydantic
import pytest
from pydantic_core import PydanticUndefined

from composio.utils import shared


def test_get_pydantic_signature_format_from_schema_params() -> None:
    """Test `get_pydantic_signature_format_from_schema_params` method."""
    # Define a mock schema
    schema_params = {
        "properties": {
            "owner": {
                "type": "string",
                "description": "The account owner of the repository.",
            },
            "repo": {
                "type": "string",
                "description": "The name of the repository without the `.git` extension.",
            },
        },
        "required": ["owner"],
    }

    # Call the function with the mock schema
    result = shared.get_pydantic_signature_format_from_schema_params(schema_params)

    # Check the output
    assert len(result) == 2
    assert isinstance(result[0], Parameter)
    assert isinstance(result[1], Parameter)
    assert result[0].name == "owner"
    assert result[1].name == "repo"


def test_json_schema_to_pydantic_field() -> None:
    """Test `json_schema_to_pydantic_field` method."""
    # Define a mock schema
    name = "owner"
    json_schema = {
        "type": "string",
        "description": "The account owner of the repository.",
    }
    required = ["owner"]

    # Call the function with the mock schema
    result = shared.json_schema_to_pydantic_field(name, json_schema, required)

    # Check the output
    assert result[0] == "owner"
    assert result[1] is str
    assert result[2].description == "The account owner of the repository."
    assert result[2].default == PydanticUndefined


def test_json_schema_to_fields_dict() -> None:
    """Test `json_schema_to_fields_dict` method."""
    # Define a mock schema
    json_schema = {
        "properties": {
            "owner": {
                "type": "string",
                "description": "The account owner of the repository.",
            },
            "repo": {
                "type": "string",
                "description": "The name of the repository without the `.git` extension.",
            },
        },
        "required": ["owner"],
    }

    # Call the function with the mock schema
    result = shared.json_schema_to_fields_dict(json_schema)

    # Check the output
    assert len(result) == 2
    assert "owner" in result
    assert "repo" in result
    assert result["owner"][0] is str
    assert result["repo"][0] is str
    assert result["owner"][1].description == "The account owner of the repository."
    assert (
        result["repo"][1].description
        == "The name of the repository without the `.git` extension."
    )
    assert result["owner"][1].default == PydanticUndefined
    assert result["repo"][1].default is None


def test_pydantic_model_from_param_schema() -> None:
    schema = {
        "description": "Request to get a Foo Bar.",
        "properties": {
            "id": {
                "default": "",
                "description": "ID of the file manager where the file will be opened, if not provided the recent file manager will be used to execute the action",
                "title": "Id",
                "type": "string",
            },
            "foo": {
                "default": "",
                "description": "The foo that we need",
                "title": "Foo",
                "type": "string",
            },
            "attr": {
                "description": "List of attributes.",
                "items": {"type": "string"},
                "title": "Attr",
                "type": "array",
            },
            "attrmap": {
                "description": "List of attributes.",
                "properties": {
                    "attr": {
                        "description": "List of attributes.",
                        "items": {"type": "string"},
                        "title": "Attr",
                        "type": "array",
                    }
                },
                "title": "Attr",
                "type": "object",
            },
        },
        "required": ["attr"],
        "title": "FooBarRequest",
        "type": "object",
    }
    model = shared.pydantic_model_from_param_schema(schema)

    # Happy case:
    model(attr=["xyz", "abc"])
    attrs = ["xyz", "list of stuff"]
    model(attr=attrs, attrmap={"attr": attrs})

    # Sad cases:
    with pytest.raises(pydantic.ValidationError):
        model(attr=[123])
    with pytest.raises(pydantic.ValidationError):
        model(attr="foo")
    with pytest.raises(pydantic.ValidationError):
        model()
    with pytest.raises(pydantic.ValidationError):
        model(attr=attrs, attrmap=None)
    with pytest.raises(pydantic.ValidationError):
        model(attr=attrs, attrmap=["list directly"])
