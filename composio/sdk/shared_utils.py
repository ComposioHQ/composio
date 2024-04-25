from inspect import Parameter
from typing import Any, Dict, List, Optional, Type

from pydantic.v1 import BaseModel, Field, create_model


schema_type_python_type_dict = {
    "string": str,
    "number": float,
    "boolean": bool,
    "integer": int,
}

fallback_values = {
    "string": "",
    "number": 0.0,
    "integer": 0.0,
    "boolean": False,
    "object": {},
    "array": [],
}


def json_schema_to_model(json_schema: Dict[str, Any]) -> Type[BaseModel]:
    """
    Converts a JSON schema to a Pydantic BaseModel class.

    Args:
        json_schema: The JSON schema to convert.

    Returns:
        A Pydantic BaseModel class.
    """

    # Extract the model name from the schema title.
    model_name = json_schema.get("title")

    # Extract the field definitions from the schema properties.
    field_definitions = {
        name: json_schema_to_pydantic_field(name, prop, json_schema.get("required", []))
        for name, prop in json_schema.get("properties", {}).items()
    }

    # Create the BaseModel class using create_model().
    return create_model(model_name, **field_definitions)


def json_schema_to_pydantic_field(
    name: str, json_schema: Dict[str, Any], required: List[str]
) -> Any:
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
    description = json_schema.get("description")

    # Get the field examples.
    examples = json_schema.get("examples", [])

    # Create a Field object with the type, description, and examples.
    # The 'required' flag will be set later when creating the model.
    return (
        type_,
        Field(
            description=description,
            examples=examples,
            default=... if name in required else None,
        ),
    )


def json_schema_to_pydantic_type(  # pylint: disable=too-many-return-statements
    json_schema: Dict[str, Any]
) -> Any:
    """
    Converts a JSON schema type to a Pydantic type.

    Args:
        json_schema: The JSON schema to convert.

    Returns:
        A Pydantic type.
    """

    type_ = json_schema.get("type")

    if type_ == "string":
        return str

    if type_ == "integer":
        return int

    if type_ == "number":
        return float

    if type_ == "boolean":
        return bool

    if type_ == "array":
        items_schema = json_schema.get("items")
        if items_schema:
            item_type = json_schema_to_pydantic_type(items_schema)
            return List[item_type]
        return List

    if type_ == "object":
        # Handle nested models.
        properties = json_schema.get("properties")
        if properties:
            nested_model = json_schema_to_model(json_schema)
            return nested_model
        return Dict

    if type_ == "null":
        return Optional[Any]  # Use Optional[Any] for nullable fields

    raise ValueError(f"Unsupported JSON schema type: {type_}")


def pydantic_model_from_param_schema(param_schema):
    """
    Dynamically creates a Pydantic model from a schema dictionary.

    Args:
    param_schema (dict): Schema with 'title', 'properties', and optionally 'required' keys.

    Returns:
    BaseModel: A Pydantic model class for the defined schema.

    Raises:
    KeyError: Missing 'type' in property definitions.
    ValueError: Invalid 'type' for property or recursive model creation.

    Note:
    Requires global `schema_type_python_type_dict` for type mapping and `fallback_values` for default values.
    """
    required_fields = {}
    optional_fields = {}
    param_title = param_schema["title"].replace(" ", "")
    required_props = param_schema.get("required", [])
    # schema_params_object = param_schema.get('properties', {})
    for prop_name, prop_info in param_schema.get("properties", {}).items():
        prop_type = prop_info["type"]
        prop_title = prop_info["title"].replace(" ", "")
        prop_default = prop_info.get("default", fallback_values[prop_type])
        if prop_type in schema_type_python_type_dict:
            signature_prop_type = schema_type_python_type_dict[prop_type]
        else:
            signature_prop_type = pydantic_model_from_param_schema(prop_info)

        if prop_name in required_props:
            required_fields[prop_name] = (
                signature_prop_type,
                Field(
                    ...,
                    title=prop_title,
                    description=prop_info.get(
                        "description", prop_info.get("desc", prop_title)
                    ),
                ),
            )
        else:
            optional_fields[prop_name] = (
                signature_prop_type,
                Field(title=prop_title, default=prop_default),
            )
    fieldModel = create_model(param_title, **required_fields, **optional_fields)
    return fieldModel


# def get_signature_format_from_schema_params(
#         schema_params
# ):
#     """
#     Converts schema parameters into a list of `Parameter` objects for function signatures.

#     Parameters:
#     - schema_params (dict): Contains 'required' (list of names) and 'properties' (name-schema pairs).

#     Returns:
#     - List[Parameter]: Signature parameters, with required ones first.
#     """
#     required_parameters = []
#     optional_parameters = []

#     required_params = schema_params.get('required', [])
#     schema_params_object = schema_params.get('properties', {})
#     for param_name, param_schema in schema_params_object.items():
#         param_type = param_schema['type']
#         param_title = param_schema['title'].replace(" ", "")

#         if param_type in schema_type_python_type_dict:
#             signature_param_type = schema_type_python_type_dict[param_type]
#         else:
#             signature_param_type = pydantic_model_from_param_schema(param_schema)

#         param_default = param_schema.get('default', fallback_values[param_type])
#         param_annotation = Annotated[signature_param_type, param_schema.get('description',
#                                                                             param_schema.get('desc',
#                                                                                              param_title))]
#         param = Parameter(
#             name=param_name,
#             kind=Parameter.POSITIONAL_OR_KEYWORD,
#             annotation=param_annotation,
#             default=Parameter.empty if param_name in required_params else param_default
#         )
#         is_required = param_name in required_params
#         if is_required:
#             required_parameters.append(param)
#         else :
#             optional_parameters.append(param)
#     return required_parameters + optional_parameters


def get_signature_format_from_schema_params(schema_params):
    required_parameters = []
    optional_parameters = []

    required_params = schema_params.get("required", [])
    schema_params_object = schema_params.get("properties", {})
    for param_name, param_schema in schema_params_object.items():
        param_type = param_schema["type"]
        param_title = param_schema["title"].replace(" ", "")  # noqa: F841

        if param_type in schema_type_python_type_dict:
            signature_param_type = schema_type_python_type_dict[param_type]
        else:
            signature_param_type = pydantic_model_from_param_schema(param_schema)

        param_default = param_schema.get("default", fallback_values[param_type])
        param_annotation = signature_param_type
        param = Parameter(
            name=param_name,
            kind=Parameter.POSITIONAL_OR_KEYWORD,
            annotation=param_annotation,
            default=Parameter.empty if param_name in required_params else param_default,
        )
        is_required = param_name in required_params
        if is_required:
            required_parameters.append(param)
        else:
            optional_parameters.append(param)
    return required_parameters + optional_parameters
