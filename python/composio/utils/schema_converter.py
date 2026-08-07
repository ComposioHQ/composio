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
from urllib.parse import unquote

from json_schema_to_pydantic import (
    CombinerError,
    SchemaError,
)
from json_schema_to_pydantic import (
    create_model as create_model_from_schema,
)
from jsonschema import validators as jsonschema_validators
from jsonschema.protocols import Validator
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    TypeAdapter,
    model_validator,
)
from pydantic import (
    create_model as create_pydantic_model,
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


class _DynamicKeyValidator(t.NamedTuple):
    """Exact JSON Schema validation with optional default materialization."""

    validator: Validator
    materializer: t.Optional[TypeAdapter]

    def validate(self, value: t.Any) -> None:
        error = next(self.validator.iter_errors(value), None)
        if error is not None:
            raise ValueError(error.message)

    def materialize(self, value: t.Any) -> t.Any:
        if self.materializer is None:
            return value
        try:
            return self.materializer.dump_python(
                self.materializer.validate_python(value)
            )
        except (TypeError, ValueError):
            # JSON Schema alone decides acceptance. Pydantic is only retained
            # for the existing default-materialization behavior, and an
            # incomplete Pydantic representation must not reject valid input.
            logger.debug("Could not materialize dynamic-key defaults; preserving input")
            return value


class _ObjectPolicy(t.NamedTuple):
    """Compiled dynamic-key policy for one JSON Schema object node.

    This is the single place the covered object contract lives, so
    ``json_schema_to_model`` and ``json_schema_to_pydantic_type`` cannot drift
    apart on which keys are accepted, validated, or preserved.
    """

    declared: t.FrozenSet[str]
    patterns: t.Tuple[t.Tuple[t.Pattern[str], _DynamicKeyValidator], ...]
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


def _contains_default(schema: t.Any) -> bool:
    """Whether Pydantic must run after validation to materialize a default."""
    if isinstance(schema, list):
        return any(_contains_default(item) for item in schema)
    if not isinstance(schema, dict):
        return False
    return "default" in schema or any(
        _contains_default(value) for value in schema.values()
    )


def _resolve_local_json_pointer(
    reference: str,
    root_schema: t.Dict[str, t.Any],
) -> t.Any:
    """Resolve a local JSON Pointer or fail while the model is constructed."""
    if reference == "#":
        return root_schema
    if not reference.startswith("#/"):
        raise ValueError(
            f"Dynamic-key schema reference {reference!r} must be a local JSON Pointer"
        )

    current: t.Any = root_schema
    for raw_token in unquote(reference[2:]).split("/"):
        token = raw_token.replace("~1", "/").replace("~0", "~")
        if isinstance(current, dict) and token in current:
            current = current[token]
            continue
        if isinstance(current, list):
            try:
                current = current[int(token)]
                continue
            except (ValueError, IndexError):
                pass
        raise ValueError(f"Unresolvable dynamic-key schema reference: {reference!r}")
    return current


# Draft 7 keywords whose value is itself a schema. `items` and `dependencies`
# are handled separately because they also accept non-schema forms.
_SCHEMA_VALUED_KEYWORDS = frozenset(
    {
        "additionalItems",
        "additionalProperties",
        "contains",
        "else",
        "if",
        "not",
        "propertyNames",
        "then",
    }
)

# Draft 7 keywords whose value is a list of schemas.
_SCHEMA_LIST_KEYWORDS = frozenset({"allOf", "anyOf", "oneOf"})

# Draft 7 keywords whose value maps names to schemas.
_SCHEMA_MAP_KEYWORDS = frozenset(
    {"$defs", "definitions", "patternProperties", "properties"}
)


def _check_dynamic_references(
    schema: t.Any,
    root_schema: t.Dict[str, t.Any],
    checked_references: t.Optional[t.Set[str]] = None,
) -> None:
    """Reject external, anchored, and unresolved references before validation.

    Only schema positions are walked. ``const``, ``default``, ``enum``, and
    ``examples`` hold instance data, so a ``$ref``-shaped value stored there is
    a payload rather than a reference and must not block tool wrapping.
    """
    if checked_references is None:
        checked_references = set()
    if isinstance(schema, list):
        for item in schema:
            _check_dynamic_references(item, root_schema, checked_references)
        return
    if not isinstance(schema, dict):
        return

    reference = schema.get("$ref")
    if reference is not None:
        if not isinstance(reference, str):
            raise ValueError("Dynamic-key schema `$ref` must be a string")
        resolved = _resolve_local_json_pointer(reference, root_schema)
        if not isinstance(resolved, (dict, bool)):
            raise ValueError(
                f"Dynamic-key schema reference {reference!r} does not target a schema"
            )
        if reference not in checked_references:
            checked_references.add(reference)
            _check_dynamic_references(resolved, root_schema, checked_references)

    for keyword, value in schema.items():
        if keyword in _SCHEMA_VALUED_KEYWORDS or keyword in _SCHEMA_LIST_KEYWORDS:
            _check_dynamic_references(value, root_schema, checked_references)
        elif keyword in _SCHEMA_MAP_KEYWORDS:
            if isinstance(value, dict):
                for entry in value.values():
                    _check_dynamic_references(entry, root_schema, checked_references)
        elif keyword == "items":
            # A schema, or a list of schemas for tuple validation.
            _check_dynamic_references(value, root_schema, checked_references)
        elif keyword == "dependencies":
            # Each entry is either a schema or a list of required property names.
            if isinstance(value, dict):
                for entry in value.values():
                    if isinstance(entry, (dict, bool)):
                        _check_dynamic_references(
                            entry, root_schema, checked_references
                        )


def _dynamic_key_validator(
    schema: t.Any,
    root_schema: t.Dict[str, t.Any],
    root_validator: Validator,
) -> _DynamicKeyValidator:
    """Compile a complete inline JSON subschema without coercive acceptance."""
    validator_type = type(root_validator)
    validator_type.check_schema(schema)
    _check_dynamic_references(schema, root_schema)

    materializer = None
    if _contains_default(schema):
        annotation = json_schema_to_pydantic_type(schema, root_schema=root_schema)
        materializer = TypeAdapter(annotation)

    return _DynamicKeyValidator(
        validator=root_validator.evolve(schema=schema),
        materializer=materializer,
    )


def _compile_object_policy(
    schema: t.Dict[str, t.Any],
    root_schema: t.Optional[t.Dict[str, t.Any]] = None,
) -> _ObjectPolicy:
    document_root = root_schema if root_schema is not None else schema
    declared = frozenset(schema.get("properties") or {})
    additional = schema.get("additionalProperties", _MISSING)
    validator_type = jsonschema_validators.validator_for(
        document_root,
        default=jsonschema_validators.Draft7Validator,
    )
    root_validator = validator_type(document_root)

    patterns = []
    for pattern, pattern_schema in (schema.get("patternProperties") or {}).items():
        try:
            patterns.append(
                (
                    re.compile(pattern),
                    _dynamic_key_validator(
                        pattern_schema,
                        document_root,
                        root_validator,
                    ),
                )
            )
        except re.error as exc:
            raise ValueError(
                f"Invalid patternProperties regular expression: {pattern!r}"
            ) from exc

    return _ObjectPolicy(
        declared=declared,
        patterns=tuple(patterns),
        additional=(
            _dynamic_key_validator(additional, document_root, root_validator)
            if isinstance(additional, dict)
            else None
        ),
        rejects_unmatched=additional is False
        or (additional is _MISSING and bool(declared)),
    )


class _DynamicObjectModel(BaseModel):
    """Base for object models that must police and preserve dynamic keys.

    ``extra="allow"`` is what makes preservation possible at all: Pydantic's
    default silently discards accepted arguments, so a provider that re-reads
    them (``LangchainProvider`` uses ``getattr``) would lose valid payloads.
    Materialized defaults are written back into ``__pydantic_extra__`` so they
    show up in ``model_dump()`` and remain readable as attributes.
    """

    model_config = ConfigDict(extra="allow")

    @model_validator(mode="before")
    @classmethod
    def _validate_object_policy(cls, value: t.Any) -> t.Any:
        policy: t.Optional[_ObjectPolicy] = getattr(
            cls, "__composio_object_policy__", None
        )
        if policy is None or policy.is_trivial or not isinstance(value, dict):
            return value

        unrecognized = []
        for key, item in value.items():
            matched = False
            for regex, validator in policy.patterns:
                if regex.search(key):
                    matched = True
                    validator.validate(item)

            if matched or key in policy.declared:
                continue

            if policy.rejects_unmatched:
                unrecognized.append(key)
            elif policy.additional is not None:
                policy.additional.validate(item)

        if unrecognized:
            raise ValueError(
                f"Unrecognized key(s) in object: {', '.join(repr(key) for key in unrecognized)}"
            )

        return value

    @model_validator(mode="after")
    def _materialize_dynamic_defaults(self):
        policy: t.Optional[_ObjectPolicy] = getattr(
            type(self), "__composio_object_policy__", None
        )
        if policy is None or policy.is_trivial:
            return self

        extra = self.__pydantic_extra__
        if not extra:
            return self

        for key, value in list(extra.items()):
            matched = False
            for regex, validator in policy.patterns:
                if regex.search(key):
                    matched = True
                    extra[key] = validator.materialize(extra[key])

            if matched or key in policy.declared:
                continue

            if policy.additional is not None:
                extra[key] = policy.additional.materialize(value)

        return self


def apply_object_policy(
    schema: t.Dict[str, t.Any],
    base_model: t.Type[BaseModel],
    model_name: t.Optional[str] = None,
    *,
    root_schema: t.Optional[t.Dict[str, t.Any]] = None,
) -> t.Type[BaseModel]:
    """Wrap ``base_model`` with the covered dynamic-key policy for ``schema``."""
    policy = _compile_object_policy(schema, root_schema)
    name = model_name or base_model.__name__
    json_schema_extra: t.Dict[str, t.Any] = {}
    if "patternProperties" in schema:
        json_schema_extra["patternProperties"] = schema["patternProperties"]
    if "additionalProperties" in schema:
        json_schema_extra["additionalProperties"] = schema["additionalProperties"]
    elif policy.rejects_unmatched:
        json_schema_extra["additionalProperties"] = False

    return t.cast(
        t.Type[BaseModel],
        type(
            name,
            (_DynamicObjectModel, base_model),
            {
                "__module__": __name__,
                "__qualname__": name,
                "model_config": ConfigDict(
                    extra="allow",
                    json_schema_extra=json_schema_extra,
                ),
                "__composio_object_policy__": policy,
            },
        ),
    )


def json_schema_to_pydantic_type(
    json_schema: t.Union[t.Dict[str, t.Any], bool],
    *,
    root_schema: t.Optional[t.Dict[str, t.Any]] = None,
) -> t.Union[t.Type, t.Optional[t.Any]]:
    """
    Converts a JSON schema type to a Pydantic type.

    Uses json-schema-to-pydantic for complex schemas (anyOf, allOf, oneOf),
    falls back to simple type mapping for primitive types.

    :param json_schema: The JSON schema to convert (can be dict or boolean).
    :param root_schema: Full schema document used to resolve nested local references.
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
    document_root = root_schema if root_schema is not None else json_schema
    return _filtered_schema_to_pydantic_type(
        filtered_schema,
        root_schema=document_root,
    )


def _filtered_schema_to_pydantic_type(
    schema: t.Any,
    *,
    root_schema: t.Optional[t.Dict[str, t.Any]] = None,
) -> t.Type[t.Any]:
    """Convert a schema after boolean-schema normalization."""
    if schema is None or _is_unsatisfiable_schema(schema):
        return _UnsatisfiableSchema

    # Handle simple primitive types without complex combiners
    if _is_simple_primitive(schema):
        return _convert_simple_type(schema)

    # Use library for complex schemas (anyOf, allOf, oneOf, nested objects)
    return _convert_with_library(schema, root_schema=root_schema)


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
    *,
    root_schema: t.Optional[t.Dict[str, t.Any]] = None,
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
        annotation = _filtered_schema_to_pydantic_type(
            prop_schema,
            root_schema=root_schema,
        )
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
    *,
    root_schema: t.Optional[t.Dict[str, t.Any]] = None,
) -> t.Union[t.Type, t.Any]:
    """Use json-schema-to-pydantic for complex schema conversion."""
    try:
        # Handle top-level combiner without type (e.g., {"anyOf": [...]})
        if (
            any(k in schema for k in ("anyOf", "allOf", "oneOf"))
            and "type" not in schema
        ):
            return _handle_toplevel_combiner(schema, root_schema=root_schema)

        # For object schemas, create model directly
        if schema.get("type") == "object":
            if _contains_unsatisfiable_schema(schema.get("properties", {})):
                return _convert_object_with_unsatisfiable_properties(
                    schema,
                    root_schema=root_schema,
                )
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
                root_schema=root_schema,
            )

        # For array schemas
        if schema.get("type") == "array":
            items = schema.get("items")
            if _is_unsatisfiable_schema(items):
                return t.List[_UnsatisfiableSchema]  # type: ignore[return-value]
            if items:
                item_type = _filtered_schema_to_pydantic_type(
                    items,
                    root_schema=root_schema,
                )
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
    *,
    root_schema: t.Optional[t.Dict[str, t.Any]] = None,
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
        return _build_union_from_options(options, root_schema=root_schema)

    # Fallback: use first option for allOf
    if "allOf" in schema and schema["allOf"]:
        return json_schema_to_pydantic_type(
            schema["allOf"][0],
            root_schema=root_schema,
        )

    return t.Any


def _build_union_from_options(
    options: t.List[t.Dict[str, t.Any]],
    *,
    root_schema: t.Optional[t.Dict[str, t.Any]] = None,
) -> t.Type:
    """Build a Union type from a list of schema options."""
    pydantic_types = []
    null_type = PYDANTIC_TYPE_TO_PYTHON_TYPE.get("null")
    has_null = False

    for option in options:
        ptype = json_schema_to_pydantic_type(option, root_schema=root_schema)
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
