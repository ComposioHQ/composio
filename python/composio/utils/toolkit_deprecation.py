"""
Toolkit version deprecation warnings.

When a request resolves to a deprecated toolkit version, the API adds a
``Composio-Deprecated-Toolkits`` response header (an RFC 9651 structured-field
list). This module parses that header from an ``httpx`` response event hook
installed below the generated client, and warns once per process for each
deprecated toolkit version it sees. The response body is never read.

Example header::

    "GMAIL";version="20250114_00";deprecated=@1779840000;sunset=@1787788800;reason="lifecycle"

Kept intentionally equivalent to the TypeScript SDK's
``ts/packages/core/src/utils/toolkitDeprecation.ts``.
"""

from __future__ import annotations

import logging
import re
import threading
import typing as t
import warnings
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx

from composio.exceptions import ComposioDeprecationWarning
from composio.utils.toolkit_version import normalize_toolkit_slug

#: Response header name. ``httpx.Headers`` lookups are case-insensitive.
HEADER = "composio-deprecated-toolkits"

#: Anchor of the docs section every warning points at.
DOCS_URL = "https://docs.composio.dev/docs/tools-direct/toolkit-versioning#deprecation-and-sunset"

#: Versions named per toolkit before the formatter collapses the rest into "and N more".
_MAX_VERSIONS_PER_LINE = 5

#: The three limits below mirror the ``composio_client._deprecation`` module,
#: which reads the same kind of server-controlled header.
#: A header longer than this is ignored whole rather than parsed.
_MAX_HEADER_LENGTH = 2048
#: A header holding any of these is ignored whole, so nothing partially cleaned reaches the log.
_CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f]")
#: Keys the process will ever record; past this, new versions are neither recorded nor warned about.
_MAX_TRACKED_VERSIONS = 1024

_logger = logging.getLogger(__name__)

_SF_STRING = re.compile(r'^"((?:[^"\\]|\\.)*)"$')
_SF_DATE = re.compile(r"^@(-?\d{1,15})$")
_SF_ESCAPE = re.compile(r"\\(.)")


@dataclass(frozen=True)
class DeprecatedToolkit:
    """One item of the ``Composio-Deprecated-Toolkits`` header."""

    slug: str
    version: str
    deprecated_at: t.Optional[datetime] = None
    sunset_at: t.Optional[datetime] = None
    reason: t.Optional[str] = None

    @property
    def key(self) -> str:
        """Once-per-process dedupe key, ``UPPER(slug)@version``."""
        return f"{self.slug.upper()}@{self.version}"


_warned: set[str] = set()
_lock = threading.Lock()


def _split_outside_quotes(value: str, delimiter: str) -> list[str]:
    """Split ``value`` on ``delimiter`` outside double-quoted strings.

    Backslash escapes inside the quotes are honoured. Empty pieces are dropped
    and the rest are stripped of surrounding whitespace.
    """
    pieces: list[str] = []
    current: list[str] = []
    in_string = False
    index = 0
    while index < len(value):
        char = value[index]
        if in_string:
            current.append(char)
            if char == "\\" and index + 1 < len(value):
                index += 1
                current.append(value[index])
            elif char == '"':
                in_string = False
        elif char == '"':
            in_string = True
            current.append(char)
        elif char == delimiter:
            pieces.append("".join(current))
            current = []
        else:
            current.append(char)
        index += 1
    pieces.append("".join(current))
    return [piece.strip() for piece in pieces if piece.strip()]


def _decode_sf_string(raw: str) -> t.Optional[str]:
    """Decode an sf-string; ``None`` unless it is complete and validly escaped."""
    match = _SF_STRING.match(raw)
    if match is None:
        return None
    invalid = False

    def _unescape(escape: re.Match[str]) -> str:
        nonlocal invalid
        char = escape.group(1)
        if char in ('"', "\\"):
            return char
        invalid = True
        return ""

    decoded = _SF_ESCAPE.sub(_unescape, match.group(1))
    return None if invalid else decoded


def _decode_sf_date(raw: str) -> t.Optional[datetime]:
    """Decode an sf-date (``@`` plus Unix seconds) into an aware UTC datetime."""
    match = _SF_DATE.match(raw)
    if match is None:
        return None
    try:
        return datetime.fromtimestamp(int(match.group(1)), tz=timezone.utc)
    except (OverflowError, OSError, ValueError):
        return None


def _parse_item(item: str) -> t.Optional[DeprecatedToolkit]:
    """Parse one list item; ``None`` when the slug or a known parameter is invalid."""
    pieces = _split_outside_quotes(item, ";")
    if not pieces:
        return None
    head, *params = pieces
    slug = _decode_sf_string(head)
    if not slug:
        return None
    version: t.Optional[str] = None
    deprecated_at: t.Optional[datetime] = None
    sunset_at: t.Optional[datetime] = None
    reason: t.Optional[str] = None
    for param in params:
        key, separator, raw_value = param.partition("=")
        if not separator:
            continue
        key = key.strip()
        raw_value = raw_value.strip()
        if key == "version":
            version = _decode_sf_string(raw_value)
            if not version:
                return None
        elif key == "reason":
            reason = _decode_sf_string(raw_value)
            if not reason:
                return None
        elif key == "deprecated":
            deprecated_at = _decode_sf_date(raw_value)
            if deprecated_at is None:
                return None
        elif key == "sunset":
            sunset_at = _decode_sf_date(raw_value)
            if sunset_at is None:
                return None
        # Unknown parameters are ignored.
    if version is None:
        return None
    return DeprecatedToolkit(
        slug=slug,
        version=version,
        deprecated_at=deprecated_at,
        sunset_at=sunset_at,
        reason=reason,
    )


def parse_deprecated_toolkits_header(value: str) -> list[DeprecatedToolkit]:
    """Parse a ``Composio-Deprecated-Toolkits`` header value.

    Items that fail to parse are dropped silently; garbage input yields an
    empty list. Never raises.
    """
    try:
        entries: list[DeprecatedToolkit] = []
        for item in _split_outside_quotes(value, ","):
            entry = _parse_item(item)
            if entry is not None:
                entries.append(entry)
        return entries
    except Exception:  # pragma: no cover - defensive, the parser is total
        return []


def _iso_date(value: datetime) -> str:
    return value.astimezone(timezone.utc).date().isoformat()


def _pin_hint(slug: str, docs_url: str) -> str:
    config_key = normalize_toolkit_slug(slug)
    env_var = f"COMPOSIO_TOOLKIT_VERSION_{slug.upper()}"
    return (
        f'Pin a newer version with toolkit_versions={{"{config_key}": "<version>"}} '
        f"or {env_var}. See {docs_url}."
    )


def _format_single(entry: DeprecatedToolkit, docs_url: str) -> str:
    sentence = (
        f"[Deprecation] Toolkit {entry.slug.upper()} version {entry.version} "
        "was deprecated"
    )
    if entry.deprecated_at is not None:
        sentence += f" on {_iso_date(entry.deprecated_at)}"
    if entry.reason is not None:
        sentence += f" ({entry.reason})"
    if entry.sunset_at is not None:
        sentence += f" and will stop working on {_iso_date(entry.sunset_at)}"
    return f"{sentence}. {_pin_hint(entry.slug, docs_url)}"


def _format_group(
    slug: str, entries: t.Sequence[DeprecatedToolkit], docs_url: str
) -> str:
    versions = [entry.version for entry in entries]
    named = ", ".join(versions[:_MAX_VERSIONS_PER_LINE])
    remaining = len(versions) - _MAX_VERSIONS_PER_LINE
    listed = f"{named} and {remaining} more" if remaining > 0 else named
    sentence = f"[Deprecation] Toolkit {slug} versions {listed} are deprecated"
    sunsets = sorted(
        entry.sunset_at for entry in entries if entry.sunset_at is not None
    )
    if sunsets:
        sentence += f" and the earliest will stop working on {_iso_date(sunsets[0])}"
    return f"{sentence}. {_pin_hint(slug, docs_url)}"


def format_warnings(
    entries: t.Sequence[DeprecatedToolkit], docs_url: str = DOCS_URL
) -> list[str]:
    """Render one warning line per toolkit slug.

    A slug with a single deprecated version gets the full sentence with its
    dates and reason; a slug with several names at most five versions and
    collapses the rest into "and N more".
    """
    groups: dict[str, list[DeprecatedToolkit]] = {}
    for entry in entries:
        groups.setdefault(entry.slug.upper(), []).append(entry)
    return [
        _format_single(group[0], docs_url)
        if len(group) == 1
        else _format_group(slug, group, docs_url)
        for slug, group in groups.items()
    ]


def warn_deprecated_toolkits(headers: httpx.Headers, docs_url: str = DOCS_URL) -> None:
    """Warn once per process for each deprecated toolkit version in ``headers``."""
    value = headers.get(HEADER)
    if not value:
        return
    if len(value) > _MAX_HEADER_LENGTH or _CONTROL_CHARACTERS.search(value):
        return
    entries = parse_deprecated_toolkits_header(value)
    fresh: list[DeprecatedToolkit] = []
    with _lock:
        for entry in entries:
            if entry.key in _warned or len(_warned) >= _MAX_TRACKED_VERSIONS:
                continue
            _warned.add(entry.key)
            fresh.append(entry)
    for line in format_warnings(fresh, docs_url):
        warnings.warn(line, ComposioDeprecationWarning, stacklevel=2)


def response_hook(response: httpx.Response) -> None:
    """``httpx`` response event hook. Never raises and never reads the body."""
    try:
        warn_deprecated_toolkits(response.headers)
    except Exception:  # noqa: BLE001 - a warning must never fail a call
        _logger.debug("Failed to inspect the toolkit deprecation header", exc_info=True)


def install_hook(client: httpx.Client) -> None:
    """Append :func:`response_hook` to ``client`` once, keeping existing hooks.

    ``httpx.Client.event_hooks`` is a plain attribute holding the live dict in
    the pinned httpx, so appending to its ``response`` list takes effect
    immediately; the assignment below also covers an httpx that returns a copy.
    """
    hooks = client.event_hooks
    response_hooks = list(hooks.get("response", []))
    if any(hook is response_hook for hook in response_hooks):
        return
    response_hooks.append(response_hook)
    client.event_hooks = {**hooks, "response": response_hooks}


def _reset_for_tests() -> None:
    """Clear the once-per-process record. Tests only."""
    with _lock:
        _warned.clear()
