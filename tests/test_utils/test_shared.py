"""
Test shared module.
"""

from inspect import Parameter

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
    assert result[0].default.description == "The account owner of the repository."
    assert (
        result[1].default.description
        == "The name of the repository without the `.git` extension."
    )


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
    assert result[0] == str
    assert result[1].description == "The account owner of the repository."
    assert result[1].default == ...


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
    assert result["owner"][0] == str
    assert result["repo"][0] == str
    assert result["owner"][1].description == "The account owner of the repository."
    assert (
        result["repo"][1].description
        == "The name of the repository without the `.git` extension."
    )
    assert result["owner"][1].default == ...
    assert result["repo"][1].default is None
