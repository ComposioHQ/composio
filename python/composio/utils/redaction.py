"""Best-effort secret redaction for free-form telemetry text."""

from __future__ import annotations

import re

_REDACTED = "[REDACTED]"
_URL_QUERY = re.compile(r"(\bhttps?://[^\s?#'\"]+)\?[^\s'\"]*", re.IGNORECASE)
_AUTHORIZATION = re.compile(r"\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+", re.IGNORECASE)
_SECRET_PAIR = re.compile(
    r"\b(authorization|api[-_]?key|apikey|x-api-key|access[-_]?token|refresh[-_]?token|client[-_]?secret|secret|password|passwd|pwd)\b(\s*[:=]+\s*)([\"']?)([^\s\"',}&]+)\3",
    re.IGNORECASE,
)


def redact_sensitive_text(value: str) -> str:
    """Remove common URL, authorization, and key-value secret shapes."""
    value = _URL_QUERY.sub(rf"\1?{_REDACTED}", value)
    value = _AUTHORIZATION.sub(rf"\1 {_REDACTED}", value)
    return _SECRET_PAIR.sub(rf"\1\2\3{_REDACTED}\3", value)
