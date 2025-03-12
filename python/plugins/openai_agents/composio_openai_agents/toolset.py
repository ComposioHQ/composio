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
        async def execute_action_wrapper(ctx, args_json):
            """Execute Composio action with the given arguments."""
            try:
                # Parse the args_json into a dict
                import json

                kwargs = json.loads(args_json) if args_json else {}

                result = self.execute_action(
                    action=action,
                    params=kwargs,
                    entity_id=entity_id or self.entity_id,
                    _check_requested_actions=True,
                )
                return str(result)
            except pydantic.ValidationError as e:
                error_msg = parse_pydantic_error(e)
                return str(
                    {
                        "successful": False,
                        "error": error_msg,
                        "data": None,
                    }
                )
            except Exception as e:
                return str(
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

        # Create a custom FunctionTool with the appropriate schema
        tool = FunctionTool(
            name=action,
            description=description,
            params_json_schema=modified_schema,
            on_invoke_tool=execute_action_wrapper,
            strict_json_schema=True,
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
