"""ComposioLangChain class definition"""

import re
import types
import typing as t
from inspect import Signature

import pydantic
from langchain_core.tools import StructuredTool as BaseStructuredTool

from composio.core.provider import AgenticProvider, AgenticProviderExecuteFn
from composio.types import Tool
from composio.utils.pydantic import parse_pydantic_error
from composio.utils.shared import (
    get_signature_format_from_schema_params,
    json_schema_to_model,
)

_python_reserved = {"for", "async"}
# Regex pattern for valid Python identifiers
_valid_identifier_pattern = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")
_obj_marker = "-_object_-"


def _clean_reserved_keyword(keyword: str):
    return f"{keyword}_rs"


def _is_valid_python_identifier(name: str) -> bool:
    """Check if a string is a valid Python identifier."""
    return bool(_valid_identifier_pattern.match(name))


def _sanitize_param_name(name: str) -> str:
    """
    Sanitize a parameter name to be a valid Python identifier.

    Replaces invalid characters (like brackets) with underscores and ensures
    the name starts with a letter or underscore.
    """
    # Replace common invalid patterns
    # e.g., "parameters[date]" -> "parameters_date_"
    sanitized = re.sub(r"[^a-zA-Z0-9_]", "_", name)

    # Ensure it starts with a letter or underscore
    if sanitized and sanitized[0].isdigit():
        sanitized = f"_{sanitized}"

    # Remove consecutive underscores and trailing underscores for cleaner names
    sanitized = re.sub(r"_+", "_", sanitized)
    sanitized = sanitized.rstrip("_")

    return sanitized if sanitized else "_param"


def _substitute_reserved_python_keywords(schema: t.Dict) -> t.Tuple[dict, dict]:
    """Make JSON-schema property names safe for LangChain/Pydantic.

    LangChain ultimately turns JSON schema into Python call signatures / Pydantic models,
    so property names must be valid Python identifiers.

    This function rewrites `schema["properties"]` keys when needed:
    - Reserved Python keywords (e.g. `for`, `async`) are renamed via `_clean_reserved_keyword`.
    - Invalid identifiers (e.g. `parameters[date]`) are sanitized via `_sanitize_param_name`.

    Returns:
    - The modified schema
    - A mapping from the sanitized name back to the original name, plus nested mappings
      stored under `<sanitized>-_object_-` for object-typed properties.
    """
    if "properties" not in schema:
        return schema, {}

    rename_map: dict = {}

    # NOTE: We iterate over a snapshot of keys because we'll be popping/reinserting keys.
    for original_name in list(schema["properties"]):
        # Step 1: Determine whether the name needs rewriting.
        is_reserved = original_name in _python_reserved
        is_valid_identifier = _is_valid_python_identifier(original_name)
        if not (is_reserved or not is_valid_identifier):
            continue

        # Step 2: Detach the property's schema so we can reinsert it under a new key.
        prop_schema = schema["properties"].pop(original_name)

        # Step 3: Recurse for nested objects so we also sanitize their sub-properties.
        nested_rename_map: dict = {}
        if prop_schema.get("type") == "object":
            prop_schema, nested_rename_map = _substitute_reserved_python_keywords(
                schema=prop_schema
            )

        # Step 4: Compute a valid Python identifier for this property.
        if is_reserved:
            sanitized_name = _clean_reserved_keyword(keyword=original_name)
        else:
            sanitized_name = _sanitize_param_name(original_name)

        # Step 5: Ensure we don't overwrite an existing property.
        # If a collision happens, add an incrementing suffix: <name>_2, <name>_3, ...
        base_name = sanitized_name
        if base_name in schema["properties"]:
            i = 2
            while f"{base_name}_{i}" in schema["properties"]:
                i += 1
            sanitized_name = f"{base_name}_{i}"

        # Step 6: Reinsert + record the mapping for later reinstatement of original keys.
        schema["properties"][sanitized_name] = prop_schema
        rename_map[sanitized_name] = original_name
        rename_map[f"{sanitized_name}{_obj_marker}"] = nested_rename_map

    return schema, rename_map


def _reinstate_reserved_python_keywords(request: dict, keywords: dict) -> dict:
    for clean_key in sorted(list(keywords), reverse=True):
        subkeys = None
        if clean_key.endswith(_obj_marker):
            subkeys = keywords[clean_key]
            clean_key, _ = clean_key.split(_obj_marker, maxsplit=1)

        if clean_key not in request:
            continue

        orginal_value = request.pop(clean_key)
        if subkeys is not None:
            orginal_value = _reinstate_reserved_python_keywords(
                request=orginal_value,
                keywords=subkeys,
            )
        request[keywords[clean_key]] = orginal_value
    return request


class StructuredTool(BaseStructuredTool):  # type: ignore[misc]
    def run(self, *args, **kwargs):
        try:
            return super().run(*args, **kwargs)
        except pydantic.ValidationError as e:
            return {"successful": False, "error": parse_pydantic_error(e), "data": None}


class LangchainProvider(
    AgenticProvider[StructuredTool, t.List[StructuredTool]],
    name="langchain",
):
    """
    Composio toolset for Langchain framework.
    """

    runtime = "langchain"

    def wrap_tool(
        self, tool: Tool, execute_tool: AgenticProviderExecuteFn
    ) -> StructuredTool:
        """Wraps composio tool as Langchain StructuredTool object."""
        # Replace reserved python keywords
        schema_params, keywords = _substitute_reserved_python_keywords(
            schema=tool.input_parameters
        )

        def function(**kwargs: t.Any) -> t.Dict:
            """Wrapper function for composio action."""
            kwargs = _reinstate_reserved_python_keywords(
                request=kwargs,
                keywords=keywords,
            )
            return execute_tool(tool.slug, kwargs)

        action_func = types.FunctionType(
            function.__code__,
            globals=globals(),
            name=tool.slug,
            closure=function.__closure__,
        )
        action_func.__signature__ = Signature(  # type: ignore
            parameters=get_signature_format_from_schema_params(
                schema_params=schema_params
            )
        )
        action_func.__doc__ = tool.description

        return t.cast(
            StructuredTool,
            StructuredTool.from_function(
                name=tool.slug,
                description=tool.description,
                args_schema=json_schema_to_model(
                    json_schema=schema_params,
                    skip_default=self.skip_default,
                ),
                return_schema=True,
                func=action_func,
                handle_tool_error=True,
                handle_validation_error=True,
            ),
        )

    def wrap_tools(
        self,
        tools: t.Sequence[Tool],
        execute_tool: AgenticProviderExecuteFn,
    ) -> t.List[StructuredTool]:
        """
        Get composio tools wrapped as Langchain StructuredTool objects.
        """
        return [self.wrap_tool(tool=tool, execute_tool=execute_tool) for tool in tools]
