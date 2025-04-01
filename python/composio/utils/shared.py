"""
Shared utils.
"""

import typing as t
import uuid
from inspect import Parameter

from pydantic import BaseModel, Field, create_model
from pydantic.fields import FieldInfo

from composio.utils.logging import get as get_logger


logger = get_logger(__name__)

PYDANTIC_TYPE_TO_PYTHON_TYPE = {
    "string": str,
    "integer": int,
    "number": float,
    "boolean": bool,
    "array": t.List,
    "object": t.Dict,
    "null": t.Optional[t.Any],
}

CONTAINER_TYPE = ("array", "object")

# Should be deprecated,
# required values will always be provided by users
# Non-required values are nullable(None) if default value not provided.
FALLBACK_VALUES = {
    "string": "",
    "number": 0.0,
    "integer": 0,
    "boolean": False,
    "object": {},
    "array": [],
    "null": None,
}

reserved_names = ["validate"]


def json_schema_to_pydantic_type(
    json_schema: t.Dict[str, t.Any],
) -> t.Union[t.Type, t.Optional[t.Any]]:
    """
    Converts a JSON schema type to a Pydantic type.

    :param json_schema: The JSON schema to convert.
    :return: A Pydantic type.
    """
    # Add fallback type - string
    if "type" not in json_schema:
        json_schema["type"] = "string"
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

    if type_ is None and "oneOf" in json_schema:
        one_of_options = json_schema["oneOf"]
        pydantic_types: t.List[t.Type] = [
            json_schema_to_pydantic_type(option) for option in one_of_options
        ]
        if len(pydantic_types) == 1:
            return pydantic_types[0]
        if len(pydantic_types) == 2:
            return t.Union[
                t.cast(t.Type, pydantic_types[0]), t.cast(t.Type, pydantic_types[1])
            ]
        if len(pydantic_types) == 3:
            return t.Union[
                t.cast(t.Type, pydantic_types[0]),
                t.cast(t.Type, pydantic_types[1]),
                t.cast(t.Type, pydantic_types[2]),
            ]
        raise ValueError("Invalid 'oneOf' schema")

    pytype = PYDANTIC_TYPE_TO_PYTHON_TYPE.get(type_)
    if pytype is not None:
        return pytype

    raise ValueError(f"Unsupported JSON schema type: {type_}")


def json_schema_to_pydantic_field(
    name: str,
    json_schema: t.Dict[str, t.Any],
    required: t.List[str],
    skip_default: bool = False,
) -> t.Tuple[str, t.Type, FieldInfo]:
    """
    Converts a JSON schema property to a Pydantic field definition.

    :param name: The field name.
    :param json_schema: The JSON schema property.
    :param required: List of required properties.
    :return: A Pydantic field definition.
    """
    description = json_schema.get("description")
    if "oneOf" in json_schema:
        description = " | ".join(
            [option.get("description", "") for option in json_schema["oneOf"]]
        )
        description = f"Any of the following options(separated by |): {description}"

    examples = json_schema.get("examples", [])
    default = json_schema.get("default")

    # Check if the field name is a reserved Pydantic name
    if name in reserved_names:
        name = f"{name}_"
        alias = name
    else:
        alias = None

    field = {
        "description": description,
        "examples": examples,
        "alias": alias,
    }
    if not skip_default:
        field["default"] = (
            ...
            if (
                name in required
                or json_schema.get(
                    "required",
                    False,
                )
            )
            else default
        )

    return (
        name,
        t.cast(
            t.Type,
            json_schema_to_pydantic_type(
                json_schema=json_schema,
            ),
        ),
        Field(**field),  # type: ignore
    )


def json_schema_to_fields_dict(json_schema: t.Dict[str, t.Any]) -> t.Dict[str, t.Any]:
    """
    Converts a JSON schema to a dictionary of param name, and a tuple of type & Field.

    :param json_schema: The JSON schema to convert.
    :return: dict<str, tuple<<class 'type'>, Field>>

    Example Output:
    ```python
    {
        'owner': (<class 'str'>, FieldInfo(default=Ellipsis, description='The account owner of the repository.', extra={'examples': ([],)})),
        'repo': (<class 'str'>, FieldInfo(default=Ellipsis, description='The name of the repository without the `.git` extension.', extra={'examples': ([],)}))}
    }
    ```

    """
    field_definitions = {}
    for name, prop in json_schema.get("properties", {}).items():
        updated_name, pydantic_type, pydantic_field = json_schema_to_pydantic_field(
            name, prop, json_schema.get("required", [])
        )
        field_definitions[updated_name] = (pydantic_type, pydantic_field)
    return field_definitions  # type: ignore


def json_schema_to_model(
    json_schema: t.Dict[str, t.Any],
    skip_default: bool = False,
) -> t.Type[BaseModel]:
    """
    Converts a JSON schema to a Pydantic BaseModel class.

    :param json_schema: The JSON schema to convert.
    :param skip_default: Skip the default values when building field object
    :return: Pydantic `BaseModel` type
    """
    model_name = json_schema.get("title")
    field_definitions = {}
    for name, prop in json_schema.get("properties", {}).items():
        updated_name, pydantic_type, pydantic_field = json_schema_to_pydantic_field(
            name,
            prop,
            json_schema.get("required", []),
            skip_default=skip_default,
        )
        field_definitions[updated_name] = (pydantic_type, pydantic_field)
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
    if "title" not in param_schema:
        raise ValueError(f"Missing 'title' in param_schema: {param_schema}")

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
        if (
            prop_type in PYDANTIC_TYPE_TO_PYTHON_TYPE
            and prop_type not in CONTAINER_TYPE
        ):
            signature_prop_type = PYDANTIC_TYPE_TO_PYTHON_TYPE[prop_type]
        else:
            signature_prop_type = pydantic_model_from_param_schema(prop_info)

        field_kwargs = {
            "description": prop_info.get(
                "description", prop_info.get("desc", prop_title)
            ),
        }

        # Add alias if the field name is a reserved Pydantic name
        if prop_name in reserved_names:
            field_kwargs["alias"] = prop_name
            field_kwargs["title"] = f"{prop_name}_"
        else:
            field_kwargs["title"] = prop_title

        if prop_name in required_props or prop_info.get("required", False):
            required_fields[prop_name] = (
                signature_prop_type,
                Field(..., **field_kwargs),
            )
        else:
            optional_fields[prop_name] = (
                signature_prop_type,
                Field(default=prop_default, **field_kwargs),
            )

    if not required_fields and not optional_fields:
        return t.Dict

    return create_model(  # type: ignore
        param_title,
        **required_fields,
        **optional_fields,
    )


def get_signature_format_from_schema_params(
    schema_params: t.Dict,
    skip_default: bool = False,
) -> t.List[Parameter]:
    """
    Get function parameters signature(with pydantic field definition as default values)
    from schema parameters. Works like:

    def demo_function(
        owner: str,
        repo: str),
    )

    :param schema_params: A dictionary object containing schema params, with keys [properties, required etc.].
    :return: List of required and optional parameters

    Output Format:
    [
        <Parameter "owner: str">,
        <Parameter "repo: str">
    ]
    """
    default_parameters = []
    none_default_parameters = []

    required_params = schema_params.get("required", [])
    schema_params_object = schema_params.get("properties", {})
    for param_name, param_schema in schema_params_object.items():
        param_type = param_schema.get("type", None)
        param_oneOf = param_schema.get("oneOf", None)
        param_anyOf = param_schema.get("anyOf", None)
        param_allOf = param_schema.get("allOf", None)
        if param_allOf is not None and len(param_allOf) == 1:
            param_type = param_allOf[0].get("type", None)
        if param_oneOf is not None or param_anyOf is not None:
            param_types = [ptype.get("type") for ptype in (param_oneOf or param_anyOf)]
            if len(param_types) == 1:
                annotation = PYDANTIC_TYPE_TO_PYTHON_TYPE[param_types[0]]
            elif len(param_types) == 2:
                # Check as redefinition and union was incompatible
                # @karan to check if this is the right way to do it
                t1: t.Type = PYDANTIC_TYPE_TO_PYTHON_TYPE[param_types[0]]  # type: ignore
                t2: t.Type = PYDANTIC_TYPE_TO_PYTHON_TYPE[param_types[1]]  # type: ignore
                annotation: t.Type = t.Union[t1, t2]  # type: ignore
            elif len(param_types) == 3:
                t1: t.Type = PYDANTIC_TYPE_TO_PYTHON_TYPE[param_types[0]]  # type: ignore
                t2: t.Type = PYDANTIC_TYPE_TO_PYTHON_TYPE[param_types[1]]  # type: ignore
                t3: t.Type = PYDANTIC_TYPE_TO_PYTHON_TYPE[param_types[2]]  # type: ignore
                annotation: t.Type = t.Union[t1, t2, t3]  # type: ignore
            else:
                raise ValueError("Invalid 'oneOf' schema")
            param_default = param_schema.get("default", "")
        elif param_type in PYDANTIC_TYPE_TO_PYTHON_TYPE:
            annotation = PYDANTIC_TYPE_TO_PYTHON_TYPE[param_type]
            param_default = param_schema.get("default", FALLBACK_VALUES[param_type])
        else:
            annotation = pydantic_model_from_param_schema(param_schema)
            if param_type is None or param_type == "null":
                param_default = None
            else:
                param_default = param_schema.get("default", FALLBACK_VALUES[param_type])

        default = param_default
        required = param_schema.get("required", False) or param_name in required_params
        if required:
            default = Parameter.empty

        if skip_default:
            default = Parameter.empty

        parameter = Parameter(
            name=param_name,
            kind=Parameter.POSITIONAL_OR_KEYWORD,
            annotation=annotation,
            default=default,
        )
        if required:
            default_parameters.append(parameter)
            continue
        none_default_parameters.append(parameter)
    return default_parameters + none_default_parameters


def get_pydantic_signature_format_from_schema_params(
    schema_params: t.Dict,
    skip_default: bool = False,
) -> t.List[Parameter]:
    """
    Get function parameters signature(with pydantic field definition as default values)
    from schema parameters. Works like:

    def demo_function(
        owner: str=Field(..., description='The account owner of the repository.'),
        repo: str=Field(..., description='The name of the repository without the `.git` extension.'),
    )

    :param schema_params: A dictionary object containing schema params, with keys [properties, required etc.].
    :return: List of required and optional parameters

    Example Output Format:
    ```python
    [
        <Parameter "owner: str = FieldInfo(
            default=Ellipsis,
            description='The account owner of the repository.',
            extra={'examples': ([],)})">,
        <Parameter "repo: str = FieldInfo(
            default=Ellipsis,
            description='The name of the repository without the `.git` extension.',
            extra={'examples': ([],)})">
    ]
    ```
    """
    all_parameters = []
    field_definitions = json_schema_to_fields_dict(schema_params)
    for param_name, (param_dtype, parame_field) in field_definitions.items():
        param = Parameter(
            name=param_name,
            kind=Parameter.POSITIONAL_OR_KEYWORD,
            annotation=param_dtype,
            default=Parameter.empty if skip_default else parame_field.default,
        )
        all_parameters.append(param)

    return all_parameters


def generate_request_id() -> str:
    """Generate a unique request ID."""
    return str(uuid.uuid4())
