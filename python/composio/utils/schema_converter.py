"""
JSON Schema to Pydantic type conversion using json-schema-to-pydantic library.

This module provides a wrapper around json-schema-to-pydantic that maintains
backwards compatibility with the existing json_schema_to_pydantic_type() API.

The library handles most JSON Schema features correctly, but doesn't support
boolean schemas (true/false values that are valid in JSON Schema draft-06+).
We handle those by pre-filtering them before passing to the library.
"""

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
_EXPLICIT_DEFAULT_FIELDS_ATTRIBUTE = "__composio_explicit_default_fields__"


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
    _validate_dynamic_object_policies(json_schema, document_root)
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
                    f"Library schema conversion failed: {e}, falling back to string"
                )
                return str
            except Exception as e:
                logger.debug(
                    f"Unexpected error in schema conversion: {e}, falling back to string"
                )
                return str
            return apply_object_policy(
                schema,
                _apply_nested_object_policies(schema, base_model, document_root),
                root_schema=document_root,
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
                schema,
                allow_undefined_array_items=True,
                allow_undefined_type=True,
            )
        except (SchemaError, CombinerError) as e:
            logger.debug(
                f"Library schema conversion failed: {e}, falling back to string"
            )
            return str
        except Exception as e:
            logger.debug(
                f"Unexpected error in schema conversion: {e}, falling back to string"
            )
            return str

        return apply_object_policy(
            schema,
            _apply_nested_object_policies(schema, base_model, document_root),
            root_schema=document_root,
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
