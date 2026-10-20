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

# Tool schemas come from the backend and may be arbitrarily deeply nested.
_MAX_SCHEMA_DEPTH = 64


# pylint: disable=unused-argument
def _handle_object_type(schema: t.Dict) -> t.Type:
    # Nested objects are not supported ATM
    return t.Dict[str, t.Any]


def _handle_array_type(schema: t.Dict, *, _depth: int = 0) -> t.Any:
    # This discards the nested objects
    SubT = _type_to_parameter(schema=schema.get("items", {}), _depth=_depth + 1)
    return t.List[SubT]  # type: ignore


def _handle_enum_type(schema: t.Dict) -> t.Any:
    return t.Literal[tuple(schema["enum"])]


def _type_to_parameter(schema: t.Dict[str, t.Any], *, _depth: int = 0) -> t.Any:
    if _depth >= _MAX_SCHEMA_DEPTH:
        return t.Any
    if "enum" in schema:
        return _handle_enum_type(schema=schema)

    p_type = schema.get("type")
    # Preserve the existing enum/type precedence for already-typed schemas.
    if p_type is None:
        if "oneOf" in schema:
            return _one_of_to_parameter(schema=schema, _depth=_depth)
        if "anyOf" in schema:
            return _any_of_to_parameter(schema=schema, _depth=_depth)
        if "allOf" in schema:
            return _all_of_to_parameter(schema=schema, _depth=_depth)
    if isinstance(p_type, list):
        # JSON Schema Draft 2020-12 / OpenAPI 3.1 express a nullable field as a
        # list of types, e.g. {"type": ["string", "null"]}, rather than an anyOf.
        if not p_type:
            return t.Any
        return t.Union[
            tuple(
                _type_to_parameter(schema={**schema, "type": member}, _depth=_depth + 1)
                for member in p_type
            )
        ]

    if p_type in OPENAPI_TO_PYTHON:
        return OPENAPI_TO_PYTHON[p_type]

    if p_type == "object":
        return _handle_object_type(schema=schema)

    if p_type == "array":
        return _handle_array_type(schema=schema, _depth=_depth)

    if p_type is None:
        # No type specified (e.g. a combiner option that is description-only or
        # an explicit Any), mirroring the top-level fallback below.
        return t.Any

    raise InvalidSchemaError(f"Invalid property type {p_type}: {schema!r}")


def _handle_composite_type(schemas: t.List[t.Dict], *, _depth: int = 0) -> t.Any:
    if not schemas:
        # An empty oneOf/anyOf has no options to union; fall back to Any.
        return t.Any
    return t.Union[
        tuple(
            _type_to_parameter(schema=schema, _depth=_depth + 1) for schema in schemas
        )
    ]


def _one_of_to_parameter(schema: t.Dict[str, t.Any], *, _depth: int = 0) -> t.Any:
    return _handle_composite_type(schemas=schema["oneOf"], _depth=_depth)


def _any_of_to_parameter(schema: t.Dict[str, t.Any], *, _depth: int = 0) -> t.Any:
    return _handle_composite_type(schemas=schema["anyOf"], _depth=_depth)


def _all_of_to_parameter(schema: t.Dict[str, t.Any], *, _depth: int = 0) -> t.Type:
    composite = {}
    for subschema in schema["allOf"]:
        composite.update(subschema)
    return _type_to_parameter(schema=composite, _depth=_depth + 1)


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
            # Handle cases where no type is specified (e.g., Pydantic's Any type)
            # This typically happens when using typing.Any in Pydantic models,
            # which intentionally omits the 'type' field in JSON schema
            p_type = t.Any

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
