"""OpenAPI helpers."""

import inspect
import typing as t

from composio.exceptions import InvalidSchemaError


OPENAPI_TO_PYTHON = {
    "null": None,
    "number": float,
    "integer": int,
    "boolean": bool,
    "string": str,
}


# pylint: disable=unused-argument
def _handle_object_type(schema: t.Dict) -> t.Type:
    # Nested objects are not supported ATM
    return t.Dict[str, t.Any]


def _handle_array_type(schema: t.Dict) -> t.Any:
    # This discards the nested objects
    items_type = schema.get("items", {}).get("type")
    if items_type is None:
        return t.List[t.Any]

    SubT = _type_to_parameter(schema=schema.get("items", {}))
    return t.List[SubT]  # type: ignore


def _handle_enum_type(schema: t.Dict) -> t.Any:
    return t.Literal[tuple(schema["enum"])]


def _type_to_parameter(schema: t.Dict[str, t.Any]) -> t.Any:
    if "enum" in schema:
        return _handle_enum_type(schema=schema)

    p_type = schema["type"]
    if p_type in OPENAPI_TO_PYTHON:
        return OPENAPI_TO_PYTHON[p_type]

    if p_type == "object":
        return _handle_object_type(schema=schema)

    if p_type == "array":
        return _handle_array_type(schema=schema)

    raise InvalidSchemaError(f"Invalid property type {p_type}: {schema!r}")


def _handle_composite_type(schemas: t.List[t.Dict]) -> t.Any:
    return t.Union[tuple(map(_type_to_parameter, schemas))]


def _one_of_to_parameter(schema: t.Dict[str, t.Any]) -> t.Any:
    return _handle_composite_type(schemas=schema["oneOf"])


def _any_of_to_parameter(schema: t.Dict[str, t.Any]) -> t.Any:
    return _handle_composite_type(schemas=schema["anyOf"])


def _all_of_to_parameter(schema: t.Dict[str, t.Any]) -> t.Type:
    composite = {}
    for subschema in schema["allOf"]:
        composite.update(subschema)
    return _type_to_parameter(schema=composite)


def function_signature_from_jsonschema(
    schema: t.Dict[str, t.Any],
    skip_default: bool = False,
) -> t.List[inspect.Parameter]:
    """Convert json schema to a list of parameters (`inspect.Parameter`)."""
    parameters = []
    required = set(schema.get("required", []))
    for p_name, p_schema in schema.get("properties", {}).items():
        if "oneOf" in p_schema:
            p_type = _one_of_to_parameter(schema=p_schema)
        elif "anyOf" in p_schema:
            p_type = _any_of_to_parameter(schema=p_schema)
        elif "allOf" in p_schema:
            p_type = _all_of_to_parameter(schema=p_schema)
        elif "type" in p_schema:
            p_type = _type_to_parameter(schema=p_schema)
        else:
            raise InvalidSchemaError(f"Invalid property object {p_name}: {p_schema!r}")

        p_val = p_schema.get("default", None)
        if p_name in required or p_schema.get("required", False) or skip_default:
            p_val = inspect.Parameter.empty

        parameters.append(
            inspect.Parameter(
                name=p_name,
                annotation=p_type,
                default=p_val,
                kind=inspect.Parameter.POSITIONAL_OR_KEYWORD,
            )
        )

    return parameters
