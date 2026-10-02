import asyncio
import copy
import json
import typing as t

import pydantic
from agents import FunctionTool

from composio.core.provider import AgenticProvider
from composio.core.provider.agentic import AgenticProviderExecuteFn
from composio.core.provider.base import BaseProviderConfig
from composio.types import Tool
from composio.utils.logging import get as get_logger
from composio.utils.pydantic import parse_pydantic_error
from composio.utils.shared import normalize_tool_arguments
from composio.utils.strict_schema import omit_null_tool_arguments, to_strict_json_schema

logger = get_logger(__name__)

# Parameters registered for a tool without input parameters under strict mode.
_EMPTY_OBJECT_SCHEMA: t.Dict[str, t.Any] = {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": False,
}


# Recursively remove unsupported annotation/validation keys from schema properties.
def _remove_examples_from_schema(schema_obj: t.Dict[str, t.Any]) -> None:
    """
    Remove 'examples', 'pattern', and 'default' keys from all properties in the
    schema, including nested ones.

    Array item schemas are otherwise preserved verbatim. JSON Schema permits
    ``items`` to use combiners, references, object keywords, or an empty schema
    without declaring a direct ``type``.
    """
    # Handle properties directly
    if "properties" in schema_obj and isinstance(schema_obj["properties"], dict):
        for _, prop_value in schema_obj["properties"].items():
            if isinstance(prop_value, dict):
                # Remove examples, pattern, and default from this property
                if "examples" in prop_value:
                    del prop_value["examples"]
                if "pattern" in prop_value:
                    del prop_value["pattern"]
                if "default" in prop_value:
                    del prop_value["default"]

                # Recursively process nested properties
                _remove_examples_from_schema(prop_value)

    # Handle array items
    if "items" in schema_obj and isinstance(schema_obj["items"], dict):
        if "examples" in schema_obj["items"]:
            del schema_obj["items"]["examples"]
        if "pattern" in schema_obj["items"]:
            del schema_obj["items"]["pattern"]
        if "default" in schema_obj["items"]:
            del schema_obj["items"]["default"]
        _remove_examples_from_schema(schema_obj["items"])

    # Handle any other nested object properties
    for _, value in schema_obj.items():
        if isinstance(value, dict):
            _remove_examples_from_schema(value)
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    _remove_examples_from_schema(item)


class OpenAIAgentsProvider(
    AgenticProvider[FunctionTool, list[FunctionTool]],
    name="openai_agents",
):
    """
    Composio toolset for OpenAI Agents framework.
    """

    def __init__(
        self, strict: bool = False, **kwargs: t.Unpack[BaseProviderConfig]
    ) -> None:
        """
        :param strict: Emit wrapped tools with ``strict: true`` and normalize
            their parameter schemas for OpenAI structured outputs (every
            object fully required and closed, optional properties widened to
            accept ``null``, local ``$ref``/``$defs`` kept). Mirrors the
            TypeScript ``OpenAIAgentsProvider({ strict })`` option and this
            package's own ``OpenAIResponsesProvider({ strict })``. Tools
            whose schema strict mode cannot express are registered without
            strict mode instead. Defaults to ``False``.
        """
        super().__init__(**kwargs)
        self.strict = strict

    def wrap_tool(
        self,
        tool: Tool,
        execute_tool: AgenticProviderExecuteFn,
    ) -> FunctionTool:
        """Wrap a tool as a FunctionTool."""

        # Under strict mode optional parameters are emitted as
        # required-nullable, so a ``null`` the tool's own schema does not
        # accept means "omitted". ``strict_source`` is the schema the strict
        # rewrite was computed from, or ``None`` when this tool isn't
        # registered under strict mode.
        strict_source: t.Optional[t.Dict[str, t.Any]] = None

        # Create a function that accepts explicit JSON string for parameters
        # This avoids the issue with **kwargs in schema validation
        async def execute_tool_wrapper(_ctx, payload):
            """Execute Composio action with the given arguments."""
            try:
                # Models occasionally emit arguments as a JSON string (issue #2406).
                arguments = normalize_tool_arguments(payload)
                if strict_source is not None:
                    arguments = omit_null_tool_arguments(arguments, strict_source)
                return json.dumps(
                    obj=(
                        await asyncio.to_thread(  # Running a thread since `execute_tool` is not async
                            execute_tool,
                            slug=tool.slug,
                            arguments=arguments,
                        )
                    )
                )
            except pydantic.ValidationError as e:
                return json.dumps(
                    {
                        "successful": False,
                        "error": parse_pydantic_error(e),
                        "data": None,
                    }
                )
            except Exception as e:
                return json.dumps(
                    {
                        "successful": False,
                        "error": str(e),
                        "data": None,
                    }
                )

        if self.strict:
            source = (
                tool.input_parameters
                if tool.input_parameters is not None
                else dict(_EMPTY_OBJECT_SCHEMA)
            )
            strict = to_strict_json_schema(source)
            if not strict.unsupported:
                strict_source = strict.source
                return FunctionTool(
                    name=tool.slug,
                    description=tool.description,
                    params_json_schema=strict.schema,
                    on_invoke_tool=execute_tool_wrapper,
                    strict_json_schema=True,
                )
            reasons = "; ".join(
                f"{entry.path or '<root>'}: {entry.keyword} ({entry.detail})"
                for entry in strict.unsupported
            )
            logger.warning(
                'OpenAIAgentsProvider: tool "%s" is registered without strict '
                "mode because its schema cannot be expressed as strict "
                "structured outputs: %s",
                tool.slug,
                reasons,
            )

        # Ensure the schema has additionalProperties set to false
        # this is required by OpenAI's function validation.
        # Deep-copy so the in-place edits below (additionalProperties + the
        # examples/pattern/default removal) never mutate the caller's
        # Tool.input_parameters, matching the deepcopy contract in
        # composio.utils.shared.
        modified_schema = copy.deepcopy(tool.input_parameters)
        modified_schema["additionalProperties"] = False

        # Apply the example removal function. This is done to optimize the
        # schema as much as possible for Responses API
        _remove_examples_from_schema(modified_schema)

        # Create a custom FunctionTool with the appropriate schema
        return FunctionTool(
            name=tool.slug,
            description=tool.description,
            params_json_schema=modified_schema,
            on_invoke_tool=execute_tool_wrapper,
            # To avoid schema errors due to required flags. Composio tools
            # already process to have optimal schemas.
            strict_json_schema=False,
        )

    def wrap_tools(
        self,
        tools: t.Sequence[Tool],
        execute_tool: AgenticProviderExecuteFn,
    ) -> list[FunctionTool]:
        """Wrap a list of tools as a list of FunctionTools."""
        return [self.wrap_tool(tool, execute_tool) for tool in tools]
