"""Best-effort secret redaction for free-form telemetry text."""

from __future__ import annotations

import re
import typing as t
from collections.abc import Mapping

_REDACTED = "[REDACTED]"
_MAX_STRUCTURED_REDACTION_DEPTH = 32
_MAX_STRUCTURED_REDACTION_NODES = 10_000
_URL_QUERY = re.compile(r"(\bhttps?://[^\s?#'\"]+)\?[^\s'\"]*", re.IGNORECASE)
_AUTHORIZATION = re.compile(r"\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+", re.IGNORECASE)
_SECRET_KEY_PATTERN = (
    r"authorization|auth|api[-_]?key|apikey|x-api-key|access[-_]?token|"
    r"refresh[-_]?token|client[-_]?secret|secret|password|passwd|pwd"
)
_SECRET_KEY_WITH_PREFIX_PATTERN = rf"(?:[A-Za-z0-9]+_)*(?:{_SECRET_KEY_PATTERN})"
_SECRET_KEY = re.compile(_SECRET_KEY_WITH_PREFIX_PATTERN, re.IGNORECASE)
# Quoted keys are matched as a unit so a key-like word at the end of an error
# string cannot treat the string's closing quote as the start of a secret value.
_QUOTED_SECRET_KEY_PREFIX = (
    rf"([\"'])({_SECRET_KEY_WITH_PREFIX_PATTERN})\1(\s*[:=]+\s*)"
)
_BARE_SECRET_KEY_PREFIX = rf"(?<![A-Za-z0-9\"'])({_SECRET_KEY_PATTERN})\b(\s*[:=]+\s*)"
_ESCAPED_SECRET_KEY_PREFIX = (
    rf"(?<![A-Za-z0-9])({_SECRET_KEY_PATTERN})\b((?:\\[\"'])?\s*[:=]+\s*)"
)
_QUOTED_KEY_DOUBLE_QUOTED_VALUE = re.compile(
    rf'{_QUOTED_SECRET_KEY_PREFIX}"(?:\\.|[^"\\\r\n])*"', re.IGNORECASE
)
_QUOTED_KEY_SINGLE_QUOTED_VALUE = re.compile(
    rf"{_QUOTED_SECRET_KEY_PREFIX}'(?:\\.|[^'\\\r\n])*'", re.IGNORECASE
)
_BARE_KEY_DOUBLE_QUOTED_VALUE = re.compile(
    rf'{_BARE_SECRET_KEY_PREFIX}"((?:\\.|[^"\\\r\n])*)"',
    re.IGNORECASE,
)
_BARE_KEY_SINGLE_QUOTED_VALUE = re.compile(
    rf"{_BARE_SECRET_KEY_PREFIX}'((?:\\.|[^'\\\r\n])*)'",
    re.IGNORECASE,
)
_BARE_KEY_ESCAPED_DOUBLE_QUOTED_VALUE = re.compile(
    rf'{_ESCAPED_SECRET_KEY_PREFIX}\\"((?:\\.|[^"\\\r\n])*)\\"',
    re.IGNORECASE,
)
_BARE_KEY_ESCAPED_SINGLE_QUOTED_VALUE = re.compile(
    rf"{_ESCAPED_SECRET_KEY_PREFIX}\\'((?:\\.|[^'\\\r\n])*)\\'",
    re.IGNORECASE,
)
_SECRET_PAIR_PREFIX = rf"(?<![A-Za-z0-9])({_SECRET_KEY_PATTERN})\b([\"']?\s*[:=]+\s*)"
_SECRET_PAIR_UNQUOTED = re.compile(
    rf"{_SECRET_PAIR_PREFIX}(?!\\[\"'])([^\s\"',}}&]+)", re.IGNORECASE
)
_COMPLETES_DOUBLE_QUOTED_FIELD = re.compile(r'(?:\\.|[^"\\\r\n])*"\s*[:=]')
_COMPLETES_SINGLE_QUOTED_FIELD = re.compile(r"(?:\\.|[^'\\\r\n])*'\s*[:=]")
_CONTAINS_QUOTED_FIELD = re.compile(r"(?:^|[,{\s])([\"'])[^\"'\\\r\n]+\1\s*[:=]\s*$")


def _active_quotes_at(value: str, offsets: set[int]) -> dict[int, str | None]:
    active_quotes: dict[int, str | None] = {}
    quote: str | None = None
    escaped = False
    last_offset = max(offsets)

    for position, character in enumerate(value):
        if position in offsets:
            active_quotes[position] = quote
            if position == last_offset:
                break
        if character in "\r\n":
            quote = None
            escaped = False
            continue
        previous = value[position - 1] if position > 0 else ""
        if previous in "\r\n":
            previous = ""
        following = value[position + 1] if position + 1 < len(value) else ""
        if quote is None:
            if character == '"' or (
                character == "'" and not (previous.isalnum() or previous == "_")
            ):
                quote = character
            continue
        if escaped:
            escaped = False
        elif character == "\\":
            escaped = True
        elif character == quote:
            if (
                quote == "'"
                and (previous.isalnum() or previous == "_")
                and (following.isalnum() or following == "_")
            ):
                continue
            quote = None

    return active_quotes


def _redact_bare_quoted_value(value: str, pattern: re.Pattern[str], quote: str) -> str:
    matches = list(pattern.finditer(value))
    if not matches:
        return value

    active_quotes = _active_quotes_at(value, {match.start() for match in matches})
    completes_field = (
        _COMPLETES_DOUBLE_QUOTED_FIELD
        if quote == '"'
        else _COMPLETES_SINGLE_QUOTED_FIELD
    )
    parts: list[str] = []
    cursor = 0
    for match in matches:
        parts.append(value[cursor : match.start()])
        if active_quotes[match.start()] == quote and (
            completes_field.match(value, match.end())
            or _CONTAINS_QUOTED_FIELD.search(match.group(3))
        ):
            parts.append(match.group(0))
        else:
            parts.append(f"{match.group(1)}{match.group(2)}{quote}{_REDACTED}{quote}")
        cursor = match.end()

    parts.append(value[cursor:])
    return "".join(parts)


def redact_sensitive_text(value: str) -> str:
    """Remove common URL, authorization, and key-value secret shapes."""
    value = _URL_QUERY.sub(rf"\1?{_REDACTED}", value)
    value = _AUTHORIZATION.sub(rf"\1 {_REDACTED}", value)
    value = _QUOTED_KEY_DOUBLE_QUOTED_VALUE.sub(rf'\1\2\1\3"{_REDACTED}"', value)
    value = _QUOTED_KEY_SINGLE_QUOTED_VALUE.sub(rf"\1\2\1\3'{_REDACTED}'", value)
    value = _BARE_KEY_ESCAPED_DOUBLE_QUOTED_VALUE.sub(rf'\1\2\\"{_REDACTED}\\"', value)
    value = _BARE_KEY_ESCAPED_SINGLE_QUOTED_VALUE.sub(rf"\1\2\\'{_REDACTED}\\'", value)
    value = _redact_bare_quoted_value(value, _BARE_KEY_DOUBLE_QUOTED_VALUE, '"')
    value = _redact_bare_quoted_value(value, _BARE_KEY_SINGLE_QUOTED_VALUE, "'")
    return _SECRET_PAIR_UNQUOTED.sub(rf"\1\2{_REDACTED}", value)


def redact_sensitive_value(value: t.Any) -> t.Any:
    """Redact secrets in structured logging metadata without changing safe scalar types."""
    active_containers: set[int] = set()
    remaining_nodes = _MAX_STRUCTURED_REDACTION_NODES

    def redact(item: t.Any, depth: int) -> t.Any:
        nonlocal remaining_nodes
        if depth >= _MAX_STRUCTURED_REDACTION_DEPTH or remaining_nodes <= 0:
            return _REDACTED
        remaining_nodes -= 1

        if isinstance(item, (Mapping, list, tuple)):
            identity = id(item)
            if identity in active_containers:
                return _REDACTED
            active_containers.add(identity)
            try:
                if isinstance(item, Mapping):
                    redacted_mapping: dict[t.Any, t.Any] = {}
                    for key, nested in item.items():
                        if remaining_nodes <= 0:
                            break
                        if isinstance(key, str):
                            redacted_key: t.Any = redact_sensitive_text(key)
                        elif isinstance(key, (int, float, bool, type(None))):
                            redacted_key = key
                        else:
                            redacted_key = _REDACTED
                        if isinstance(key, str) and _SECRET_KEY.fullmatch(key):
                            remaining_nodes -= 1
                            redacted_mapping[redacted_key] = _REDACTED
                        else:
                            redacted_mapping[redacted_key] = redact(nested, depth + 1)
                    return redacted_mapping

                redacted_items: list[t.Any] = []
                fields = getattr(item, "_fields", ()) if isinstance(item, tuple) else ()
                for index, nested in enumerate(item):
                    if remaining_nodes <= 0:
                        return _REDACTED
                    if (
                        index < len(fields)
                        and isinstance(fields[index], str)
                        and _SECRET_KEY.fullmatch(fields[index])
                    ):
                        remaining_nodes -= 1
                        redacted_items.append(_REDACTED)
                    else:
                        redacted_items.append(redact(nested, depth + 1))
                if isinstance(item, list):
                    if type(item) is list:
                        return redacted_items
                    try:
                        return type(item)(redacted_items)
                    except Exception:
                        return redacted_items
                if hasattr(item, "_fields"):
                    try:
                        return type(item)(*redacted_items)
                    except Exception:
                        pass
                return tuple(redacted_items)
            finally:
                active_containers.remove(identity)

        if isinstance(item, str):
            return redact_sensitive_text(item)
        if isinstance(item, (int, float, bool, type(None))):
            return item
        if isinstance(item, (bytes, bytearray, memoryview)):
            return _REDACTED
        return _REDACTED

    return redact(value, 0)
