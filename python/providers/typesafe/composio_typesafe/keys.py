"""Option keys for compiled Choice questions."""

from __future__ import annotations

import re
import typing as t

from .types import TypesafeOption, TypesafeOptionValue

# Generated option keys. A raw label can never start with `__`, so these never collide.
NOT_STATED_KEY = "__not_stated__"
NULL_KEY = "__null__"
NONE_KEY = "__none__"

# A Choice takes at most 255 options; one is always generated.
MAX_CHOICE_OPTIONS = 255

# Names a JavaScript object inherits. The TypeScript SDK cannot use them as keys,
# and both SDKs must compile the same tool into the same questions.
_OBJECT_PROTOTYPE_NAMES = frozenset(
    {
        "constructor",
        "prototype",
        "toString",
        "toLocaleString",
        "valueOf",
        "hasOwnProperty",
        "isPrototypeOf",
        "propertyIsEnumerable",
    }
)

# Numeric-looking keys reorder in JavaScript objects. `[0-9]` and `fullmatch` keep the
# pattern identical to the TypeScript one: `\d` matches Unicode digits in Python, and
# `$` matches before a trailing newline.
_NUMERIC_LOOKING = re.compile(r"[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?")
_NON_FINITE = frozenset({"Infinity", "+Infinity", "-Infinity", "NaN"})
_EDGE_WHITESPACE = " \t\n\r"
_INDEX_PREFIXED = re.compile(r"o[0-9]+_")
_ALPHANUMERIC = frozenset(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
)


def is_safe_label(label: str) -> bool:
    """Whether a label can be sent to Jev as its own option key."""
    return (
        len(label) > 0
        and not label.startswith("__")
        and label not in _OBJECT_PROTOTYPE_NAMES
        and _NUMERIC_LOOKING.fullmatch(label) is None
        and label not in _NON_FINITE
        and label[0] not in _EDGE_WHITESPACE
        and label[-1] not in _EDGE_WHITESPACE
        and _INDEX_PREFIXED.match(label) is None
    )


def index_prefixed_key(label: str, index: int) -> str:
    """`o<index>_<label with every non-alphanumeric code point replaced by _>`, capped at 32 code points."""
    slug = "".join(
        character if character in _ALPHANUMERIC else "_" for character in label[:32]
    )
    return f"o{index}_{slug}"


def option_key(label: str, index: int) -> str:
    return label if is_safe_label(label) else index_prefixed_key(label, index)


def option_label(value: TypesafeOptionValue) -> str:
    """Labels for option values. Integers are safe integers, so `str` matches JavaScript's `String`."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def build_options(values: t.Sequence[t.Union[str, int]]) -> t.List[TypesafeOption]:
    """Builds options in declared order. `values` holds no duplicates and no `None`."""
    return [
        {
            "key": option_key(value, index)
            if isinstance(value, str)
            else index_prefixed_key(str(value), index),
            "value": value,
        }
        for index, value in enumerate(values)
    ]


def option_values(
    options: t.Sequence[TypesafeOption],
) -> t.Dict[str, TypesafeOptionValue]:
    """Maps each option key back to its typed value."""
    return {option["key"]: option["value"] for option in options}
