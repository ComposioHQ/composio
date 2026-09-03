"""Standalone functions for custom tool lookup and execution.

Extracted for reuse in SessionContextImpl (sibling routing).

Security invariant (CWE-639 / SEC-365): on this code path the trusted
``user_id`` arrives via ``SessionContext`` — never via ``arguments``. The
``arguments`` dict is LLM-supplied and is validated through the tool's
Pydantic ``input_params`` model, which discards unknown fields, so an
attempt to smuggle ``user_id`` (or any other identity-bearing key) inside
``arguments`` cannot reach the tool's execute function or auth lookup.
Keep this property when modifying ``execute_custom_tool``.
"""

from __future__ import annotations

import typing as t

from pydantic import ValidationError as PydanticValidationError

from composio.exceptions import ValidationError

from .custom_tool_types import (
    CustomToolsMap,
    CustomToolsMapEntry,
    SessionContext,
)
from .tools import ToolExecutionResponse


def find_custom_tool(
    map_: t.Optional[CustomToolsMap],
    slug: str,
) -> t.Optional[CustomToolsMapEntry]:
    """Find a custom tool entry by slug.

    Checks both the final slug map (LOCAL_X — agent/LLM path)
    and original slug map (X — programmatic path). Case-insensitive.
    """
    if map_ is None:
        return None
    upper = slug.upper()
    final_slug_match = map_.by_final_slug.get(upper)
    if final_slug_match is not None:
        return final_slug_match
    if upper in map_.ambiguous_original_slugs:
        return None
    return map_.by_original_slug.get(upper)


def assert_unambiguous_custom_tool_slug(
    map_: t.Optional[CustomToolsMap], slug: str
) -> None:
    """Reject ambiguous bare original slugs before remote fallback."""
    if map_ is None:
        return

    upper = slug.upper()
    if upper not in map_.ambiguous_original_slugs:
        return

    final_slugs = sorted(
        entry.final_slug
        for entry in map_.by_final_slug.values()
        if entry.handle.slug.upper() == upper
    )
    hint = f" Use one of: {', '.join(final_slugs)}." if final_slugs else ""
    raise ValidationError(
        f'Ambiguous custom tool slug "{slug}". Multiple custom toolkit tools '
        "share this original slug; manual session.execute() by original slug "
        "is only supported when the original slug is unique."
        f"{hint}"
    )


def execute_custom_tool(
    entry: CustomToolsMapEntry,
    arguments: t.Dict[str, t.Any],
    session_context: SessionContext,
) -> ToolExecutionResponse:
    """Execute a custom tool in-process.

    Validates input via the Pydantic model, calls the user's execute function,
    and wraps the result into the standard response format.
    """
    handle = entry.handle

    # Validate and transform input using the Pydantic model.
    # This applies defaults, coercions, and validators.
    try:
        validated = handle.input_params.model_validate(arguments)
    except PydanticValidationError as e:
        return {
            "data": {},
            "error": f"Input validation failed: {e}",
            "successful": False,
        }

    try:
        # User's execute returns data directly — we wrap into {data, error, successful}
        data = handle.execute(validated, session_context)
        return {
            "data": data if data is not None else {},
            "error": None,
            "successful": True,
        }
    except Exception as e:
        return {
            "data": {},
            "error": str(e),
            "successful": False,
        }
