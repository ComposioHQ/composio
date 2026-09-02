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
_SECRET_KEY = re.compile(rf"(?:[A-Za-z0-9]+_)*(?:{_SECRET_KEY_PATTERN})", re.IGNORECASE)
# The separator group allows a quote directly after the key name so JSON and
# dict reprs are covered: in `{"api_key": "secret"}` the key's own closing quote
# sits between the name and the colon. Quoted rules run first so whitespace is
# part of the redacted value instead of preventing a match.
_SECRET_PAIR_PREFIX = rf"(?<![A-Za-z0-9])({_SECRET_KEY_PATTERN})\b([\"']?\s*[:=]+\s*)"
_SECRET_PAIR_DOUBLE_QUOTED = re.compile(
    rf'{_SECRET_PAIR_PREFIX}"(?:\\.|[^"\\\r\n])*"', re.IGNORECASE
)
_SECRET_PAIR_SINGLE_QUOTED = re.compile(
    rf"{_SECRET_PAIR_PREFIX}'(?:\\.|[^'\\\r\n])*'", re.IGNORECASE
)
_SECRET_PAIR_UNQUOTED = re.compile(
    rf"{_SECRET_PAIR_PREFIX}([^\s\"',}}&]+)", re.IGNORECASE
)


def redact_sensitive_text(value: str) -> str:
    """Remove common URL, authorization, and key-value secret shapes."""
    value = _URL_QUERY.sub(rf"\1?{_REDACTED}", value)
    value = _AUTHORIZATION.sub(rf"\1 {_REDACTED}", value)
    value = _SECRET_PAIR_DOUBLE_QUOTED.sub(rf'\1\2"{_REDACTED}"', value)
    value = _SECRET_PAIR_SINGLE_QUOTED.sub(rf"\1\2'{_REDACTED}'", value)
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
                    return {
                        key: _REDACTED
                        if isinstance(key, str) and _SECRET_KEY.fullmatch(key)
                        else redact(nested, depth + 1)
                        for key, nested in item.items()
                    }
                if isinstance(item, list):
                    return [redact(nested, depth + 1) for nested in item]
                return tuple(redact(nested, depth + 1) for nested in item)
            finally:
                active_containers.remove(identity)

        if isinstance(item, str):
            return redact_sensitive_text(item)
        return item

    return redact(value, 0)
