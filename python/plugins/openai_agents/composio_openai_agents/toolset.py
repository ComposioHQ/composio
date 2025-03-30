import json
import types
import typing as t
from inspect import Signature
from typing import List, cast

import pydantic
import pydantic.error_wrappers
from agents import FunctionTool, Tool

from composio import ActionType, AppType, TagType
from composio.tools import ComposioToolSet as BaseComposioToolSet
from composio.tools.toolset import ProcessorsType
from composio.utils.pydantic import parse_pydantic_error
from composio.utils.shared import get_signature_format_from_schema_params


class ComposioToolSet(
    BaseComposioToolSet,
    runtime="openai_agents",
    description_char_limit=1024,
    action_name_char_limit=64,
):
    """
    Composio toolset for OpenAI Agents framework.

    Example:
    ```python
    import os
    import asyncio
    import dotenv
    from agents import Agent, Runner

    from composio_openai_agents import App, ComposioToolSet

    # Load environment variables from .env
    dotenv.load_dotenv()

    # Initialize Composio toolset
    composio_toolset = ComposioToolSet()

    # Get all the tools
    tools = composio_toolset.get_tools(apps=[App.GITHUB])

    # Create an agent with the tools
    agent = Agent(
        name="GitHub Agent",
        instructions="You are a helpful assistant that helps users with GitHub tasks.",
        tools=tools,
    )

    # Run the agent
    async def main():
        result = await Runner.run(agent, "Star the repository composiohq/composio on GitHub")
        print(result.final_output)

    asyncio.run(main())
    ```
    """

    def _wrap_action(
        self,
        action: str,
        description: str,
        schema_params: t.Dict,
        entity_id: t.Optional[str] = None,
    ):
        def function(**kwargs: t.Any) -> t.Dict:
            """Wrapper function for composio action."""
            self.logger.debug(f"Executing action: {action} with params: {kwargs}")
            return self.execute_action(
                action=action,
                params=kwargs,
                entity_id=entity_id or self.entity_id,
                _check_requested_actions=True,
            )

        action_func = types.FunctionType(
            function.__code__,
            globals=globals(),
            name=action,
            closure=function.__closure__,
        )
        # Using setattr to avoid type checking errors
        setattr(
            action_func,
            "__signature__",
            Signature(
                parameters=get_signature_format_from_schema_params(
                    schema_params=schema_params
                )
            ),
        )

        # Using setattr to avoid type checking errors
        setattr(action_func, "__doc__", description)

        return action_func

    def _wrap_tool(
        self,
        schema: t.Dict[str, t.Any],
        entity_id: t.Optional[str] = None,
    ) -> FunctionTool:
        """Wraps composio tool as OpenAI Agents FunctionTool object."""
        action = schema["name"]
        description = schema["description"]
        schema_params = schema["parameters"]

        # Create a function that accepts explicit JSON string for parameters
        # This avoids the issue with **kwargs in schema validation
        async def execute_action_wrapper(_ctx, args_json):
            """Execute Composio action with the given arguments."""
            try:
                kwargs = json.loads(args_json) if args_json else {}

                result = self.execute_action(
                    action=action,
                    params=kwargs,
                    entity_id=entity_id or self.entity_id,
                    _check_requested_actions=True,
                )

                # Serialize the result to JSON string
                # The OpenAI API expects strings for tool outputs
                if not isinstance(result, dict):
                    result_dict = {"result": result}
                else:
                    result_dict = result

                # Convert to JSON string
                return json.dumps(result_dict)

            except pydantic.ValidationError as e:
                error_msg = parse_pydantic_error(e)
                return json.dumps(
                    {
                        "successful": False,
                        "error": error_msg,
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
        # This is required by OpenAI's function validation
        modified_schema = schema_params.copy()
        modified_schema["additionalProperties"] = False

        # Recursively remove 'examples' keys from the schema properties
        def remove_examples_from_schema(schema_obj: t.Dict[str, t.Any]) -> None:
            """Remove 'examples', 'pattern', and 'default' keys from all properties in the schema, including nested ones.
            Also ensure that any 'items' object has a 'type' key."""
            # Handle properties directly
            if "properties" in schema_obj and isinstance(
                schema_obj["properties"], dict
            ):
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
                        if "items" in prop_value and isinstance(
                            prop_value["items"], dict
                        ):
                            if "type" not in prop_value["items"]:
                                # Default to string type for items if not specified
                                prop_value["items"]["type"] = "string"

                        # Recursively process nested properties
                        remove_examples_from_schema(prop_value)

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
                remove_examples_from_schema(schema_obj["items"])

            # Handle any other nested object properties
            for _, value in schema_obj.items():
                if isinstance(value, dict):
                    remove_examples_from_schema(value)
                elif isinstance(value, list):
                    for item in value:
                        if isinstance(item, dict):
                            remove_examples_from_schema(item)

        # Apply the example removal function. This is done to optimize the schema as much as possible for Responses API
        remove_examples_from_schema(modified_schema)

        # Create a custom FunctionTool with the appropriate schema
        tool = FunctionTool(
            name=action,
            description=description,
            params_json_schema=modified_schema,
            on_invoke_tool=execute_action_wrapper,
            strict_json_schema=False,  # To avoid schema errors due to required flags. Composio tools already process to have optimal schemas.
        )

        return tool

    def get_tools(
        self,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        apps: t.Optional[t.Sequence[AppType]] = None,
        tags: t.Optional[t.List[TagType]] = None,
        entity_id: t.Optional[str] = None,
        *,
        processors: t.Optional[ProcessorsType] = None,
        check_connected_accounts: bool = True,
    ) -> List[Tool]:
        """
        Get composio tools wrapped as OpenAI Agents FunctionTool objects.

        :param actions: List of actions to wrap
        :param apps: List of apps to wrap
        :param tags: Filter the apps by given tags
        :param entity_id: Entity ID for the function wrapper
        :param processors: Optional request/response processors
        :param check_connected_accounts: Whether to check connected accounts

        :return: Composio tools wrapped as `FunctionTool` objects
        """
        self.validate_tools(apps=apps, actions=actions, tags=tags)
        if processors is not None:
            self._processor_helpers.merge_processors(processors)

        # Create the tools as FunctionTools
        function_tools = [
            self._wrap_tool(
                schema=tool.model_dump(
                    exclude_none=True,
                ),
                entity_id=entity_id or self.entity_id,
            )
            for tool in self.get_action_schemas(
                actions=actions,
                apps=apps,
                tags=tags,
                check_connected_accounts=check_connected_accounts,
                _populate_requested=True,
            )
        ]

        # Cast the list to List[Tool] to satisfy type checking
        # Since FunctionTool is a subclass of Tool, this is type-safe
        return cast(List[Tool], function_tools)
