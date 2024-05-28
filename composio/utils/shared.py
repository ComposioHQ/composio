"""
Shared utils.
"""

import typing as t
from inspect import Parameter

from pydantic.v1 import BaseModel, Field, create_model
from pydantic.v1.fields import FieldInfo


SCHEMA_TYPE_TO_PYTHON_TYPE = {
    "string": str,
    "number": float,
    "boolean": bool,
    "integer": int,
}

PYDANTIC_TYPE_TO_PYTHON_TYPE = {
    "string": str,
    "integer": int,
    "number": float,
    "boolean": bool,
    "null": t.Optional[t.Any],
}

FALLBACK_VALUES = {
    "string": "",
    "number": 0.0,
    "integer": 0,
    "boolean": False,
    "object": {},
    "array": [],
}


def json_schema_to_pydantic_type(
    json_schema: t.Dict[str, t.Any],
) -> t.Union[t.Type, t.Optional[t.Any]]:
    """
    Converts a JSON schema type to a Pydantic type.

    :param json_schema: The JSON schema to convert.
    :return: A Pydantic type.
    """

    type_ = t.cast(str, json_schema.get("type"))
    if type_ == "array":
        items_schema = json_schema.get("items")
        if items_schema:
            ItemType = json_schema_to_pydantic_type(items_schema)
            return t.List[t.cast(t.Type, ItemType)]  # type: ignore
        return t.List

    if type_ == "object":
        properties = json_schema.get("properties")
        if properties:
            nested_model = json_schema_to_model(json_schema)
            return nested_model
        return t.Dict

    pytype = PYDANTIC_TYPE_TO_PYTHON_TYPE.get(type_)
    if pytype is not None:
        return pytype

    raise ValueError(f"Unsupported JSON schema type: {type_}")


def json_schema_to_pydantic_field(
    name: str,
    json_schema: t.Dict[str, t.Any],
    required: t.List[str],
) -> t.Tuple[t.Type, FieldInfo]:
    """
    Converts a JSON schema property to a Pydantic field definition.

    :param name: The field name.
    :param json_schema: The JSON schema property.
    :param required: List of required properties.
    :return: A Pydantic field definition.
    """
    description = json_schema.get("description")
    examples = json_schema.get("examples", [])
    return (
        t.cast(
            t.Type,
            json_schema_to_pydantic_type(
                json_schema=json_schema,
            ),
        ),
        Field(
            description=description,
            examples=examples,
            default=... if name in required else None,
        ),
    )


def json_schema_to_model(json_schema: t.Dict[str, t.Any]) -> t.Type[BaseModel]:
    """
    Converts a JSON schema to a Pydantic BaseModel class.

    :param json_schema: The JSON schema to convert.
    :return: Pydantic `BaseModel` type
    """
    model_name = json_schema.get("title")
    field_definitions = {
        name: json_schema_to_pydantic_field(name, prop, json_schema.get("required", []))
        for name, prop in json_schema.get("properties", {}).items()
    }
    return create_model(model_name, **field_definitions)  # type: ignore


def pydantic_model_from_param_schema(param_schema: t.Dict) -> t.Type:
    """
    Dynamically creates a Pydantic model from a schema dictionary.

    :param param_schema: Schema with 'title', 'properties', and optionally 'required' keys.
    :return: A Pydantic model class for the defined schema.

    :raises KeyError: Missing 'type' in property definitions.
    :raised ValueError: Invalid 'type' for property or recursive model creation.

    Note: Requires global `schema_type_python_type_dict` for type mapping and
        `fallback_values` for default values.
    """
    required_fields = {}
    optional_fields = {}
    param_title = str(param_schema["title"]).replace(" ", "")
    required_props = param_schema.get("required", [])

    if param_schema.get("type") == "array":
        # print("param_schema inside array - ", param_schema)
        item_schema = param_schema.get("items")
        if item_schema:
            ItemType = t.cast(
                t.Type,
                json_schema_to_pydantic_type(
                    json_schema=item_schema,
                ),
            )
            return t.List[ItemType]  # type: ignore
        return t.List

    for prop_name, prop_info in param_schema.get("properties", {}).items():
        prop_type = prop_info["type"]
        prop_title = prop_info["title"].replace(" ", "")
        prop_default = prop_info.get("default", FALLBACK_VALUES[prop_type])
        if prop_type in SCHEMA_TYPE_TO_PYTHON_TYPE:
            signature_prop_type = SCHEMA_TYPE_TO_PYTHON_TYPE[prop_type]
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

    if not required_fields and not optional_fields:
        return t.Dict

    return create_model(  # type: ignore
        param_title,
        **required_fields,
        **optional_fields,
    )


def get_signature_format_from_schema_params(schema_params: t.Dict) -> t.List[Parameter]:
    """
    Get function paramters signature from schema parameters.

    :param schema_params: A dictionary object containing schema params.
    :return: List of required and optional parameters
    """
    required_parameters = []
    optional_parameters = []

    required_params = schema_params.get("required", [])
    schema_params_object = schema_params.get("properties", {})
    for param_name, param_schema in schema_params_object.items():
        param_type = param_schema["type"]
        if param_type in SCHEMA_TYPE_TO_PYTHON_TYPE:
            signature_param_type = SCHEMA_TYPE_TO_PYTHON_TYPE[param_type]
        else:
            signature_param_type = pydantic_model_from_param_schema(param_schema)

        param_default = param_schema.get("default", FALLBACK_VALUES[param_type])
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
