"""
Shared utils.
"""

import copy
import dataclasses
import hashlib
import json
import keyword
import typing as t
import uuid
from inspect import Parameter

from pydantic import BaseModel, Field, create_model
from pydantic.fields import FieldInfo

from composio.exceptions import InvalidParams, InvalidSchemaError
from composio.utils.json_schema import dereference_json_schema
from composio.utils.logging import get as get_logger
from composio.utils.schema_converter import (
    CONTAINER_TYPE,
    FALLBACK_VALUES,
    PYDANTIC_TYPE_TO_PYTHON_TYPE,
    json_schema_to_pydantic_type,
)

logger = get_logger(__name__)

# Re-export for backward compatibility
__all__ = [
    "json_schema_to_pydantic_type",
    "PYDANTIC_TYPE_TO_PYTHON_TYPE",
    "CONTAINER_TYPE",
    "FALLBACK_VALUES",
    "json_schema_to_pydantic_field",
    "json_schema_to_fields_dict",
    "json_schema_to_model",
    "pydantic_model_from_param_schema",
    "get_signature_format_from_schema_params",
    "get_pydantic_signature_format_from_schema_params",
    "generate_request_id",
    "ToolSchemaAliases",
    "alias_tool_input_schema",
    "restore_tool_arguments",
    "substitute_reserved_python_keywords",
    "reinstate_reserved_python_keywords",
    "normalize_tool_arguments",
]

reserved_names = ["validate"]

_OBJ_MARKER = "-_object_-"
_ARR_MARKER = "-_array_-"
_MAX_PROVIDER_ALIAS_LENGTH = 64


def normalize_tool_arguments(arguments: t.Any) -> t.Dict[str, t.Any]:
    """Coerce model-supplied tool arguments into a dict.

    Models (and some MCP transports) occasionally emit tool-call arguments as a
    JSON string instead of a dict, which breaks execution with errors such as
    ``tool_use.input: Input should be a valid dictionary``. This is the single
    coercion every provider routes through so behaviour is identical everywhere.

    See https://github.com/ComposioHQ/composio/issues/2406.

    - ``None`` becomes ``{}`` (some models send no arguments for no-arg tools).
    - A dict is returned unchanged.
    - A string is JSON-parsed; an empty / whitespace-only string becomes ``{}``.
    - Anything that does not resolve to a dict (lists, primitives, unparseable
      strings, JSON that parses to a non-object) raises :class:`InvalidParams`.

    :param arguments: Raw arguments as received from the model / framework.
    :return: The normalized arguments as a dict.
    :raises InvalidParams: If the arguments cannot be resolved to a dict.
    """
    if arguments is None:
        return {}

    if isinstance(arguments, str):
        stripped = arguments.strip()
        if not stripped:
            return {}
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError as e:
            raise InvalidParams(
                f"Tool arguments were provided as a string that is not valid JSON: {e}"
            ) from e
        return _as_dict(parsed)

    return _as_dict(arguments)


def _as_dict(value: t.Any) -> t.Dict[str, t.Any]:
    if isinstance(value, dict):
        return value
    raise InvalidParams(
        f"Tool arguments must resolve to an object, received {type(value).__name__}"
    )


def _make_safe_name(name: str) -> str:
    """Append ``_rs`` to a Python keyword so it can be used as a parameter name."""
    return f"{name}_rs"


def _make_python_identifier(name: str) -> str:
    if keyword.iskeyword(name):
        return _make_safe_name(name)

    safe = "".join(
        char if (char.isascii() and (char.isalnum() or char == "_")) else "_"
        for char in name
    )
    if not safe:
        safe = "param"
    if safe[0].isdigit() or safe[0] == "_":
        safe = f"param_{safe.lstrip('_') or 'value'}"
    if keyword.iskeyword(safe):
        safe = _make_safe_name(safe)
    if len(safe) > _MAX_PROVIDER_ALIAS_LENGTH:
        hash_suffix = hashlib.sha256(name.encode()).hexdigest()[:8]
        safe = (
            f"{safe[: _MAX_PROVIDER_ALIAS_LENGTH - len(hash_suffix) - 1]}_{hash_suffix}"
        )
    return safe


@dataclasses.dataclass(frozen=True)
class ToolSchemaAliases:
    """Provider-visible schema plus mapping back to backend argument names."""

    schema: t.Dict[str, t.Any]
    aliases: t.Dict[str, t.Any]

    def restore_arguments(self, arguments: dict) -> dict:
        return restore_tool_arguments(arguments, self.aliases)


def alias_tool_input_schema(schema: t.Dict) -> ToolSchemaAliases:
    """Alias tool input schema keys so they are valid Python parameter names.

    Returns a :class:`ToolSchemaAliases` object containing a deep-copied schema
    for provider/framework exposure and a reverse alias map for restoring model
    arguments before calling the backend executor.

    Python keywords keep the historical ``_rs`` suffix (``from`` becomes
    ``from_rs``). Other names that cannot be used as Python identifiers are
    converted to Pydantic-safe identifiers and long aliases are capped at 64
    characters so the same provider-facing schema is accepted by
    Anthropic-style tool schema validators. Internal JSON Schema references are
    inlined before aliasing so referenced object properties are exposed through
    the same safe names. If two properties would expose the same alias, an
    :class:`InvalidSchemaError` is raised instead of guessing.
    """
    aliased_schema = t.cast(
        t.Dict[str, t.Any],
        dereference_json_schema(
            copy.deepcopy(schema),
            on_unresolved="sentinel",
        ),
    )
    schema_params, aliases = _alias_schema_properties(aliased_schema)
    return ToolSchemaAliases(schema=schema_params, aliases=aliases)


def _alias_schema_properties(schema: t.Dict[str, t.Any]) -> t.Tuple[dict, dict]:
    properties = schema.get("properties")
    if not isinstance(properties, dict):
        return schema, {}

    aliases: t.Dict[str, t.Any] = {}
    aliased_properties: t.Dict[str, t.Any] = {}

    for original_name, property_schema in properties.items():
        safe_name = _make_python_identifier(original_name)
        if safe_name in aliased_properties:
            raise InvalidSchemaError(
                "Tool input schema property names produce a duplicate Python "
                f"parameter alias {safe_name!r}"
            )

        nested_object_aliases: t.Dict[str, t.Any] = {}
        nested_array_aliases: t.Dict[str, t.Any] = {}
        if isinstance(property_schema, dict):
            property_schema, nested_object_aliases = _alias_nested_object_schema(
                property_schema
            )
            property_schema, nested_array_aliases = _alias_nested_array_schema(
                property_schema
            )

        aliased_properties[safe_name] = property_schema
        if safe_name != original_name or nested_object_aliases or nested_array_aliases:
            aliases[safe_name] = original_name
        if nested_object_aliases:
            aliases[f"{safe_name}{_OBJ_MARKER}"] = nested_object_aliases
        if nested_array_aliases:
            aliases[f"{safe_name}{_ARR_MARKER}"] = nested_array_aliases

    schema["properties"] = aliased_properties
    if aliases and "required" in schema:
        reverse = {
            original: safe
            for safe, original in aliases.items()
            if not safe.endswith(_OBJ_MARKER) and not safe.endswith(_ARR_MARKER)
        }
        schema["required"] = [reverse.get(r, r) for r in schema["required"]]

    return schema, aliases


def _alias_nested_object_schema(
    property_schema: t.Dict[str, t.Any],
) -> t.Tuple[dict, dict]:
    if not isinstance(property_schema.get("properties"), dict):
        return property_schema, {}
    return _alias_schema_properties(property_schema)


def _alias_nested_array_schema(
    property_schema: t.Dict[str, t.Any],
) -> t.Tuple[dict, dict]:
    items_schema = property_schema.get("items")
    if not isinstance(items_schema, dict):
        return property_schema, {}
    aliased_items, aliases = _alias_schema_properties(items_schema)
    if aliases:
        property_schema["items"] = aliased_items
    return property_schema, aliases


def restore_tool_arguments(request: dict, aliases: dict) -> dict:
    """Restore provider-visible argument aliases back to backend schema names.

    Modifies *request* in-place and returns it.
    """
    alias_keys = [
        key
        for key in aliases
        if not key.endswith(_OBJ_MARKER) and not key.endswith(_ARR_MARKER)
    ]
    for clean_key in sorted(alias_keys, reverse=True):
        if clean_key not in request:
            continue

        original_value = request.pop(clean_key)
        object_aliases = aliases.get(f"{clean_key}{_OBJ_MARKER}", {})
        array_aliases = aliases.get(f"{clean_key}{_ARR_MARKER}", {})
        if object_aliases and isinstance(original_value, dict):
            original_value = restore_tool_arguments(
                request=original_value,
                aliases=object_aliases,
            )
        if array_aliases and isinstance(original_value, list):
            original_value = [
                restore_tool_arguments(item, array_aliases)
                if isinstance(item, dict)
                else item
                for item in original_value
            ]
        request[aliases.get(clean_key, clean_key)] = original_value
    return request


def substitute_reserved_python_keywords(
    schema: t.Dict,
) -> t.Tuple[dict, dict]:
    """Replace unsafe JSON schema property names with Python parameter aliases.

    Backward-compatible wrapper around :func:`alias_tool_input_schema`.
    """
    aliased = alias_tool_input_schema(schema=schema)
    return aliased.schema, aliased.aliases


def reinstate_reserved_python_keywords(
    request: dict,
    keywords: dict,
) -> dict:
    """Reverse the substitution performed by :func:`substitute_reserved_python_keywords`.

    Modifies *request* **in-place** and returns it.
    """
    return restore_tool_arguments(request=request, aliases=keywords)


def _coerce_default_value(
    default: t.Any,
    json_schema: t.Dict[str, t.Any],
) -> t.Any:
    """
    Coerce a default value to match the expected type from JSON schema.

    Handles common mismatches where string defaults should be boolean/int/float.
    This fixes issues where API returns stringified defaults like "true" instead of true.

    Coercion precedence: boolean > integer > float. This means values like "1" and "0"
    become booleans when both bool and int are expected types.

    :param default: The default value from the JSON schema.
    :param json_schema: The JSON schema property definition.
    :return: The coerced default value, or original if no coercion possible.
    """
    if default is None or not isinstance(default, str):
        return default

    # Collect expected types from schema
    expected_types: t.Set[t.Any] = set()

    if "type" in json_schema:
        py_type = PYDANTIC_TYPE_TO_PYTHON_TYPE.get(json_schema["type"])
        if py_type is not None:
            expected_types.add(py_type)

    for combiner in ("anyOf", "oneOf", "allOf"):
        for option in json_schema.get(combiner, []):
            if isinstance(option, dict):
                option_type = option.get("type")
                if isinstance(option_type, str):
                    py_type = PYDANTIC_TYPE_TO_PYTHON_TYPE.get(option_type)
                    if py_type is not None:
                        expected_types.add(py_type)

    # If string is expected, no coercion needed
    if str in expected_types:
        return default

    # Boolean coercion (takes precedence over int for "1"/"0")
    if bool in expected_types:
        lower_default = default.lower()
        if lower_default in ("true", "yes", "1"):
            return True
        if lower_default in ("false", "no", "0"):
            return False

    # Integer coercion
    if int in expected_types:
        try:
            return int(default)
        except ValueError:
            pass

    # Float coercion
    if float in expected_types:
        try:
            return float(default)
        except ValueError:
            pass

    return default


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

    # Coerce default value to match expected type from schema
    if default is not None:
        default = _coerce_default_value(default, json_schema)

    # Check if the field name is a reserved Pydantic name
    original_name = name
    if name in reserved_names:
        name = f"{name}_"
        alias = original_name
    else:
        alias = None

    field = {
        "description": description,
        "examples": examples,
        "alias": alias,
    }
    if not skip_default:
        field["default"] = ... if original_name in required else default

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
        prop_type = prop_info.get("type")
        prop_title = prop_info.get("title", prop_name).replace(" ", "")
        prop_default = prop_info.get("default", FALLBACK_VALUES.get(prop_type))
        if (
            prop_type is not None
            and prop_type in PYDANTIC_TYPE_TO_PYTHON_TYPE
            and prop_type not in CONTAINER_TYPE
        ):
            signature_prop_type = PYDANTIC_TYPE_TO_PYTHON_TYPE[prop_type]
        elif prop_type is None:
            # Schema uses anyOf/allOf/oneOf/$ref instead of a top-level "type" key.
            # Delegate to json_schema_to_pydantic_type which handles all combiners.
            signature_prop_type = t.cast(
                t.Type,
                json_schema_to_pydantic_type(json_schema=prop_info),
            )
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

        if prop_name in required_props:
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
