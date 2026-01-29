"""
JSON Schema to Pydantic type conversion using json-schema-to-pydantic library.

This module provides a wrapper around json-schema-to-pydantic that maintains
backwards compatibility with the existing json_schema_to_pydantic_type() API.

The library handles most JSON Schema features correctly, but doesn't support
boolean schemas (true/false values that are valid in JSON Schema draft-06+).
We handle those by pre-filtering them before passing to the library.
"""

import typing as t
from functools import reduce

from json_schema_to_pydantic import (  # type: ignore[import-untyped]
    create_model as create_model_from_schema,
    SchemaError,
    CombinerError,
)

from composio.utils.logging import get as get_logger

logger = get_logger(__name__)

# Type mapping for simple cases where we don't need full model creation
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


def _filter_boolean_schemas(
    schema: t.Union[t.Dict[str, t.Any], bool, t.List],
) -> t.Union[t.Dict[str, t.Any], t.Any, None]:
    """
    Pre-filter boolean schemas from anyOf/allOf/oneOf arrays.

    JSON Schema draft-06+ allows `true` and `false` as valid schemas:
    - `true` means "accept any value" (equivalent to {})
    - `false` means "reject all values" (equivalent to {"not": {}})

    The json-schema-to-pydantic library doesn't handle these, so we:
    - Replace `true` with {} (empty schema, accepts anything)
    - Filter out `false` (rejects everything, so no point including it)

    Returns None if the schema is a standalone `false` boolean.
    """
    if isinstance(schema, bool):
        if schema:
            # true -> empty schema (accepts any value)
            return {}
        else:
            # false -> reject all, return None to filter out
            return None

    if isinstance(schema, list):
        # Filter list items (e.g., for anyOf arrays)
        filtered = []
        for item in schema:
            result = _filter_boolean_schemas(item)
            if result is not None:
                filtered.append(result)
        return filtered if filtered else None

    if not isinstance(schema, dict):
        return schema

    # Make a copy to avoid mutating the original
    result = {}
    for key, value in schema.items():
        if key in ("anyOf", "allOf", "oneOf"):
            # Filter boolean schemas from combiner arrays
            filtered_value = _filter_boolean_schemas(value)
            if filtered_value is None or (
                isinstance(filtered_value, list) and len(filtered_value) == 0
            ):
                # All schemas were false, skip this combiner
                continue
            result[key] = filtered_value
        elif key == "items" and isinstance(value, (dict, bool)):
            # Handle array items schema
            filtered_items = _filter_boolean_schemas(value)
            if filtered_items is not None:
                result[key] = filtered_items
        elif key == "properties" and isinstance(value, dict):
            # Recursively filter property schemas
            filtered_props = {}
            for prop_name, prop_schema in value.items():
                filtered_prop = _filter_boolean_schemas(prop_schema)
                if filtered_prop is not None:
                    filtered_props[prop_name] = filtered_prop
            result[key] = filtered_props
        elif key in ("$defs", "definitions") and isinstance(value, dict):
            # Recursively filter definitions
            filtered_defs = {}
            for def_name, def_schema in value.items():
                filtered_def = _filter_boolean_schemas(def_schema)
                if filtered_def is not None:
                    filtered_defs[def_name] = filtered_def
            result[key] = filtered_defs
        else:
            result[key] = value

    return result


def json_schema_to_pydantic_type(
    json_schema: t.Union[t.Dict[str, t.Any], bool],
) -> t.Union[t.Type, t.Optional[t.Any]]:
    """
    Converts a JSON schema type to a Pydantic type.

    Uses json-schema-to-pydantic for complex schemas (anyOf, allOf, oneOf),
    falls back to simple type mapping for primitive types.

    :param json_schema: The JSON schema to convert (can be dict or boolean).
    :return: A Pydantic type.
    """
    # Handle boolean schemas (JSON Schema draft-06+)
    if isinstance(json_schema, bool):
        if json_schema:
            return t.Any  # true schema accepts any value
        else:
            return None  # false schema - will be filtered out in union processing

    # Pre-filter boolean schemas from combiners
    filtered_schema = _filter_boolean_schemas(json_schema)
    if filtered_schema is None:
        return str  # Fallback if all schemas were false

    # Handle simple primitive types without complex combiners
    if _is_simple_primitive(filtered_schema):
        return _convert_simple_type(filtered_schema)

    # Use library for complex schemas (anyOf, allOf, oneOf, nested objects)
    return _convert_with_library(filtered_schema)


def _is_simple_primitive(schema: t.Dict[str, t.Any]) -> bool:
    """Check if schema is a simple primitive without combiners."""
    has_combiners = any(k in schema for k in ("anyOf", "allOf", "oneOf"))
    has_properties = "properties" in schema
    schema_type = schema.get("type")

    return (
        not has_combiners
        and not has_properties
        and schema_type in PYDANTIC_TYPE_TO_PYTHON_TYPE
        and schema_type not in CONTAINER_TYPE
    )


def _convert_simple_type(schema: t.Dict[str, t.Any]) -> t.Type[t.Any]:
    """Convert simple primitive types directly."""
    type_ = schema.get("type", "string")
    return t.cast(t.Type[t.Any], PYDANTIC_TYPE_TO_PYTHON_TYPE.get(type_, str))


def _convert_with_library(
    schema: t.Dict[str, t.Any],
) -> t.Union[t.Type, t.Any]:
    """Use json-schema-to-pydantic for complex schema conversion."""
    try:
        # Handle top-level combiner without type (e.g., {"anyOf": [...]})
        if (
            any(k in schema for k in ("anyOf", "allOf", "oneOf"))
            and "type" not in schema
        ):
            return _handle_toplevel_combiner(schema)

        # For object schemas, create model directly
        if schema.get("type") == "object":
            if "title" not in schema:
                schema = {**schema, "title": "GeneratedModel"}
            return create_model_from_schema(
                schema,
                allow_undefined_array_items=True,
                allow_undefined_type=True,
            )

        # For array schemas
        if schema.get("type") == "array":
            items = schema.get("items")
            if items:
                item_type = json_schema_to_pydantic_type(items)
                return t.List[t.cast(t.Type, item_type)]  # type: ignore
            return t.List

        # Fallback to simple type
        return _convert_simple_type(schema)

    except (SchemaError, CombinerError) as e:
        logger.debug(f"Library schema conversion failed: {e}, falling back to string")
        return str
    except Exception as e:
        logger.debug(
            f"Unexpected error in schema conversion: {e}, falling back to string"
        )
        return str


def _handle_toplevel_combiner(
    schema: t.Dict[str, t.Any],
) -> t.Union[t.Type, t.Any]:
    """
    Handle top-level combiner schemas (anyOf, allOf, oneOf without "type").

    The library can handle these directly - it returns the appropriate type.
    """
    try:
        # Try direct conversion - library handles anyOf/oneOf/allOf at top level
        result = create_model_from_schema(
            schema,
            allow_undefined_array_items=True,
            allow_undefined_type=True,
        )
        # If result is a type (like a Union or Optional), return it directly
        # If result is a model class, return it
        return result
    except (SchemaError, CombinerError):
        pass
    except Exception:
        pass

    # Fallback: manually build union type for anyOf/oneOf
    if "anyOf" in schema or "oneOf" in schema:
        options = schema.get("anyOf", schema.get("oneOf", []))
        return _build_union_from_options(options)

    # Fallback: use first option for allOf
    if "allOf" in schema and schema["allOf"]:
        return json_schema_to_pydantic_type(schema["allOf"][0])

    return t.Any


def _build_union_from_options(options: t.List[t.Dict[str, t.Any]]) -> t.Type:
    """Build a Union type from a list of schema options."""
    pydantic_types = []
    null_type = PYDANTIC_TYPE_TO_PYTHON_TYPE.get("null")
    has_null = False

    for option in options:
        ptype = json_schema_to_pydantic_type(option)
        if ptype is None:
            continue
        if ptype == null_type or ptype is type(None):
            has_null = True
            continue
        pydantic_types.append(ptype)

    if len(pydantic_types) == 0:
        return str  # Fallback

    if len(pydantic_types) == 1:
        base_type = pydantic_types[0]
        if has_null:
            return t.Optional[t.cast(t.Type, base_type)]  # type: ignore
        return base_type

    # Build union
    cast_types = [t.cast(t.Type, ptype) for ptype in pydantic_types]
    union_type = reduce(lambda a, b: t.Union[a, b], cast_types)  # type: ignore
    if has_null:
        return t.Optional[union_type]  # type: ignore
    return union_type
