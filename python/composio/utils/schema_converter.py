"""
JSON Schema to Pydantic type conversion using json-schema-to-pydantic library.

This module provides a wrapper around json-schema-to-pydantic that maintains
backwards compatibility with the existing json_schema_to_pydantic_type() API.

The library handles most JSON Schema features correctly, but doesn't support
boolean schemas (true/false values that are valid in JSON Schema draft-06+).
We handle those by pre-filtering them before passing to the library.
"""

import decimal
import re
import types
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
from jsonschema import exceptions as jsonschema_exceptions
from jsonschema import validators as jsonschema_validators
from jsonschema.protocols import Validator
from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    TypeAdapter,
    ValidationError,
    model_validator,
)
from pydantic import (
    create_model as create_pydantic_model,
)
from pydantic_core import core_schema
from referencing import Registry

from composio.utils.logging import get as get_logger

logger = get_logger(__name__)

_MISSING = object()
_EXPLICIT_DEFAULT_FIELDS_ATTRIBUTE = "__composio_explicit_default_fields__"


class _UnsatisfiableSchema:
    """Pydantic type for JSON schemas that reject every value.

    JSON Schema (draft-06+) allows the literal ``false`` anywhere a schema is
    expected, meaning "no value is valid". This marker stands in for it during
    conversion so combiners can tell an always-rejecting member apart from an
    absent one, and so the exact validator can turn it back into ``false``.
    The literal ``true`` ("any value is valid") simply becomes ``t.Any``.
    """

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
    "null": type(None),
}

CONTAINER_TYPE = ("array", "object")

# Keywords that constrain which instances a schema accepts. A schema whose keys
# are all outside this set (title, description, default, examples, ...) is pure
# annotation and accepts every value, exactly like the empty schema.
_ASSERTION_KEYWORDS = frozenset(
    {
        "type",
        "enum",
        "const",
        "anyOf",
        "allOf",
        "oneOf",
        "not",
        "if",
        "then",
        "else",
        "$ref",
        "properties",
        "patternProperties",
        "additionalProperties",
        "propertyNames",
        "required",
        "dependencies",
        "minProperties",
        "maxProperties",
        "items",
        "additionalItems",
        "contains",
        "minItems",
        "maxItems",
        "uniqueItems",
        "minLength",
        "maxLength",
        "pattern",
        "minimum",
        "maximum",
        "exclusiveMinimum",
        "exclusiveMaximum",
        "multipleOf",
    }
)

_SCALAR_CONSTRAINT_KEYWORDS = frozenset(
    {
        "minLength",
        "maxLength",
        "pattern",
        "minimum",
        "maximum",
        "exclusiveMinimum",
        "exclusiveMaximum",
        "multipleOf",
    }
)

_STRUCTURAL_KEYWORDS = frozenset(
    {"anyOf", "allOf", "oneOf", "not", "if", "$ref", "properties", "items"}
)

_TYPELESS_TYPE_SCOPED_KEYWORDS = frozenset(
    {
        "properties",
        "patternProperties",
        "additionalProperties",
        "propertyNames",
        "required",
        "dependencies",
        "minProperties",
        "maxProperties",
        "items",
        "additionalItems",
        "contains",
        "minItems",
        "maxItems",
        "uniqueItems",
    }
)

# Keywords each type-array member keeps when the array is rewritten to anyOf.
_TYPE_SCOPED_KEYWORDS: t.Dict[str, frozenset] = {
    "string": frozenset({"minLength", "maxLength", "pattern"}),
    "integer": frozenset(
        {"minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"}
    ),
    "number": frozenset(
        {"minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"}
    ),
    "array": frozenset(
        {
            "items",
            "additionalItems",
            "contains",
            "minItems",
            "maxItems",
            "uniqueItems",
        }
    ),
    "object": frozenset(
        {
            "properties",
            "patternProperties",
            "additionalProperties",
            "propertyNames",
            "required",
            "dependencies",
            "minProperties",
            "maxProperties",
        }
    ),
    "boolean": frozenset(),
    "null": frozenset(),
}

_TYPE_ARRAY_SHARED_KEYWORDS = frozenset({"enum", "const", "format"})
_TYPE_ARRAY_WRAPPER_KEYWORDS = frozenset(
    {"title", "description", "default", "examples"}
)

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

    # A schema that enumerates no acceptable values rejects everything, exactly
    # like `false`. Normalizing here routes both spellings through the same
    # unsatisfiable-property handling (which tolerates the property's absence).
    if schema.get("enum") == [] or schema.get("type") == []:
        return _UnsatisfiableSchema

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
            return _materialized_value_to_python(
                self.materializer.validate_python(_materialized_value_to_python(value))
            )
        except (TypeError, ValueError):
            # JSON Schema alone decides acceptance. Pydantic is only retained
            # for the existing default-materialization behavior, and an
            # incomplete Pydantic representation must not reject valid input.
            logger.debug("Could not materialize dynamic-key defaults; preserving input")
            return value


def _materialized_value_to_python(value: t.Any) -> t.Any:
    """Convert a previous materializer result back into validation input."""
    if isinstance(value, BaseModel):
        included_fields = set(value.model_fields_set)
        included_fields.update(
            getattr(type(value), _EXPLICIT_DEFAULT_FIELDS_ATTRIBUTE, ())
        )
        result = {}
        for name, field in type(value).model_fields.items():
            if name not in included_fields:
                continue
            alias = field.serialization_alias or field.alias
            output_name = alias if isinstance(alias, str) else name
            result[output_name] = _materialized_value_to_python(getattr(value, name))
        for name, item in (value.model_extra or {}).items():
            result[name] = _materialized_value_to_python(item)
        return result
    if isinstance(value, dict):
        return {key: _materialized_value_to_python(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_materialized_value_to_python(item) for item in value]
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


def _resolve_default_metadata_schema(
    schema: t.Any,
    root_schema: t.Dict[str, t.Any],
    visited_refs: t.Optional[t.Set[str]] = None,
) -> t.Any:
    """Resolve a schema node without traversing instance-valued annotations."""
    if not isinstance(schema, dict):
        return schema
    reference = schema.get("$ref")
    if not isinstance(reference, str) or not reference.startswith("#/"):
        return schema
    if visited_refs is None:
        visited_refs = set()
    if reference in visited_refs:
        return {key: value for key, value in schema.items() if key != "$ref"}
    visited_refs.add(reference)

    target = _resolve_local_json_pointer(reference, root_schema)
    if not isinstance(target, dict):
        return schema
    resolved = _resolve_default_metadata_schema(target, root_schema, visited_refs)
    if not isinstance(resolved, dict):
        return schema
    return {
        **resolved,
        **{key: value for key, value in schema.items() if key != "$ref"},
    }


def _default_metadata_properties(
    schema: t.Any,
    root_schema: t.Dict[str, t.Any],
) -> t.Dict[str, t.Any]:
    schema = _resolve_default_metadata_schema(schema, root_schema)
    if not isinstance(schema, dict) or "anyOf" in schema or "oneOf" in schema:
        return {}
    properties = schema.get("properties")
    result = dict(properties) if isinstance(properties, dict) else {}
    for option in schema.get("allOf", []):
        result.update(_default_metadata_properties(option, root_schema))
    return result


def _default_metadata_schema_for_model(
    schema: t.Any,
    model: t.Type[BaseModel],
    root_schema: t.Dict[str, t.Any],
) -> t.Any:
    schema = _resolve_default_metadata_schema(schema, root_schema)
    if not isinstance(schema, dict):
        return None
    for combiner in ("anyOf", "oneOf"):
        titled = [
            option
            for option in schema.get(combiner, [])
            if isinstance(option, dict) and option.get("title") == model.__name__
        ]
        if len(titled) == 1:
            return titled[0]
    return schema if "anyOf" not in schema and "oneOf" not in schema else None


def _default_metadata_field_aliases(
    model: t.Type[BaseModel],
) -> t.Dict[str, t.Tuple[str, t.Any]]:
    fields = {}
    for name, field in model.model_fields.items():
        alias = field.serialization_alias or field.alias
        fields[alias if isinstance(alias, str) else name] = (name, field)
    return fields


def _mark_explicit_default_fields(
    annotation: t.Any,
    schema: t.Any,
    root_schema: t.Dict[str, t.Any],
    visiting: t.Optional[t.Set[t.Type[BaseModel]]] = None,
) -> None:
    """Attach recursive default-presence metadata to generated model classes."""
    origin = t.get_origin(annotation)
    arguments = t.get_args(annotation)
    if origin is t.Annotated:
        # Exact-validation wrappers must not hide the materialized type below.
        _mark_explicit_default_fields(arguments[0], schema, root_schema, visiting)
        return
    if origin in (t.Union, types.UnionType):
        options: t.List[t.Dict[str, t.Any]] = []
        resolved_schema = _resolve_default_metadata_schema(schema, root_schema)
        if isinstance(resolved_schema, dict):
            for combiner in ("anyOf", "oneOf"):
                options.extend(
                    option
                    for option in resolved_schema.get(combiner, [])
                    if isinstance(option, dict)
                )
        for index, argument in enumerate(arguments):
            argument_schema = None
            if isinstance(argument, type) and issubclass(argument, BaseModel):
                titled = [
                    option
                    for option in options
                    if option.get("title") == argument.__name__
                ]
                if len(titled) == 1:
                    argument_schema = titled[0]
            if argument_schema is None and index < len(options):
                argument_schema = options[index]
            _mark_explicit_default_fields(
                argument,
                argument_schema,
                root_schema,
                visiting,
            )
        return

    if origin in (list, set, frozenset):
        resolved_schema = _resolve_default_metadata_schema(schema, root_schema)
        item_schema = (
            resolved_schema.get("items") if isinstance(resolved_schema, dict) else None
        )
        if arguments:
            _mark_explicit_default_fields(
                arguments[0],
                item_schema,
                root_schema,
                visiting,
            )
        return

    if origin is tuple:
        resolved_schema = _resolve_default_metadata_schema(schema, root_schema)
        items = (
            resolved_schema.get("items") if isinstance(resolved_schema, dict) else None
        )
        for index, argument in enumerate(arguments):
            item_schema = (
                items[index]
                if isinstance(items, list) and index < len(items)
                else items
                if isinstance(items, dict)
                else None
            )
            _mark_explicit_default_fields(
                argument,
                item_schema,
                root_schema,
                visiting,
            )
        return

    if origin is dict:
        resolved_schema = _resolve_default_metadata_schema(schema, root_schema)
        additional = (
            resolved_schema.get("additionalProperties")
            if isinstance(resolved_schema, dict)
            else None
        )
        if len(arguments) == 2:
            _mark_explicit_default_fields(
                arguments[1],
                additional,
                root_schema,
                visiting,
            )
        return

    if not isinstance(annotation, type) or not issubclass(annotation, BaseModel):
        return

    model_schema = _default_metadata_schema_for_model(
        schema,
        annotation,
        root_schema,
    )
    properties = _default_metadata_properties(model_schema, root_schema)
    fields = _default_metadata_field_aliases(annotation)
    explicit_defaults = {
        internal_name
        for alias, (internal_name, field) in fields.items()
        if (not field.is_required() and field.default is not None)
        or (isinstance(properties.get(alias), dict) and "default" in properties[alias])
    }
    explicit_defaults.update(
        getattr(annotation, _EXPLICIT_DEFAULT_FIELDS_ATTRIBUTE, ())
    )
    setattr(
        annotation,
        _EXPLICIT_DEFAULT_FIELDS_ATTRIBUTE,
        frozenset(explicit_defaults),
    )

    if visiting is None:
        visiting = set()
    if annotation in visiting:
        return
    visiting.add(annotation)
    try:
        for alias, (_, field) in fields.items():
            _mark_explicit_default_fields(
                field.annotation,
                properties.get(alias),
                root_schema,
                visiting,
            )
    finally:
        visiting.remove(annotation)


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


def _validate_dynamic_key_schema(
    schema: t.Any,
    root_schema: t.Dict[str, t.Any],
    root_validator: Validator,
) -> None:
    """Validate one dynamic-key subschema without constructing a materializer."""
    validator_type = type(root_validator)
    validator_type.check_schema(schema)
    _check_dynamic_references(schema, root_schema)


def _dynamic_key_validator(
    schema: t.Any,
    root_schema: t.Dict[str, t.Any],
    root_validator: Validator,
) -> _DynamicKeyValidator:
    """Compile a complete inline JSON subschema without coercive acceptance."""
    _validate_dynamic_key_schema(schema, root_schema, root_validator)

    materializer = None
    if _contains_default(schema):
        annotation = json_schema_to_pydantic_type(schema, root_schema=root_schema)
        _mark_explicit_default_fields(annotation, schema, root_schema)
        materializer = TypeAdapter(annotation)

    return _DynamicKeyValidator(
        validator=root_validator.evolve(schema=schema),
        materializer=materializer,
    )


def _compile_pattern_property(pattern: str) -> t.Pattern[str]:
    try:
        return re.compile(pattern)
    except re.error as exc:
        raise ValueError(
            f"Invalid patternProperties regular expression: {pattern!r}"
        ) from exc


def _validate_object_policy_schema(
    schema: t.Dict[str, t.Any],
    root_schema: t.Dict[str, t.Any],
) -> None:
    """Validate a dynamic object policy without materializing defaults."""
    validator_type = jsonschema_validators.validator_for(
        root_schema,
        default=jsonschema_validators.Draft7Validator,
    )
    root_validator = validator_type(root_schema)

    for pattern, pattern_schema in (schema.get("patternProperties") or {}).items():
        _compile_pattern_property(pattern)
        _validate_dynamic_key_schema(
            pattern_schema,
            root_schema,
            root_validator,
        )

    additional = schema.get("additionalProperties")
    if isinstance(additional, dict):
        _validate_dynamic_key_schema(additional, root_schema, root_validator)


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
        patterns.append(
            (
                _compile_pattern_property(pattern),
                _dynamic_key_validator(
                    pattern_schema,
                    document_root,
                    root_validator,
                ),
            )
        )

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


def _iter_reachable_schemas(
    schema: t.Any,
    root_schema: t.Dict[str, t.Any],
    visited: t.Optional[t.Set[int]] = None,
) -> t.Iterator[t.Dict[str, t.Any]]:
    """Yield schema nodes reached through Draft 7 schema-valued keywords."""
    if visited is None:
        visited = set()
    if isinstance(schema, list):
        for item in schema:
            yield from _iter_reachable_schemas(item, root_schema, visited)
        return
    if not isinstance(schema, dict) or id(schema) in visited:
        return
    visited.add(id(schema))
    yield schema

    reference = schema.get("$ref")
    if isinstance(reference, str) and (reference == "#" or reference.startswith("#/")):
        try:
            resolved = _resolve_local_json_pointer(reference, root_schema)
        except ValueError:
            # Ordinary references retain the converter's legacy fallback.
            # Dynamic-key references are checked when their owning policy is
            # validated.
            resolved = None
        if isinstance(resolved, (dict, list)):
            yield from _iter_reachable_schemas(resolved, root_schema, visited)

    for keyword in ("properties", "patternProperties"):
        values = schema.get(keyword)
        if isinstance(values, dict):
            for child in values.values():
                yield from _iter_reachable_schemas(child, root_schema, visited)

    for keyword in _SCHEMA_VALUED_KEYWORDS:
        child = schema.get(keyword)
        if isinstance(child, (dict, list)):
            yield from _iter_reachable_schemas(child, root_schema, visited)

    for keyword in _SCHEMA_LIST_KEYWORDS:
        children = schema.get(keyword)
        if isinstance(children, list):
            yield from _iter_reachable_schemas(children, root_schema, visited)

    items = schema.get("items")
    if isinstance(items, (dict, list)):
        yield from _iter_reachable_schemas(items, root_schema, visited)

    dependencies = schema.get("dependencies")
    if isinstance(dependencies, dict):
        for child in dependencies.values():
            if isinstance(child, (dict, bool)):
                yield from _iter_reachable_schemas(child, root_schema, visited)


def _has_dynamic_object_policy(schema: t.Dict[str, t.Any]) -> bool:
    return bool(schema.get("patternProperties")) or isinstance(
        schema.get("additionalProperties"), dict
    )


def _validate_dynamic_object_policies(
    schema: t.Any,
    root_schema: t.Dict[str, t.Any],
) -> None:
    """Validate every reachable dynamic object policy before conversion fallback."""
    for candidate in _iter_reachable_schemas(schema, root_schema):
        if _has_dynamic_object_policy(candidate):
            _validate_object_policy_schema(candidate, root_schema)


def _contains_inline_object_policy(
    schema: t.Any,
    visited: t.Optional[t.Set[int]] = None,
) -> bool:
    """Whether direct object or array nesting contains a dynamic policy."""
    if visited is None:
        visited = set()
    if isinstance(schema, list):
        return any(_contains_inline_object_policy(item, visited) for item in schema)
    if not isinstance(schema, dict) or id(schema) in visited:
        return False
    visited.add(id(schema))
    if _has_dynamic_object_policy(schema):
        return True

    properties = schema.get("properties")
    if isinstance(properties, dict) and any(
        _contains_inline_object_policy(child, visited) for child in properties.values()
    ):
        return True

    items = schema.get("items")
    return isinstance(items, (dict, list)) and _contains_inline_object_policy(
        items,
        visited,
    )


def _apply_nested_object_policies(
    schema: t.Dict[str, t.Any],
    base_model: t.Type[BaseModel],
    root_schema: t.Dict[str, t.Any],
) -> t.Type[BaseModel]:
    """Replace fields whose schemas contain dynamic object policies."""
    field_overrides = {}
    for name, property_schema in (schema.get("properties") or {}).items():
        if not _contains_inline_object_policy(property_schema):
            continue
        field = base_model.model_fields.get(name)
        if field is None:
            continue
        field_overrides[name] = (
            _filtered_schema_to_pydantic_type(
                property_schema,
                root_schema=root_schema,
            ),
            field,
        )

    if not field_overrides:
        return base_model

    return create_pydantic_model(  # type: ignore[call-overload]
        schema.get("title", "GeneratedModel"),
        __base__=base_model,
        **field_overrides,
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
    # A schema may be the literal `true` or `false` instead of an object
    # (JSON Schema draft-06+), e.g. `additionalProperties: false` or a member
    # of `anyOf`. `true` accepts every value; `false` rejects every value.
    if isinstance(json_schema, bool):
        if json_schema:
            return t.Any
        return _UnsatisfiableSchema

    # Pre-filter boolean schemas from combiners
    filtered_schema = _filter_boolean_schemas(json_schema)
    filtered_schema = _resolve_unsatisfiable_references(filtered_schema)
    document_root = root_schema if root_schema is not None else json_schema
    _validate_dynamic_object_policies(json_schema, document_root)
    annotation = _filtered_schema_to_pydantic_type(
        filtered_schema,
        root_schema=document_root,
    )
    # Two layers: Pydantic materializes the value (defaults, aliases, models),
    # while the source schema decides acceptance. Keywords Pydantic cannot
    # express get a Draft 7 "exact" check that runs before Pydantic coercion.
    # Generated models already carry that check (see `_with_exact_validation`),
    # so only non-model annotations are wrapped here. When Pydantic would
    # narrow a valid value (e.g. `$ref`, `allOf`), the value is kept as-is.
    if (
        _requires_whole_schema_validation(json_schema)
        and not _is_unsatisfiable_schema(annotation)
        and not (isinstance(annotation, type) and issubclass(annotation, BaseModel))
    ):
        return _with_exact_validation_annotation(
            t.Any if _needs_permissive_materialization(json_schema) else annotation,
            json_schema,
            document_root,
        )
    return annotation


def _filtered_schema_to_pydantic_type(
    schema: t.Any,
    *,
    root_schema: t.Optional[t.Dict[str, t.Any]] = None,
) -> t.Type[t.Any]:
    """Convert a schema after boolean-schema normalization."""
    if schema is None or _is_unsatisfiable_schema(schema):
        return _UnsatisfiableSchema

    if not _ASSERTION_KEYWORDS.intersection(schema):
        # Pure-annotation schemas (only title/description/default/...) accept
        # every value, exactly like the empty schema.
        return t.Any

    schema_type = schema.get("type")
    if isinstance(schema_type, list):
        if not schema_type:
            return _UnsatisfiableSchema
        return _build_union_from_options(
            [
                {**schema, "type": member, "x-composio-strict-type": True}
                for member in schema_type
            ],
            root_schema=root_schema,
        )

    if schema_type is None and (
        "enum" in schema
        or "const" in schema
        or (
            _SCALAR_CONSTRAINT_KEYWORDS.intersection(schema)
            and not _STRUCTURAL_KEYWORDS.intersection(schema)
        )
    ):
        return _apply_scalar_constraints(t.Any, schema)

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


def _matches_json_type(type_: str, value: t.Any) -> bool:
    """JSON type membership per Draft 7 (booleans are not numbers, 2.0 is an integer)."""
    if type_ == "string":
        return isinstance(value, str)
    if type_ == "boolean":
        return isinstance(value, bool)
    if type_ == "null":
        return value is None
    if type_ == "integer":
        if isinstance(value, bool):
            return False
        return isinstance(value, int) or (
            isinstance(value, float) and value.is_integer()
        )
    if type_ == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if type_ == "array":
        return isinstance(value, list)
    if type_ == "object":
        return isinstance(value, dict)
    return True


def _json_type_guard(type_: str) -> t.Callable[[t.Any], t.Any]:
    def validate(value: t.Any) -> t.Any:
        if not _matches_json_type(type_, value):
            raise ValueError(f"value is not of JSON type {type_!r}")
        return value

    return validate


def _strict_json_type_annotation(type_: str) -> t.Any:
    """A type-checked annotation that still coerces integral floats for `integer`."""
    if type_ == "null":
        return type(None)
    base = PYDANTIC_TYPE_TO_PYTHON_TYPE.get(type_, str)
    return t.Annotated[base, BeforeValidator(_json_type_guard(type_))]


def _convert_simple_type(schema: t.Dict[str, t.Any]) -> t.Type[t.Any]:
    """Convert simple primitive types directly."""
    type_ = schema.get("type", "string")
    use_strict_type = (
        schema.get("x-composio-strict-type") is True
        or "enum" in schema
        or "const" in schema
    )
    base_type = (
        _strict_json_type_annotation(type_)
        if use_strict_type
        else t.cast(t.Type[t.Any], PYDANTIC_TYPE_TO_PYTHON_TYPE.get(type_, str))
    )
    return _apply_scalar_constraints(base_type, schema)


def _json_values_equal(left: t.Any, right: t.Any) -> bool:
    """Compare JSON values without treating booleans as numbers."""
    if isinstance(left, bool) or isinstance(right, bool):
        return type(left) is type(right) and left == right

    if isinstance(left, list) and isinstance(right, list):
        return len(left) == len(right) and all(
            _json_values_equal(left_item, right_item)
            for left_item, right_item in zip(left, right)
        )

    if isinstance(left, dict) and isinstance(right, dict):
        return left.keys() == right.keys() and all(
            _json_values_equal(left[key], right[key]) for key in left
        )

    return bool(left == right)


def _allowed_values_validator(
    allowed: t.Tuple[t.Any, ...],
) -> t.Callable[[t.Any], t.Any]:
    """Create a Pydantic validator for JSON Schema enum/const values."""

    def validate(value: t.Any) -> t.Any:
        if not any(_json_values_equal(value, candidate) for candidate in allowed):
            raise ValueError(f"value must be one of {allowed!r}")
        return value

    return validate


def _is_numeric(value: t.Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _is_json_multiple_of(value: t.Any, multiple: t.Any) -> bool:
    """Decimal-scaled multipleOf, matching the Zod and Effect converters.

    Raw float modulo misreports common decimal steps (0.3 % 0.1 != 0 in
    binary floating point); comparing through `Decimal(str(...))` recovers the
    author's decimal intent.
    """
    try:
        return (decimal.Decimal(str(value)) % decimal.Decimal(str(multiple))) == 0
    except (decimal.InvalidOperation, decimal.DivisionByZero):
        return False


def _multiple_of_validator(multiple: t.Any) -> t.Callable[[t.Any], t.Any]:
    def validate(value: t.Any) -> t.Any:
        if _is_numeric(value) and not _is_json_multiple_of(value, multiple):
            raise ValueError(f"value is not a multiple of {multiple!r}")
        return value

    return validate


def _compile_pattern(pattern: str) -> t.Optional[t.Pattern[str]]:
    try:
        return re.compile(pattern)
    except re.error:
        logger.warning(
            "Ignoring JSON Schema pattern %r: not a valid Python regular expression",
            pattern,
        )
        return None


def _with_string_constraints(annotation: t.Any, schema: t.Dict[str, t.Any]) -> t.Any:
    field_constraints: t.Dict[str, t.Any] = {}
    if "minLength" in schema:
        field_constraints["min_length"] = schema["minLength"]
    if "maxLength" in schema:
        field_constraints["max_length"] = schema["maxLength"]
    if field_constraints:
        annotation = t.Annotated[annotation, Field(**field_constraints)]
    if "pattern" in schema:
        annotation = _with_pattern_constraint(annotation, schema["pattern"])
    return annotation


def _with_pattern_constraint(annotation: t.Any, pattern: str) -> t.Any:
    """Prefer pydantic's native pattern; fall back to Python `re` when the Rust
    regex crate rejects an ECMA construct such as look-around (legal in
    Draft 7, whose regex dialect is ECMA-262)."""
    candidate = t.Annotated[annotation, Field(pattern=pattern)]
    try:
        TypeAdapter(candidate)
        return candidate
    except Exception:  # noqa: BLE001 - pydantic raises SchemaError subclasses
        pass

    compiled = _compile_pattern(pattern)
    if compiled is None:
        return annotation

    def validate(value: t.Any) -> t.Any:
        if isinstance(value, str) and compiled.search(value) is None:
            raise ValueError(f"string does not match pattern {pattern!r}")
        return value

    return t.Annotated[annotation, AfterValidator(validate)]


def _with_numeric_constraints(annotation: t.Any, schema: t.Dict[str, t.Any]) -> t.Any:
    field_constraints: t.Dict[str, t.Any] = {}
    if "minimum" in schema:
        field_constraints["gt" if schema.get("exclusiveMinimum") is True else "ge"] = (
            schema["minimum"]
        )
    if _is_numeric(schema.get("exclusiveMinimum")):
        field_constraints["gt"] = schema["exclusiveMinimum"]

    if "maximum" in schema:
        field_constraints["lt" if schema.get("exclusiveMaximum") is True else "le"] = (
            schema["maximum"]
        )
    if _is_numeric(schema.get("exclusiveMaximum")):
        field_constraints["lt"] = schema["exclusiveMaximum"]

    if field_constraints:
        annotation = t.Annotated[annotation, Field(**field_constraints)]
    if "multipleOf" in schema:
        annotation = t.Annotated[
            annotation, AfterValidator(_multiple_of_validator(schema["multipleOf"]))
        ]
    return annotation


def _check_numeric_keywords(schema: t.Dict[str, t.Any], value: t.Any) -> None:
    minimum = schema.get("minimum")
    if _is_numeric(minimum):
        if schema.get("exclusiveMinimum") is True:
            if value <= minimum:
                raise ValueError(f"value must be greater than {minimum!r}")
        elif value < minimum:
            raise ValueError(f"value must be at least {minimum!r}")
    exclusive_minimum = schema.get("exclusiveMinimum")
    if _is_numeric(exclusive_minimum) and value <= exclusive_minimum:
        raise ValueError(f"value must be greater than {exclusive_minimum!r}")

    maximum = schema.get("maximum")
    if _is_numeric(maximum):
        if schema.get("exclusiveMaximum") is True:
            if value >= maximum:
                raise ValueError(f"value must be less than {maximum!r}")
        elif value > maximum:
            raise ValueError(f"value must be at most {maximum!r}")
    exclusive_maximum = schema.get("exclusiveMaximum")
    if _is_numeric(exclusive_maximum) and value >= exclusive_maximum:
        raise ValueError(f"value must be less than {exclusive_maximum!r}")

    if "multipleOf" in schema and not _is_json_multiple_of(value, schema["multipleOf"]):
        raise ValueError(f"value is not a multiple of {schema['multipleOf']!r}")


def _typeless_constraint_validator(
    schema: t.Dict[str, t.Any],
) -> t.Optional[t.Callable[[t.Any], t.Any]]:
    """Draft 7 applies scalar constraints per instance type even without `type`."""
    if not _SCALAR_CONSTRAINT_KEYWORDS.intersection(schema):
        return None

    compiled_pattern = (
        _compile_pattern(schema["pattern"]) if "pattern" in schema else None
    )

    def validate(value: t.Any) -> t.Any:
        if isinstance(value, str):
            if "minLength" in schema and len(value) < schema["minLength"]:
                raise ValueError(
                    f"string must contain at least {schema['minLength']} characters"
                )
            if "maxLength" in schema and len(value) > schema["maxLength"]:
                raise ValueError(
                    f"string must contain at most {schema['maxLength']} characters"
                )
            if compiled_pattern is not None and compiled_pattern.search(value) is None:
                raise ValueError(f"string does not match pattern {schema['pattern']!r}")
        if _is_numeric(value):
            _check_numeric_keywords(schema, value)
        return value

    return validate


def _apply_scalar_constraints(
    base_type: t.Type[t.Any],
    schema: t.Dict[str, t.Any],
) -> t.Type[t.Any]:
    """Apply scalar JSON Schema validation keywords to a Python annotation."""
    type_ = schema.get("type")
    annotation: t.Any = base_type

    if type_ == "string":
        annotation = _with_string_constraints(annotation, schema)
    elif type_ in ("integer", "number"):
        annotation = _with_numeric_constraints(annotation, schema)
    elif type_ is None:
        validator = _typeless_constraint_validator(schema)
        if validator is not None:
            annotation = t.Annotated[annotation, AfterValidator(validator)]

    allowed: t.Optional[t.Tuple[t.Any, ...]] = None
    if "const" in schema and "enum" in schema:
        # Both keywords assert independently, so only their intersection is
        # acceptable; a const outside the enum makes the schema unsatisfiable.
        allowed = tuple(
            candidate
            for candidate in (schema["const"],)
            if any(_json_values_equal(candidate, member) for member in schema["enum"])
        )
    elif "const" in schema:
        allowed = (schema["const"],)
    elif "enum" in schema:
        allowed = tuple(schema["enum"])

    if allowed is not None:
        if not allowed:
            return _UnsatisfiableSchema
        annotation = t.Annotated[
            annotation,
            AfterValidator(_allowed_values_validator(allowed)),
        ]

    return t.cast(t.Type[t.Any], annotation)


def _schema_for_exact_validation(value: t.Any) -> t.Any:
    """Turn internal boolean-schema markers back into JSON Schema values.

    Conversion replaces the literal ``false`` with `_UnsatisfiableSchema`; the
    `jsonschema` validator needs the original ``false`` back.
    """
    if _is_unsatisfiable_schema(value):
        return False
    if isinstance(value, dict):
        return {key: _schema_for_exact_validation(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_schema_for_exact_validation(item) for item in value]
    return value


_EXACT_SCHEMA_MAP_KEYWORDS = frozenset(
    {
        "$defs",
        "definitions",
        "dependencies",
        "patternProperties",
        "properties",
    }
)
_EXACT_SCHEMA_ARRAY_KEYWORDS = frozenset({"allOf", "anyOf", "oneOf"})
_EXACT_SCHEMA_VALUE_KEYWORDS = frozenset(
    {
        "additionalItems",
        "additionalProperties",
        "contains",
        "else",
        "if",
        "items",
        "not",
        "propertyNames",
        "then",
    }
)

_REQUIRES_WHOLE_SCHEMA_VALIDATION = frozenset(
    {
        "$ref",
        "additionalItems",
        "contains",
        "dependencies",
        "else",
        "if",
        "maxItems",
        "maxProperties",
        "minItems",
        "minProperties",
        "not",
        "propertyNames",
        "required",
        "then",
        "uniqueItems",
    }
)


def _contains_compound_literal(schema: t.Dict[str, t.Any]) -> bool:
    values: t.List[t.Any] = []
    if "const" in schema:
        values.append(schema["const"])
    enum = schema.get("enum")
    if isinstance(enum, list):
        values.extend(enum)
    return any(isinstance(value, (dict, list)) for value in values)


def _one_of_needs_exact_validation(options: t.Any) -> bool:
    """Return whether two oneOf branches can accept the same JSON type."""
    if not isinstance(options, list) or len(options) < 2:
        return False

    branch_types: t.List[t.Set[str]] = []
    all_types = {"array", "boolean", "integer", "null", "number", "object", "string"}
    for option in options:
        if option is True or not isinstance(option, dict) or "type" not in option:
            branch_types.append(set(all_types))
            continue
        if option is False:
            branch_types.append(set())
            continue
        declared = option["type"]
        types = {declared} if isinstance(declared, str) else set(declared)
        if "number" in types:
            types.add("integer")
        branch_types.append(types)

    return any(
        left.intersection(right)
        for index, left in enumerate(branch_types)
        for right in branch_types[index + 1 :]
    )


def _combiner_has_assertion_siblings(schema: t.Dict[str, t.Any], keyword: str) -> bool:
    return bool(_ASSERTION_KEYWORDS.intersection(schema) - {keyword})


def _requires_whole_schema_validation(schema: t.Any) -> bool:
    """Whether the materializing converter needs an authoritative final guard.

    True when the schema (or any nested schema) uses a keyword that Pydantic
    field constraints cannot express faithfully: `required`, `contains`,
    `if`/`then`/`else`, `not`, `$ref`, unions (which Pydantic coerces across),
    and so on. Those schemas get a Draft 7 check on the raw value first.
    """
    if isinstance(schema, bool) or not isinstance(schema, dict):
        return False
    if (
        _REQUIRES_WHOLE_SCHEMA_VALIDATION.intersection(schema)
        or "allOf" in schema
        or (
            schema.get("type") is None
            and _TYPELESS_TYPE_SCOPED_KEYWORDS.intersection(schema)
        )
        # Pydantic unions coerce across members (`True` satisfies `integer |
        # null`), so every combiner needs the exact check, not only those with
        # sibling assertions or overlapping branches.
        or "anyOf" in schema
        or "oneOf" in schema
        or _contains_compound_literal(schema)
    ):
        return True

    for key, child in schema.items():
        if key in _EXACT_SCHEMA_MAP_KEYWORDS and isinstance(child, dict):
            if any(
                _requires_whole_schema_validation(value) for value in child.values()
            ):
                return True
        elif key in _EXACT_SCHEMA_ARRAY_KEYWORDS and isinstance(child, list):
            if any(_requires_whole_schema_validation(value) for value in child):
                return True
        elif key in _EXACT_SCHEMA_VALUE_KEYWORDS:
            values = child if isinstance(child, list) else [child]
            if any(_requires_whole_schema_validation(value) for value in values):
                return True

    return False


def _needs_permissive_materialization(
    schema: t.Any,
    visited: t.Optional[t.Set[int]] = None,
) -> bool:
    """Detect schemas whose exact validator must not pipe into a narrower type.

    For `$ref`, `allOf`, and typeless assertions the Pydantic type the library
    builds can be narrower than what the schema accepts. Once the Draft 7 check
    has accepted the raw value, it is passed through as `t.Any` rather than
    risk a second, stricter rejection or a lossy coercion.
    """
    if isinstance(schema, bool) or not isinstance(schema, dict):
        return False
    if visited is None:
        visited = set()
    if id(schema) in visited:
        return False
    visited.add(id(schema))

    if "$ref" in schema or "allOf" in schema:
        return True
    if schema.get("type") is None and (
        _TYPELESS_TYPE_SCOPED_KEYWORDS.intersection(schema)
        or {"if", "then", "else", "not"}.intersection(schema)
    ):
        return True
    for key, child in schema.items():
        if key in _EXACT_SCHEMA_MAP_KEYWORDS and isinstance(child, dict):
            if any(
                _needs_permissive_materialization(value, visited)
                for value in child.values()
            ):
                return True
        elif key in _EXACT_SCHEMA_ARRAY_KEYWORDS and isinstance(child, list):
            if any(
                _needs_permissive_materialization(value, visited) for value in child
            ):
                return True
        elif key in _EXACT_SCHEMA_VALUE_KEYWORDS:
            values = child if isinstance(child, list) else [child]
            if any(
                _needs_permissive_materialization(value, visited) for value in values
            ):
                return True
    return False


def _relax_exact_model_fields(
    schema: t.Dict[str, t.Any],
    base_model: t.Type[BaseModel],
) -> t.Type[BaseModel]:
    """Let exact source validation own fields the library would over-narrow."""
    properties = schema.get("properties")
    if not isinstance(properties, dict):
        return base_model

    field_definitions = {}
    for internal_name, model_field in base_model.model_fields.items():
        external_name = (
            model_field.alias if isinstance(model_field.alias, str) else internal_name
        )
        property_schema = properties.get(external_name)
        if not _needs_permissive_materialization(property_schema):
            continue

        default = ... if model_field.is_required() else model_field.default
        field_definitions[internal_name] = (
            t.Any,
            Field(
                default,
                alias=model_field.alias,
                description=model_field.description,
                examples=model_field.examples,
                title=model_field.title,
            ),
        )

    if not field_definitions:
        return base_model
    return create_pydantic_model(  # type: ignore[call-overload]
        base_model.__name__,
        __base__=base_model,
        **field_definitions,
    )


def _normalize_draft4_exclusive_bounds(value: t.Any) -> t.Any:
    """Translate OpenAPI 3.0 boolean bounds without changing nearby keywords."""
    if isinstance(value, bool) or not isinstance(value, dict):
        return value

    normalized: t.Dict[str, t.Any] = {}
    for key, child in value.items():
        if key in _EXACT_SCHEMA_MAP_KEYWORDS and isinstance(child, dict):
            normalized[key] = {
                name: _normalize_draft4_exclusive_bounds(schema)
                for name, schema in child.items()
            }
        elif key in _EXACT_SCHEMA_ARRAY_KEYWORDS and isinstance(child, list):
            normalized[key] = [
                _normalize_draft4_exclusive_bounds(schema) for schema in child
            ]
        elif key in _EXACT_SCHEMA_VALUE_KEYWORDS:
            if isinstance(child, list):
                normalized[key] = [
                    _normalize_draft4_exclusive_bounds(schema) for schema in child
                ]
            else:
                normalized[key] = _normalize_draft4_exclusive_bounds(child)
        else:
            # Values under enum/const/default/examples are instance data, not
            # schemas, and must remain byte-for-byte equivalent.
            normalized[key] = child

    if normalized.get("exclusiveMinimum") is True and _is_numeric(
        normalized.get("minimum")
    ):
        normalized["exclusiveMinimum"] = normalized.pop("minimum")
    elif isinstance(normalized.get("exclusiveMinimum"), bool):
        normalized.pop("exclusiveMinimum")

    if normalized.get("exclusiveMaximum") is True and _is_numeric(
        normalized.get("maximum")
    ):
        normalized["exclusiveMaximum"] = normalized.pop("maximum")
    elif isinstance(normalized.get("exclusiveMaximum"), bool):
        normalized.pop("exclusiveMaximum")

    return normalized


def _exact_validation_multiple_of(
    _validator: t.Any,
    multiple: t.Any,
    instance: t.Any,
    _schema: t.Any,
) -> t.Iterator[t.Any]:
    if _is_numeric(instance) and not _is_json_multiple_of(instance, multiple):
        yield jsonschema_exceptions.ValidationError(
            f"{instance!r} is not a multiple of {multiple!r}"
        )


_PATTERN_MATCHER_CACHE: t.Dict[str, t.Optional[t.Callable[[str], bool]]] = {}


def _pattern_matcher(pattern: str) -> t.Optional[t.Callable[[str], bool]]:
    """Match `pattern` with pydantic's linear-time Rust regex when it can
    compile it, falling back to Python `re` only for ECMA-only constructs."""
    if pattern in _PATTERN_MATCHER_CACHE:
        return _PATTERN_MATCHER_CACHE[pattern]
    matcher: t.Optional[t.Callable[[str], bool]] = None
    if _pattern_supported_by_pydantic(pattern):
        adapter = TypeAdapter(t.Annotated[str, Field(pattern=pattern)])

        def match_with_pydantic(value: str) -> bool:
            try:
                adapter.validate_python(value, strict=True)
            except ValidationError:
                return False
            return True

        matcher = match_with_pydantic
    else:
        compiled = _compile_pattern(pattern)
        if compiled is not None:

            def match_with_re(value: str) -> bool:
                return compiled.search(value) is not None

            matcher = match_with_re
    _PATTERN_MATCHER_CACHE[pattern] = matcher
    return matcher


def _exact_validation_pattern(
    _validator: Validator,
    pattern: t.Any,
    instance: t.Any,
    _schema: t.Any,
) -> t.Iterator[t.Any]:
    if not isinstance(instance, str) or not isinstance(pattern, str):
        return
    matcher = _pattern_matcher(pattern)
    if matcher is not None and not matcher(instance):
        yield jsonschema_exceptions.ValidationError(
            f"{instance!r} does not match {pattern!r}"
        )


# A bare registry resolves only references inside the schema document and
# raises on anything else; jsonschema's default registry falls back to
# fetching unknown URIs over the network.
_LOCAL_ONLY_REGISTRY: Registry[t.Any] = Registry()


def _reject_external_references(schema: t.Any) -> None:
    """Fail at conversion time on any `$ref` that is not a local JSON Pointer.

    Only schema positions are walked; `const`, `default`, `enum`, and
    `examples` hold instance data.
    """
    if isinstance(schema, list):
        for item in schema:
            _reject_external_references(item)
        return
    if not isinstance(schema, dict):
        return
    reference = schema.get("$ref")
    if isinstance(reference, str) and not reference.startswith("#"):
        raise ValueError(
            f"External schema reference {reference!r} is not supported; "
            "only local references (#/...) are resolved"
        )
    for keyword, value in schema.items():
        if keyword in _SCHEMA_VALUED_KEYWORDS or keyword in _SCHEMA_LIST_KEYWORDS:
            _reject_external_references(value)
        elif keyword in _SCHEMA_MAP_KEYWORDS:
            if isinstance(value, dict):
                for entry in value.values():
                    _reject_external_references(entry)
        elif keyword == "items":
            _reject_external_references(value)
        elif keyword == "dependencies" and isinstance(value, dict):
            for entry in value.values():
                if isinstance(entry, (dict, bool)):
                    _reject_external_references(entry)


def _is_closed_object_branch(branch: t.Any) -> bool:
    return (
        isinstance(branch, dict)
        and isinstance(branch.get("properties"), dict)
        and len(branch["properties"]) > 0
        and "additionalProperties" not in branch
        and "patternProperties" not in branch
        and "$ref" not in branch
    )


def _close_all_of_branches(schema: t.Any) -> t.Any:
    """Apply the omitted-`additionalProperties` strictness rule once per `allOf`.

    Draft 7 already lets sibling object branches accept each other's keys, so
    the exact validator only needs the strictness a lone named-property object
    would have had: the union of every branch's declared keys, applied at the
    `allOf` node. Mirrors `parseAllOf` in @composio/json-schema-to-zod and
    `openAllOfBranches` in @composio/json-schema-to-effect-schema.
    """
    if isinstance(schema, list):
        return [_close_all_of_branches(item) for item in schema]
    if not isinstance(schema, dict):
        return schema

    result: t.Dict[str, t.Any] = {}
    for key, value in schema.items():
        if key in _EXACT_SCHEMA_MAP_KEYWORDS and isinstance(value, dict):
            result[key] = {
                name: _close_all_of_branches(child) for name, child in value.items()
            }
        elif key in _EXACT_SCHEMA_ARRAY_KEYWORDS or key in _EXACT_SCHEMA_VALUE_KEYWORDS:
            result[key] = _close_all_of_branches(value)
        else:
            result[key] = value

    branches = schema.get("allOf")
    if (
        isinstance(branches, list)
        and len(branches) >= 2
        and all(_is_closed_object_branch(branch) for branch in branches)
        and not {"properties", "patternProperties", "additionalProperties"}
        & set(schema)
    ):
        result["properties"] = {
            name: True for branch in branches for name in branch["properties"]
        }
        result["additionalProperties"] = False
    return result


def _validate_json_schema(
    schema: t.Dict[str, t.Any],
    root_schema: t.Dict[str, t.Any],
) -> t.Callable[[t.Any], t.Any]:
    """Compile an exact JSON Schema acceptance check for a Pydantic model."""
    validation_schema = _close_all_of_branches(
        _normalize_draft4_exclusive_bounds(_schema_for_exact_validation(schema))
    )
    validation_root = _close_all_of_branches(
        _normalize_draft4_exclusive_bounds(_schema_for_exact_validation(root_schema))
    )
    _reject_external_references(validation_root)
    _reject_external_references(validation_schema)
    # The SDK contract is Draft 7 plus the OpenAPI 3.0 boolean spelling for
    # exclusive bounds. Falling the entire document back to Draft 4 would make
    # `contains`, `const`, `if`/`then`/`else`, and `propertyNames` disappear.
    validator_class = jsonschema_validators.Draft7Validator
    # Align multipleOf with the decimal-scaled checks in the Zod and Effect
    # converters instead of raw float modulo.
    # `pattern` goes through pydantic's Rust regex where possible so a
    # backtracking pattern cannot stall validation (Python `re` is exponential
    # on inputs such as `(a+)+$`).
    validator_class = jsonschema_validators.extend(
        validator_class,
        {
            "multipleOf": _exact_validation_multiple_of,
            "pattern": _exact_validation_pattern,
        },
    )
    validator = validator_class(
        validation_root,
        registry=_LOCAL_ONLY_REGISTRY,
    ).evolve(schema=validation_schema)

    def validate(value: t.Any) -> t.Any:
        error = next(validator.iter_errors(value), None)
        if error is not None:
            location = ".".join(str(part) for part in error.path)
            message = f"{location}: {error.message}" if location else error.message
            raise ValueError(message)
        return value

    return validate


def _with_exact_validation_annotation(
    annotation: t.Any,
    schema: t.Dict[str, t.Any],
    root_schema: t.Dict[str, t.Any],
) -> t.Type[t.Any]:
    """Validate the raw value before Pydantic coercion or default handling."""
    validate_schema = _validate_json_schema(schema, root_schema)
    return t.cast(
        t.Type[t.Any],
        t.Annotated[annotation, BeforeValidator(validate_schema)],
    )


def _with_exact_validation(
    model: t.Type[BaseModel],
    schema: t.Dict[str, t.Any],
    root_schema: t.Dict[str, t.Any],
) -> t.Type[t.Any]:
    """Keep model materialization while enforcing the source schema first."""
    validate_schema = _validate_json_schema(schema, root_schema)

    def validate_source_schema(cls, value: t.Any) -> t.Any:
        return validate_schema(value)

    validator = model_validator(mode="before")(
        t.cast(t.Any, classmethod(validate_source_schema))
    )

    name = model.__name__
    return t.cast(
        t.Type[BaseModel],
        type(
            name,
            (model,),
            {
                "__module__": __name__,
                "__qualname__": name,
                "_validate_source_schema": validator,
            },
        ),
    )


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
        _normalize_schema_for_library(base_schema),
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


_TYPE_ARRAY_CHILD_KEYWORDS_MAPS = (
    "properties",
    "patternProperties",
    "$defs",
    "definitions",
)
_TYPE_ARRAY_CHILD_KEYWORDS_LISTS = ("anyOf", "allOf", "oneOf")
_TYPE_ARRAY_CHILD_KEYWORDS_SCHEMAS = (
    "items",
    "additionalItems",
    "additionalProperties",
    "contains",
    "propertyNames",
    "not",
    "if",
    "then",
    "else",
)


_PYDANTIC_PATTERN_SUPPORT_CACHE: t.Dict[str, bool] = {}


def _pattern_supported_by_pydantic(pattern: str) -> bool:
    cached = _PYDANTIC_PATTERN_SUPPORT_CACHE.get(pattern)
    if cached is not None:
        return cached
    try:
        TypeAdapter(t.Annotated[str, Field(pattern=pattern)])
        supported = True
    except Exception:  # noqa: BLE001 - pydantic raises SchemaError subclasses
        supported = False
    _PYDANTIC_PATTERN_SUPPORT_CACHE[pattern] = supported
    return supported


def _normalize_schema_for_library(schema: t.Any) -> t.Any:
    """Rewrite constructs the json-schema-to-pydantic library mishandles.

    - `type: [...]` becomes an equivalent `anyOf` of single-type schemas: the
      library applies every sibling constraint to every union member, so
      `{"type": ["string", "number"], "minLength": 2, "minimum": 10}` raises
      `TypeError` at validation time when a valid string hits the numeric
      constraint. Scoping constraints per member is semantically identical
      under Draft 7 (mismatched-type keywords are ignored).
    - `pattern` values the Rust regex crate rejects (ECMA look-around) are
      dropped from the library input; the exact-validation layer still
      enforces them through Python `re`.
    """
    if not isinstance(schema, dict):
        return schema

    result: t.Dict[str, t.Any] = {}
    for key, value in schema.items():
        if key in _TYPE_ARRAY_CHILD_KEYWORDS_MAPS and isinstance(value, dict):
            result[key] = {
                name: _normalize_schema_for_library(child)
                for name, child in value.items()
            }
        elif key in _TYPE_ARRAY_CHILD_KEYWORDS_LISTS and isinstance(value, list):
            result[key] = [_normalize_schema_for_library(child) for child in value]
        elif key in _TYPE_ARRAY_CHILD_KEYWORDS_SCHEMAS:
            result[key] = _normalize_schema_for_library(value)
        else:
            result[key] = value

    pattern = result.get("pattern")
    if isinstance(pattern, str) and not _pattern_supported_by_pydantic(pattern):
        del result["pattern"]

    # Draft-4 boolean exclusive flags: the library reads the boolean itself as
    # the numeric bound (lt=True becomes "less than 1"). Translate them to the
    # Draft 7 numeric spelling before the library sees them.
    if result.get("exclusiveMinimum") is True and _is_numeric(result.get("minimum")):
        result["exclusiveMinimum"] = result.pop("minimum")
    elif isinstance(result.get("exclusiveMinimum"), bool):
        del result["exclusiveMinimum"]
    if result.get("exclusiveMaximum") is True and _is_numeric(result.get("maximum")):
        result["exclusiveMaximum"] = result.pop("maximum")
    elif isinstance(result.get("exclusiveMaximum"), bool):
        del result["exclusiveMaximum"]

    # A one-member type array is the same as the bare type, and collapsing it
    # lets the constraint scoping below apply.
    if isinstance(result.get("type"), list) and len(result["type"]) == 1:
        result["type"] = result["type"][0]

    # The library applies scalar keywords unconditionally, so a keyword that
    # does not scope to the declared type (or any keyword on a typeless
    # schema) raises TypeError at validation time on mismatched instances.
    # Drop them from the library input; the exact-validation layer that wraps
    # every object conversion still enforces them per Draft 7.
    declared_type = result.get("type")
    if isinstance(declared_type, str):
        scoped_keywords = _TYPE_SCOPED_KEYWORDS.get(declared_type)
        if scoped_keywords is not None:
            for keyword in _SCALAR_CONSTRAINT_KEYWORDS - scoped_keywords:
                result.pop(keyword, None)
    elif declared_type is None:
        for keyword in _SCALAR_CONSTRAINT_KEYWORDS:
            result.pop(keyword, None)

    type_ = result.get("type")
    if not isinstance(type_, list) or len(type_) < 2:
        return result

    members = []
    for member in type_:
        member_schema: t.Dict[str, t.Any] = {"type": member}
        scoped = _TYPE_SCOPED_KEYWORDS.get(member, frozenset())
        for keyword in scoped | _TYPE_ARRAY_SHARED_KEYWORDS:
            if keyword in result:
                member_schema[keyword] = result[keyword]
        members.append(member_schema)

    wrapper: t.Dict[str, t.Any] = {
        key: value
        for key, value in result.items()
        if key in _TYPE_ARRAY_WRAPPER_KEYWORDS
    }
    wrapper["anyOf"] = members
    return wrapper


def _convert_with_library(
    schema: t.Dict[str, t.Any],
    *,
    root_schema: t.Optional[t.Dict[str, t.Any]] = None,
) -> t.Union[t.Type, t.Any]:
    """Use json-schema-to-pydantic for complex schema conversion."""
    # Dynamic-key policy compilation is an acceptance boundary, so it must run
    # outside the legacy library-conversion fallback below. Invalid patterns or
    # references must fail closed instead of silently changing the field to str.
    if schema.get("type") == "object":
        document_root = root_schema if root_schema is not None else schema
        if _contains_unsatisfiable_schema(schema.get("properties", {})):
            try:
                base_model = _convert_object_with_unsatisfiable_properties(
                    schema,
                    root_schema=document_root,
                )
            except (SchemaError, CombinerError) as e:
                logger.debug(
                    f"Library schema conversion failed: {e}, preserving exact validation"
                )
                return _with_exact_validation_annotation(
                    t.Any,
                    schema,
                    document_root,
                )
            except Exception as e:
                logger.debug(
                    f"Unexpected error in schema conversion: {e}, preserving exact validation"
                )
                return _with_exact_validation_annotation(
                    t.Any,
                    schema,
                    document_root,
                )
            return _with_exact_validation(
                apply_object_policy(
                    schema,
                    _apply_nested_object_policies(schema, base_model, document_root),
                    root_schema=document_root,
                ),
                schema,
                document_root,
            )
        # A property-less object with no dynamic-key constraints accepts and
        # preserves arbitrary content. Modelling it as an empty Pydantic
        # model instead silently discarded every key (issue #4064).
        if object_is_open(schema) and not schema.get("patternProperties"):
            return t.cast(t.Type, t.Dict[str, t.Any])
        if "title" not in schema:
            schema = {**schema, "title": "GeneratedModel"}

        try:
            base_model = create_model_from_schema(
                _normalize_schema_for_library(schema),
                allow_undefined_array_items=True,
                allow_undefined_type=True,
            )
        except (SchemaError, CombinerError) as e:
            logger.debug(
                f"Library schema conversion failed: {e}, preserving exact validation"
            )
            return _with_exact_validation_annotation(
                t.Any,
                schema,
                document_root,
            )
        except Exception as e:
            logger.debug(
                f"Unexpected error in schema conversion: {e}, preserving exact validation"
            )
            return _with_exact_validation_annotation(
                t.Any,
                schema,
                document_root,
            )

        base_model = _relax_exact_model_fields(schema, base_model)
        return _with_exact_validation(
            apply_object_policy(
                schema,
                _apply_nested_object_policies(schema, base_model, document_root),
                root_schema=document_root,
            ),
            schema,
            document_root,
        )

    try:
        # Handle top-level combiner without type (e.g., {"anyOf": [...]})
        if (
            any(k in schema for k in ("anyOf", "allOf", "oneOf"))
            and "type" not in schema
        ):
            return _handle_toplevel_combiner(schema, root_schema=root_schema)

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
        logger.debug(
            f"Library schema conversion failed: {e}, preserving exact validation"
        )
        document_root = root_schema if root_schema is not None else schema
        return _with_exact_validation_annotation(t.Any, schema, document_root)
    except Exception as e:
        logger.debug(
            f"Unexpected error in schema conversion: {e}, preserving exact validation"
        )
        document_root = root_schema if root_schema is not None else schema
        return _with_exact_validation_annotation(t.Any, schema, document_root)


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
            _normalize_schema_for_library(schema),
            allow_undefined_array_items=True,
            allow_undefined_type=True,
        )
        if result is type(None):
            return type(None)
        if "allOf" in schema:
            options = schema.get("allOf")
            requires_object = isinstance(options, list) and any(
                isinstance(option, dict) and option.get("type") == "object"
                for option in options
            )
            if (
                requires_object
                and isinstance(result, type)
                and issubclass(result, BaseModel)
            ):
                document_root = root_schema if root_schema is not None else schema
                return _with_exact_validation(result, schema, document_root)

            # The library models scalar intersections as object models.
            # Preserve the JSON value and let exact validation own acceptance.
            return t.Any
        # A library model for anyOf/oneOf drops sibling assertions such as
        # `required` and exclusive oneOf matching; let the source schema own it.
        if isinstance(result, type) and issubclass(result, BaseModel):
            document_root = root_schema if root_schema is not None else schema
            return _with_exact_validation(result, schema, document_root)
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
        return type(None) if has_null else _UnsatisfiableSchema

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
