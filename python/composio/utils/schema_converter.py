"""
JSON Schema to Pydantic type conversion using json-schema-to-pydantic library.

This module provides a wrapper around json-schema-to-pydantic that maintains
backwards compatibility with the existing json_schema_to_pydantic_type() API.

The library handles most JSON Schema features correctly, but doesn't support
boolean schemas (true/false values that are valid in JSON Schema draft-06+).
We handle those by pre-filtering them before passing to the library.
"""

import re
import typing as t
from functools import reduce

from json_schema_to_pydantic import (
    CombinerError,
    SchemaError,
    create_model as create_model_from_schema,
)
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    TypeAdapter,
    create_model as create_pydantic_model,
    model_validator,
)
from pydantic_core import core_schema

from composio.utils.logging import get as get_logger

logger = get_logger(__name__)

_MISSING = object()


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


_PRIMITIVE_TYPES = frozenset({"string", "number", "integer", "boolean", "null"})

# JSON Schema keyword -> Pydantic `Field` constraint, by instance type. Simple
# primitives lose their constraints in `PYDANTIC_TYPE_TO_PYTHON_TYPE`, which is
# fine for declared fields the library models but not for dynamic keys, where
# this module is the only validator.
_CONSTRAINTS: t.Dict[str, t.Dict[str, str]] = {
    "string": {
        "minLength": "min_length",
        "maxLength": "max_length",
        "pattern": "pattern",
    },
    "array": {"minItems": "min_length", "maxItems": "max_length"},
}
_NUMERIC_CONSTRAINTS = {
    "minimum": "ge",
    "maximum": "le",
    "exclusiveMinimum": "gt",
    "exclusiveMaximum": "lt",
    "multipleOf": "multiple_of",
}
_CONSTRAINTS["number"] = _NUMERIC_CONSTRAINTS
_CONSTRAINTS["integer"] = _NUMERIC_CONSTRAINTS


class _DynamicKeyValidator(t.NamedTuple):
    """Validator for one dynamic-key schema, plus how strictly to apply it."""

    adapter: TypeAdapter
    strict: bool

    def coerce(self, value: t.Any) -> t.Any:
        return self.adapter.dump_python(
            self.adapter.validate_python(value, strict=self.strict)
        )


class _ObjectPolicy(t.NamedTuple):
    """Compiled dynamic-key policy for one JSON Schema object node.

    This is the single place the covered object contract lives, so
    ``json_schema_to_model`` and ``json_schema_to_pydantic_type`` cannot drift
    apart on which keys are accepted, validated, or preserved.
    """

    declared: t.FrozenSet[str]
    patterns: t.Tuple[t.Tuple[t.Pattern[str], t.Optional[_DynamicKeyValidator]], ...]
    additional: t.Optional[_DynamicKeyValidator]
    rejects_unmatched: bool

    @property
    def is_trivial(self) -> bool:
        """No dynamic keys to police and nothing to reject."""
        return (
            not self.patterns and not self.rejects_unmatched and self.additional is None
        )


def object_is_open(schema: t.Dict[str, t.Any]) -> bool:
    """Whether an object schema accepts arbitrary keys it says nothing about.

    An object is open when it declares no named properties and either omits
    ``additionalProperties`` or sets it to ``true``. Objects that *do* name
    properties stay strict on omission, matching the TypeScript converters.
    """
    additional = schema.get("additionalProperties", _MISSING)
    return not (schema.get("properties") or {}) and additional in (_MISSING, True)


def _dynamic_key_validator(schema: t.Any) -> t.Optional[_DynamicKeyValidator]:
    """Build the validator for one dynamic-key schema, or ``None`` if unmodellable."""
    try:
        annotation: t.Any = json_schema_to_pydantic_type(schema)
        strict = False

        if isinstance(schema, dict):
            schema_type = schema.get("type") or ""
            constraints = {
                field: schema[keyword]
                for keyword, field in _CONSTRAINTS.get(schema_type, {}).items()
                if keyword in schema
            }
            if constraints:
                annotation = t.Annotated[annotation, Field(**constraints)]
            # Primitives validate strictly so Pydantic's lax coercion cannot
            # admit a value the TypeScript converters reject (`true` as a
            # number, `1` as a boolean).
            strict = schema_type in _PRIMITIVE_TYPES

        return _DynamicKeyValidator(TypeAdapter(annotation), strict)
    except Exception as exc:  # pragma: no cover - defensive
        logger.debug(f"Could not build a dynamic-key validator for {schema!r}: {exc}")
        return None


def _compile_object_policy(schema: t.Dict[str, t.Any]) -> _ObjectPolicy:
    declared = frozenset(schema.get("properties") or {})
    additional = schema.get("additionalProperties", _MISSING)

    patterns = []
    for pattern, pattern_schema in (schema.get("patternProperties") or {}).items():
        try:
            patterns.append(
                (re.compile(pattern), _dynamic_key_validator(pattern_schema))
            )
        except re.error:
            logger.debug(f"Skipping uncompilable patternProperties regex: {pattern!r}")

    return _ObjectPolicy(
        declared=declared,
        patterns=tuple(patterns),
        additional=(
            _dynamic_key_validator(additional) if isinstance(additional, dict) else None
        ),
        rejects_unmatched=additional is False
        or (additional is _MISSING and bool(declared)),
    )


class _DynamicObjectModel(BaseModel):
    """Base for object models that must police and preserve dynamic keys.

    ``extra="allow"`` is what makes preservation possible at all: Pydantic's
    default silently discards accepted arguments, so a provider that re-reads
    them (``LangchainProvider`` uses ``getattr``) would lose valid payloads.
    Coerced values are written back into ``__pydantic_extra__`` so they show up
    in ``model_dump()`` and remain readable as attributes.
    """

    model_config = ConfigDict(extra="allow")

    @model_validator(mode="after")
    def _apply_object_policy(self):
        policy: t.Optional[_ObjectPolicy] = getattr(
            type(self), "__composio_object_policy__", None
        )
        if policy is None or policy.is_trivial:
            return self

        # A key declared in `properties` is still checked against every matching
        # pattern; its declared value is authoritative and is not overwritten.
        for name, field in type(self).model_fields.items():
            if name not in self.model_fields_set:
                continue
            key = field.alias or name
            for regex, validator in policy.patterns:
                if validator is not None and regex.search(key):
                    validator.coerce(getattr(self, name))

        extra = self.__pydantic_extra__
        if not extra:
            return self

        unrecognized = []
        for key, value in list(extra.items()):
            matched = False
            for regex, validator in policy.patterns:
                if regex.search(key):
                    matched = True
                    if validator is not None:
                        extra[key] = validator.coerce(value)

            if matched or key in policy.declared:
                continue

            if policy.rejects_unmatched:
                unrecognized.append(key)
            elif policy.additional is not None:
                extra[key] = policy.additional.coerce(value)

        if unrecognized:
            raise ValueError(
                f"Unrecognized key(s) in object: {', '.join(repr(key) for key in unrecognized)}"
            )

        return self


def apply_object_policy(
    schema: t.Dict[str, t.Any],
    base_model: t.Type[BaseModel],
    model_name: t.Optional[str] = None,
) -> t.Type[BaseModel]:
    """Wrap ``base_model`` with the covered dynamic-key policy for ``schema``."""
    policy = _compile_object_policy(schema)
    name = model_name or base_model.__name__

    return t.cast(
        t.Type[BaseModel],
        type(
            name,
            (_DynamicObjectModel, base_model),
            {
                "__module__": __name__,
                "__qualname__": name,
                "model_config": ConfigDict(extra="allow"),
                "__composio_object_policy__": policy,
            },
        ),
    )


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
            # A property-less object with no dynamic-key constraints accepts and
            # preserves arbitrary content. Modelling it as an empty Pydantic
            # model instead silently discarded every key (issue #4064).
            if object_is_open(schema) and not schema.get("patternProperties"):
                return t.cast(t.Type, t.Dict[str, t.Any])
            if "title" not in schema:
                schema = {**schema, "title": "GeneratedModel"}
            return apply_object_policy(
                schema,
                create_model_from_schema(
                    schema,
                    allow_undefined_array_items=True,
                    allow_undefined_type=True,
                ),
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
