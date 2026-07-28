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

from json_schema_to_pydantic import (
    CombinerError,
    SchemaError,
    create_model as create_model_from_schema,
)
from pydantic import Field, create_model as create_pydantic_model
from pydantic_core import core_schema

from composio.utils.logging import get as get_logger

logger = get_logger(__name__)


class _UnsatisfiableSchema:
    """Pydantic type for JSON schemas that reject every value."""

    @staticmethod
    def _reject(_value: t.Any) -> t.NoReturn:
        raise ValueError("schema is unsatisfiable (JSON Schema `false`)")

    @classmethod
    def __get_pydantic_core_schema__(
        cls,
        _source_type: t.Any,
        _handler: t.Any,
    ) -> core_schema.CoreSchema:
        return core_schema.no_info_plain_validator_function(cls._reject)

    @classmethod
    def __get_pydantic_json_schema__(
        cls,
        _core_schema: core_schema.CoreSchema,
        _handler: t.Any,
    ) -> t.Dict[str, t.Any]:
        return {"not": {}}


def _is_unsatisfiable_schema(schema: t.Any) -> bool:
    return schema is _UnsatisfiableSchema


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
) -> t.Any:
    """
    Pre-filter boolean schemas from anyOf/allOf/oneOf arrays.

    JSON Schema draft-06+ allows `true` and `false` as valid schemas:
    - `true` means "accept any value" (equivalent to {})
    - `false` means "reject all values" (equivalent to {"not": {}})

    The json-schema-to-pydantic library doesn't handle these, so we:
    - Replace `true` with {} (empty schema, accepts anything)
    - Drop `false` from union combiners (`anyOf`/`oneOf`)
    - Propagate an unsatisfiable marker through conjunctions and nested schemas

    `None` remains the standalone-`false` filter sentinel for compatibility.
    Composed schemas use `_UnsatisfiableSchema` so callers can distinguish
    "drop this union branch" from "reject every value."
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
            if result is not None and not _is_unsatisfiable_schema(result):
                filtered.append(result)
        return filtered if filtered else None

    if not isinstance(schema, dict):
        return schema

    # Make a copy to avoid mutating the original
    result = {}
    for key, value in schema.items():
        if key == "allOf" and isinstance(value, list):
            filtered_members = [_filter_boolean_schemas(member) for member in value]
            if any(
                member is None or _is_unsatisfiable_schema(member)
                for member in filtered_members
            ):
                return _UnsatisfiableSchema
            result[key] = filtered_members
        elif key in ("anyOf", "oneOf") and isinstance(value, list):
            filtered_members = []
            for member in value:
                filtered_member = _filter_boolean_schemas(member)
                if filtered_member is not None and not _is_unsatisfiable_schema(
                    filtered_member
                ):
                    filtered_members.append(filtered_member)
            if not filtered_members:
                return _UnsatisfiableSchema
            result[key] = filtered_members
        elif key == "items" and isinstance(value, (dict, bool)):
            # Handle array items schema
            filtered_items = _filter_boolean_schemas(value)
            result[key] = (
                _UnsatisfiableSchema if filtered_items is None else filtered_items
            )
        elif key == "properties" and isinstance(value, dict):
            # Recursively filter property schemas
            filtered_props = {}
            for prop_name, prop_schema in value.items():
                filtered_prop = _filter_boolean_schemas(prop_schema)
                filtered_props[prop_name] = (
                    _UnsatisfiableSchema if filtered_prop is None else filtered_prop
                )
            result[key] = filtered_props
        elif key in ("$defs", "definitions") and isinstance(value, dict):
            # Recursively filter definitions
            filtered_defs = {}
            for def_name, def_schema in value.items():
                filtered_def = _filter_boolean_schemas(def_schema)
                filtered_defs[def_name] = (
                    _UnsatisfiableSchema if filtered_def is None else filtered_def
                )
            result[key] = filtered_defs
        else:
            result[key] = value

    return result


def _resolve_unsatisfiable_references(schema: t.Any) -> t.Any:
    """Replace local references to unsatisfiable definitions with the marker."""
    if not isinstance(schema, dict):
        return schema

    unsatisfiable_refs = set()
    for definitions_key in ("$defs", "definitions"):
        definitions = schema.get(definitions_key)
        if not isinstance(definitions, dict):
            continue
        for name, definition in definitions.items():
            if _is_unsatisfiable_schema(definition):
                unsatisfiable_refs.add(f"#/{definitions_key}/{name}")

    if not unsatisfiable_refs:
        return schema

    def replace(value: t.Any) -> t.Any:
        if isinstance(value, list):
            return [replace(item) for item in value]
        if not isinstance(value, dict):
            return value
        if value.get("$ref") in unsatisfiable_refs:
            return _UnsatisfiableSchema

        replaced = {}
        for key, item in value.items():
            if key in ("$defs", "definitions") and isinstance(item, dict):
                replaced[key] = {
                    name: replace(definition)
                    for name, definition in item.items()
                    if not _is_unsatisfiable_schema(definition)
                }
            else:
                replaced[key] = replace(item)
        return replaced

    return replace(schema)


def _contains_unsatisfiable_schema(schema: t.Any) -> bool:
    if _is_unsatisfiable_schema(schema):
        return True
    if isinstance(schema, list):
        return any(_contains_unsatisfiable_schema(item) for item in schema)
    if isinstance(schema, dict):
        return any(_contains_unsatisfiable_schema(value) for value in schema.values())
    return False


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
    filtered_schema = _resolve_unsatisfiable_references(filtered_schema)
    return _filtered_schema_to_pydantic_type(filtered_schema)


def _filtered_schema_to_pydantic_type(schema: t.Any) -> t.Type[t.Any]:
    """Convert a schema after boolean-schema normalization."""
    if schema is None or _is_unsatisfiable_schema(schema):
        return _UnsatisfiableSchema

    # Handle simple primitive types without complex combiners
    if _is_simple_primitive(schema):
        return _convert_simple_type(schema)

    # Use library for complex schemas (anyOf, allOf, oneOf, nested objects)
    return _convert_with_library(schema)


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


def _convert_object_with_unsatisfiable_properties(
    schema: t.Dict[str, t.Any],
) -> t.Type[t.Any]:
    """Build an object model while retaining always-rejecting properties."""
    properties = schema.get("properties", {})
    required = set(schema.get("required", []))
    rejecting_properties = {
        name: prop_schema
        for name, prop_schema in properties.items()
        if _contains_unsatisfiable_schema(prop_schema)
    }
    ordinary_properties = {
        name: prop_schema
        for name, prop_schema in properties.items()
        if name not in rejecting_properties
    }

    model_name = schema.get("title", "GeneratedModel")
    base_schema = {
        **schema,
        "title": model_name,
        "properties": ordinary_properties,
        "required": [
            name for name in schema.get("required", []) if name in ordinary_properties
        ],
    }
    base_model = create_model_from_schema(
        base_schema,
        allow_undefined_array_items=True,
        allow_undefined_type=True,
    )

    field_definitions = {}
    for name, prop_schema in rejecting_properties.items():
        annotation = _filtered_schema_to_pydantic_type(prop_schema)
        default = (
            ...
            if name in required
            else prop_schema.get("default")
            if isinstance(prop_schema, dict)
            else None
        )
        field_kwargs = {}
        if isinstance(prop_schema, dict):
            for metadata_key in ("description", "examples", "title"):
                if metadata_key in prop_schema:
                    field_kwargs[metadata_key] = prop_schema[metadata_key]
        field_definitions[name] = (
            annotation,
            Field(default, **field_kwargs),
        )

    return create_pydantic_model(  # type: ignore[call-overload]
        model_name,
        __base__=base_model,
        **field_definitions,
    )


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
            if _contains_unsatisfiable_schema(schema.get("properties", {})):
                return _convert_object_with_unsatisfiable_properties(schema)
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
            if _is_unsatisfiable_schema(items):
                return t.List[_UnsatisfiableSchema]  # type: ignore[return-value]
            if items:
                item_type = _filtered_schema_to_pydantic_type(items)
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
        if result is type(None):
            return t.Optional[t.Any]
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
        return t.Optional[t.Any] if has_null else _UnsatisfiableSchema  # type: ignore

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
