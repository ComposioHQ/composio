"""Enum helpers."""

import re
import string


REPLACE = string.punctuation + " –“”"
PUNCTUATION_REGEX = re.compile(
    "|".join(re.escape(c) for c in string.punctuation if c != "_")
)


def get_enum_key(name: str) -> str:
    for char in REPLACE:
        name = name.replace(char, "_")
    return name.upper().replace("__", "_").replace("__", "_")
