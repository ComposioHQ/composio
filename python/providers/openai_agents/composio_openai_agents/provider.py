import asyncio
import json
import typing as t

import pydantic
from agents import FunctionTool

from composio.core.provider import AgenticProvider
from composio.core.provider.agentic import AgenticProviderExecuteFn
from composio.types import Tool
from composio.utils.pydantic import parse_pydantic_error


# Recursively remove 'examples' keys from the schema properties
def _remove_examples_from_schema(schema_obj: t.Dict[str, t.Any]) -> None:
    """
    Remove 'examples', 'pattern', and 'default' keys from all properties in the
    schema, including nested ones. Also ensure that any 'items' object has a 'type' key.
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

                # Ensure 'items' has a 'type' key
                if "items" in prop_value and isinstance(prop_value["items"], dict):
                    if "type" not in prop_value["items"]:
                        # Default to string type for items if not specified
                        prop_value["items"]["type"] = "string"

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
        # Ensure items has a type
        if "type" not in schema_obj["items"]:
            schema_obj["items"]["type"] = "string"
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

    def wrap_tool(
        self,
        tool: Tool,
        execute_tool: AgenticProviderExecuteFn,
    ) -> FunctionTool:
        """Wrap a tool as a FunctionTool."""

        # Create a function that accepts explicit JSON string for parameters
        # This avoids the issue with **kwargs in schema validation
        async def execute_tool_wrapper(_ctx, payload):
            """Execute Composio action with the given arguments."""
            try:
                return json.dumps(
                    obj=(
                        await asyncio.to_thread(  # Running a thread since `execute_tool` is not async
                            execute_tool,
                            slug=tool.slug,
                            arguments=json.loads(payload) if payload else {},
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

        # Ensure the schema has additionalProperties set to false
        # this is required by OpenAI's function validation
        modified_schema = tool.input_parameters.copy()
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
