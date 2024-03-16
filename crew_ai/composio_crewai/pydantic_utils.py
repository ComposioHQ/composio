from langchain.pydantic_v1 import BaseModel, Field, create_model
from typing import Any, Dict, List, Optional, Type

def json_schema_to_model(json_schema: Dict[str, Any]) -> Type[BaseModel]:
    """
    Converts a JSON schema to a Pydantic BaseModel class.

    Args:
        json_schema: The JSON schema to convert.

    Returns:
        A Pydantic BaseModel class.
    """

    # Extract the model name from the schema title.
    model_name = json_schema.get('title')

    # Extract the field definitions from the schema properties.
    field_definitions = {
        name: json_schema_to_pydantic_field(name, prop, json_schema.get('required', []) )
        for name, prop in json_schema.get('properties', {}).items()
    }

    # Create the BaseModel class using create_model().
    return create_model(model_name, **field_definitions)

def json_schema_to_pydantic_field(name: str, json_schema: Dict[str, Any], required: List[str]) -> Any:
    """
    Converts a JSON schema property to a Pydantic field definition.

    Args:
        name: The field name.
        json_schema: The JSON schema property.

    Returns:
        A Pydantic field definition.
    """

    # Get the field type.
    type_ = json_schema_to_pydantic_type(json_schema)

    # Get the field description.
    description = json_schema.get('description')

    # Get the field examples.
    examples = json_schema.get('examples')

    # Determine the default value based on the type and requirement.
    if name in required:
        default = ...
    else:
        default = get_default_value_for_type(type_)

    # Create a Field object with the type, description, examples, and default value.
    return (type_, Field(description=description, examples=examples, default=default))

def get_default_value_for_type(type_: Any) -> Any:
    """
    Returns a default value for a given Pydantic type.

    Args:
        type_: The Pydantic type.

    Returns:
        A default value for the type.
    """
    if type_ == str:
        return ''
    elif type_ == int:
        return 0
    elif type_ == float:
        return 0.0
    elif type_ == bool:
        return False
    elif type_ == List:
        return []
    elif type_ == Dict:
        return {}
    elif type_ == Optional[Any]:
        return None
    else:
        return None

def json_schema_to_pydantic_type(json_schema: Dict[str, Any]) -> Any:
    """
    Converts a JSON schema type to a Pydantic type.

    Args:
        json_schema: The JSON schema to convert.

    Returns:
        A Pydantic type.
    """

    type_ = json_schema.get('type')

    if type_ == 'string':
        return str
    elif type_ == 'integer':
        return int
    elif type_ == 'number':
        return float
    elif type_ == 'boolean':
        return bool
    elif type_ == 'array':
        items_schema = json_schema.get('items')
        if items_schema:
            item_type = json_schema_to_pydantic_type(items_schema)
            return List[item_type]
        else:
            return List
    elif type_ == 'object':
        # Handle nested models.
        properties = json_schema.get('properties')
        if properties:
            nested_model = json_schema_to_model(json_schema)
            return nested_model
        else:
            return Dict
    elif type_ == 'null':
        return Optional[Any]  # Use Optional[Any] for nullable fields
    else:
        raise ValueError(f'Unsupported JSON schema type: {type_}')