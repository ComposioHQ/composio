"""Enum helpers."""


def get_enum_key(name: str) -> str:
    characters_to_replace = [" ", "-", "/", "(", ")", "\\", ":", '"', "'", ".", "&"]
    for char in characters_to_replace:
        name = name.replace(char, "_")
    return name.upper()
