"""Best-effort secret redaction for free-form telemetry text."""

from __future__ import annotations

import re
import typing as t
from collections.abc import Mapping

_REDACTED = "[REDACTED]"
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
    if isinstance(value, Mapping):
        return {
            key: _REDACTED
            if isinstance(key, str) and _SECRET_KEY.fullmatch(key)
            else redact_sensitive_value(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact_sensitive_value(item) for item in value]
    if isinstance(value, tuple):
        return tuple(redact_sensitive_value(item) for item in value)
    if isinstance(value, str):
        return redact_sensitive_text(value)
    return value
