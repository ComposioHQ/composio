"""Enum helpers."""

import string


REPLACE = string.punctuation + " –“”"


def get_enum_key(name: str) -> str:
    for char in REPLACE:
        name = name.replace(char, "_")
    return name.upper().replace("__", "_").replace("__", "_")
