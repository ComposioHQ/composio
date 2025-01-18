import types
import typing as t
import warnings
from dataclasses import dataclass
from inspect import Parameter, Signature
from typing import Any, Dict, TypeVar

import pydantic
import typing_extensions as te
from pydantic import ValidationError
from pydantic_ai.tools import RunContext, Tool, ToolDefinition

from composio import Action, ActionType, AppType, TagType
from composio.tools import ComposioToolSet as BaseComposioToolSet
from composio.tools.toolset import ProcessorsType
from composio.utils import help_msg
from composio.utils.shared import get_signature_format_from_schema_params


AgentDeps = TypeVar("AgentDeps", bound=Any)


@dataclass
class ToolConfig:
    """Configuration for a specific tool."""

    max_retries: int = 3


class ComposioToolSet(
    BaseComposioToolSet,
    t.Generic[AgentDeps],
    runtime="pydantic_ai",
    description_char_limit=1024,
    action_name_char_limit=64,
):
    """
    Composio toolset for Pydantic-AI framework.
    Example:
    ```python
    from dotenv import load_dotenv  # type: ignore
    import os

    from composio import Action
    from composio_pydanticai import ComposioToolSet
    from pydantic_ai import Agent


    # Load environment variables from .env
    load_dotenv(".env")
    # Initialize tools with custom max retries
    composio_toolset = ComposioToolSet(max_retries=5)  # Configure max retries for all tools

    # Get GitHub tools that are pre-configured
    tools = composio_toolset.get_tools(
        actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER]
    )

    # Create an agent with the tools
    agent = Agent(
        model="openai:gpt-4o",  # Using a known model name
        tools=tools,
        system_prompt="You are an AI agent that helps users interact with GitHub.
        You can perform various GitHub operations using the available tools.
        When given a task, analyze it and use the appropriate tool to complete it.",
    )

    # Define task
    task = "Star a repo wjayesh/mahilo on GitHub"
    # Run the agent
    result = agent.run_sync(task)
    ```
    """

    def __init__(
        self,
        max_retries: int = 3,
        tool_configs: t.Optional[Dict[str, ToolConfig]] = None,
        *args,
        **kwargs,
    ):
        """Initialize the toolset with configurable max_retries.

        Args:
            max_retries (int, optional): Default maximum number of retries for tool execution. Defaults to 3.
            tool_configs (Dict[str, ToolConfig], optional): Specific configurations for individual tools.
                Keys are tool names, values are ToolConfig objects.
        """
        super().__init__(*args, **kwargs)
        self.max_retries = max_retries
        self.tool_configs = tool_configs or {}

    def _wrap_action(
        self,
        action: str,
        description: str,
        schema_params: t.Dict[str, t.Any],
        entity_id: t.Optional[str] = None,
    ):
        """Create a wrapper function for the Composio action."""

        async def function(ctx: "RunContext[AgentDeps]", **kwargs: t.Any) -> t.Dict:
            """Wrapper function for composio action."""
            try:
                return self.execute_action(
                    action=Action(value=action),
                    params=kwargs,
                    entity_id=entity_id or self.entity_id,
                    _check_requested_actions=True,
                )
            except ValidationError as e:
                # Re-raise the original validation error to preserve context
                raise e

        # Create function with type hints
        action_func = types.FunctionType(
            function.__code__,
            globals=globals(),
            name=action,
            closure=function.__closure__,
        )

        # Get parameters using shared utility
        parameters = get_signature_format_from_schema_params(schema_params)

        # Add type hints
        params = {param.name: param.annotation for param in parameters}
        action_func.__annotations__ = {
            "ctx": "RunContext[AgentDeps]",
            "return": t.Dict,
            **params,
        }

        # Create signature with context parameter first
        ctx_param = Parameter(
            name="ctx",
            kind=Parameter.POSITIONAL_OR_KEYWORD,
            annotation="RunContext[AgentDeps]",
        )
        action_func.__signature__ = Signature(parameters=[ctx_param] + parameters)  # type: ignore
        action_func.__doc__ = description

        return action_func

    def _wrap_tool(
        self,
        schema: t.Dict[str, t.Any],
        entity_id: t.Optional[str] = None,
    ) -> Tool:
        """Wraps composio tool as Pydantic-AI Tool object."""
        action = schema["name"]
        description = schema["description"]
        parameters = schema["parameters"]

        # Create the wrapper function
        action_func = self._wrap_action(
            action=action,
            description=description,
            schema_params=parameters,
            entity_id=entity_id,
        )

        # Get tool-specific config or use default
        tool_config = self.tool_configs.get(
            action, ToolConfig(max_retries=self.max_retries)
        )

        return Tool(
            function=action_func,
            name=action,
            description=description,
            takes_ctx=True,
            max_retries=tool_config.max_retries,
            docstring_format="auto",
        )

    def get_tools(
        self,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        apps: t.Optional[t.Sequence[AppType]] = None,
        tags: t.Optional[t.List[TagType]] = None,
        entity_id: t.Optional[str] = None,
        *,
        processors: t.Optional[ProcessorsType] = None,
        check_connected_accounts: bool = True,
    ) -> t.Sequence[Tool]:
        """
        Get composio tools wrapped as Pydantic-AI Tool objects.
        """
        self.validate_tools(apps=apps, actions=actions, tags=tags)
        if processors is not None:
            self._merge_processors(processors)

        return [
            self._wrap_tool(
                schema=tool.model_dump(exclude_none=True),
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

    @te.deprecated("Use `ComposioToolSet.get_tools` instead.\n", category=None)
    def get_actions(
        self,
        actions: t.Sequence[ActionType],
        entity_id: t.Optional[str] = None,
    ) -> t.Sequence[Tool]:
        """
        Get composio tools wrapped as Pydantic-AI Tool objects.

        :param actions: List of actions to wrap
        :param entity_id: Entity ID to use for executing function calls.

        :return: Composio tools wrapped as `Tool` objects
        """
        warnings.warn(
            "Use `ComposioToolSet.get_tools` instead.\n" + help_msg(),
            DeprecationWarning,
            stacklevel=2,
        )
        return self.get_tools(actions=actions, entity_id=entity_id)
