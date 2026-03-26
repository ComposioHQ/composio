"""Standalone functions for custom tool lookup and execution.

Extracted for reuse in SessionContextImpl (sibling routing).
"""

from __future__ import annotations

import typing as t

from pydantic import ValidationError as PydanticValidationError

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
    return map_.by_final_slug.get(upper) or map_.by_original_slug.get(upper)


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
