"""Classifies one tool argument as a closed set Jev can bind, or as open-ended."""

from __future__ import annotations

import typing as t

import typing_extensions as te
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictStr,
    model_validator,
)
from pydantic import ValidationError as PydanticValidationError

from .keys import MAX_CHOICE_OPTIONS

_MAX_SAFE_INTEGER = 2**53 - 1

_JsonSchemaType = t.Literal[
    "string", "number", "integer", "boolean", "object", "array", "null"
]
_Number = te.Annotated[float, Field(strict=True)]


class JsonSchemaProperty(BaseModel):
    """
    The JSON Schema property shape the TypeScript SDK accepts (`JSONSchemaPropertySchema`
    in `@composio/core`). A property that fails this parse is open-ended in both SDKs.
    """

    model_config = ConfigDict(extra="ignore")

    type: t.Optional[t.Union[_JsonSchemaType, t.List[_JsonSchemaType]]] = None
    description: t.Optional[StrictStr] = None
    anyOf: t.Optional[t.List["JsonSchemaProperty"]] = None
    oneOf: t.Optional[t.List["JsonSchemaProperty"]] = None
    allOf: t.Optional[t.List["JsonSchemaProperty"]] = None
    not_: t.Optional["JsonSchemaProperty"] = Field(default=None, alias="not")
    title: t.Optional[StrictStr] = None
    default: t.Any = None
    nullable: t.Optional[StrictBool] = None
    properties: t.Optional[t.Dict[StrictStr, "JsonSchemaProperty"]] = None
    required: t.Optional[t.List[StrictStr]] = None
    file_uploadable: t.Optional[StrictBool] = None
    file_downloadable: t.Optional[StrictBool] = None
    items: t.Optional[t.Union["JsonSchemaProperty", t.List["JsonSchemaProperty"]]] = (
        None
    )
    enum: t.Optional[t.List[t.Any]] = None
    const: t.Any = None
    minimum: t.Optional[_Number] = None
    maximum: t.Optional[_Number] = None
    exclusiveMinimum: t.Optional[_Number] = None
    exclusiveMaximum: t.Optional[_Number] = None
    multipleOf: t.Optional[_Number] = None
    minLength: t.Optional[_Number] = None
    maxLength: t.Optional[_Number] = None
    pattern: t.Optional[StrictStr] = None
    format: t.Optional[StrictStr] = None
    minItems: t.Optional[_Number] = None
    maxItems: t.Optional[_Number] = None
    uniqueItems: t.Optional[StrictBool] = None
    minProperties: t.Optional[_Number] = None
    maxProperties: t.Optional[_Number] = None
    patternProperties: t.Optional[t.Dict[StrictStr, "JsonSchemaProperty"]] = None
    additionalProperties: t.Optional[t.Union[StrictBool, "JsonSchemaProperty"]] = None
    examples: t.Optional[t.List[t.Any]] = None
    readOnly: t.Optional[StrictBool] = None
    writeOnly: t.Optional[StrictBool] = None
    if_: t.Optional["JsonSchemaProperty"] = Field(default=None, alias="if")
    then: t.Optional["JsonSchemaProperty"] = None
    else_: t.Optional["JsonSchemaProperty"] = Field(default=None, alias="else")
    ref: t.Optional[StrictStr] = Field(default=None, alias="$ref")
    definitions: t.Optional[t.Dict[StrictStr, "JsonSchemaProperty"]] = None
    defs: t.Optional[t.Dict[StrictStr, "JsonSchemaProperty"]] = Field(
        default=None, alias="$defs"
    )

    @model_validator(mode="before")
    @classmethod
    def _reject_null(cls, data: t.Any) -> t.Any:
        # A keyword may be absent, but only `const` and `default` may be JSON `null`.
        if isinstance(data, dict):
            for keyword, value in data.items():
                if value is None and keyword in _NON_NULLABLE_KEYWORDS:
                    raise ValueError("null keyword")
        return data


_NON_NULLABLE_KEYWORDS = frozenset(
    field.alias or name
    for name, field in JsonSchemaProperty.model_fields.items()
    if name not in ("const", "default")
)


def parse_property(schema: t.Any) -> t.Optional[t.Dict[str, t.Any]]:
    """Returns the property when it has the accepted shape, else `None`."""
    if not isinstance(schema, dict):
        return None
    try:
        JsonSchemaProperty.model_validate(schema)
    except (PydanticValidationError, RecursionError):
        return None
    return schema


class EnumClass(te.TypedDict):
    kind: t.Literal["enum"]
    values: t.List[t.Union[str, int]]
    nullable: bool


class BooleanClass(te.TypedDict):
    kind: t.Literal["boolean"]


class EnumArrayClass(te.TypedDict):
    kind: t.Literal["enum_array"]
    values: t.List[t.Union[str, int]]
    maxItems: te.NotRequired[t.Union[int, float]]


class OpenClass(te.TypedDict):
    kind: t.Literal["open"]


ArgumentClass: te.TypeAlias = t.Union[
    EnumClass, BooleanClass, EnumArrayClass, OpenClass
]

_OPEN: OpenClass = {"kind": "open"}


def _types_of(schema: t.Mapping[str, t.Any]) -> t.List[str]:
    declared = schema.get("type")
    if declared is None:
        return []
    return list(declared) if isinstance(declared, list) else [declared]


def _literal_members(schema: t.Mapping[str, t.Any]) -> t.Optional[t.List[t.Any]]:
    """
    Collects the literal members a property allows, or `None` when any branch is free-form.
    `anyOf`/`oneOf` branches must each be a `const`, an `enum`, or `{"type": "null"}`.
    """
    if "enum" in schema:
        return list(schema["enum"])
    if "const" in schema:
        return [schema["const"]]
    branches = schema["anyOf"] if "anyOf" in schema else schema.get("oneOf")
    if not branches:
        return None
    members: t.List[t.Any] = []
    for branch in branches:
        if _types_of(branch) == ["null"] and "enum" not in branch:
            members.append(None)
            continue
        if "enum" not in branch and "const" not in branch:
            return None
        nested = _literal_members(branch)
        if nested is None:
            return None
        members.extend(nested)
    return members


def _normalize_number(member: t.Any) -> t.Any:
    # JSON `1.0` is the integer 1 in JavaScript. `bool` is an `int` subclass, so it is excluded.
    if isinstance(member, float) and member.is_integer():
        return int(member)
    return member


def _classify_members(members: t.List[t.Any], nullable_hint: bool) -> ArgumentClass:
    nullable = nullable_hint or any(member is None for member in members)
    values: t.List[t.Any] = []
    seen: t.Set[t.Tuple[str, t.Any]] = set()
    for member in members:
        if member is None:
            continue
        value = _normalize_number(member)
        # `1`, `True`, and `"1"` are three different members.
        identity = (
            (type(value).__name__, value)
            if isinstance(value, (bool, int, float, str))
            else ("object", id(member))
        )
        if identity not in seen:
            seen.add(identity)
            values.append(value)
    if not values:
        return _OPEN
    if all(isinstance(value, bool) for value in values):
        # The boolean Choice offers both values, so a set that allows only one is open-ended.
        return {"kind": "boolean"} if len(values) == 2 else _OPEN
    strings = [value for value in values if isinstance(value, str)]
    integers = [
        value
        for value in values
        if isinstance(value, int)
        and not isinstance(value, bool)
        and abs(value) <= _MAX_SAFE_INTEGER
    ]
    # Mixed-type enums are open-ended: `1` and `"1"` cannot both be told apart by Jev.
    homogeneous: t.List[t.Union[str, int]] = (
        list(strings) if len(strings) == len(values) else list(integers)
    )
    if len(homogeneous) != len(values):
        return _OPEN
    # One slot is taken by "not stated", and one more by `null` when nullable.
    if len(homogeneous) + (2 if nullable else 1) > MAX_CHOICE_OPTIONS:
        return _OPEN
    return {"kind": "enum", "values": homogeneous, "nullable": nullable}


def classify_property(schema: t.Any) -> ArgumentClass:
    """Classifies one dereferenced property. Anything that is not a closed set is open-ended."""
    parsed = parse_property(schema)
    if parsed is None:
        return _OPEN
    types = _types_of(parsed)
    nullable_hint = parsed.get("nullable") is True or "null" in types
    value_types = [declared for declared in types if declared != "null"]

    if "object" in value_types:
        return _OPEN

    if "array" in value_types:
        items = parsed.get("items")
        if len(value_types) != 1 or not isinstance(items, dict):
            return _OPEN
        item_class = classify_property(items)
        if item_class["kind"] != "enum" or item_class["nullable"]:
            return _OPEN
        array_class: EnumArrayClass = {
            "kind": "enum_array",
            "values": item_class["values"],
        }
        if "maxItems" in parsed:
            array_class["maxItems"] = _normalize_number(parsed["maxItems"])
        return array_class

    members = _literal_members(parsed)
    if members is not None:
        return _classify_members(members, nullable_hint)
    if value_types == ["boolean"]:
        return {"kind": "boolean"}
    return _OPEN
