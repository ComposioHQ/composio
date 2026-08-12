"""Best-effort secret redaction for free-form telemetry text."""

from __future__ import annotations

import re

_REDACTED = "[REDACTED]"
_URL_QUERY = re.compile(r"(\bhttps?://[^\s?#'\"]+)\?[^\s'\"]*", re.IGNORECASE)
_AUTHORIZATION = re.compile(r"\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+", re.IGNORECASE)
# The separator group allows a quote directly after the key name so JSON and
# dict reprs are covered: in `{"api_key": "secret"}` the key's own closing quote
# sits between the name and the colon.
_SECRET_PAIR = re.compile(
    # Leading lookbehind (not \\b) so env-style names like COMPOSIO_API_KEY still
    # match: underscore is a word char, so \\b can't fire between COMPOSIO_ and API.
    r"(?<![A-Za-z0-9])(authorization|api[-_]?key|apikey|x-api-key|access[-_]?token|refresh[-_]?token|client[-_]?secret|secret|password|passwd|pwd)\b([\"']?\s*[:=]+\s*)([\"']?)([^\s\"',}&]+)\3",
    re.IGNORECASE,
)


def redact_sensitive_text(value: str) -> str:
    """Remove common URL, authorization, and key-value secret shapes."""
    value = _URL_QUERY.sub(rf"\1?{_REDACTED}", value)
    value = _AUTHORIZATION.sub(rf"\1 {_REDACTED}", value)
    return _SECRET_PAIR.sub(rf"\1\2\3{_REDACTED}\3", value)
