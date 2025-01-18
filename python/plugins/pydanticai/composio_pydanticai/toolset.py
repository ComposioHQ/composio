import types
import typing as t
import warnings
from inspect import Parameter, Signature

import pydantic
from pydantic import ValidationError
import typing_extensions as te
from typing import TypeVar

from composio import Action, ActionType, AppType, TagType
from composio.tools import ComposioToolSet as BaseComposioToolSet
from composio.tools.toolset import ProcessorsType
from composio.utils import help_msg
from pydantic_ai.tools import Tool, RunContext, ToolDefinition 

AgentDeps = TypeVar('AgentDeps')

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
    # Initialize tools
    composio_toolset = ComposioToolSet()

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

    def _wrap_action(
        self,
        action: str,
        description: str,
        schema_params: t.Dict,
        entity_id: t.Optional[str] = None,
    ):
        """Create a wrapper function for the Composio action."""

        async def function(ctx: RunContext[AgentDeps], **kwargs: t.Any) -> t.Dict:
            """Wrapper function for composio action."""
            try:
                return self.execute_action(
                    action=Action(value=action),
                    params=kwargs,
                    entity_id=entity_id or self.entity_id,
                    _check_requested_actions=True,
                )
            except ValidationError as e:
                # Handle validation errors according to pydantic-ai expectations
                raise ValidationError(e.errors())

        # Create parameter annotations
        params = {}
        if schema_params.get("properties"):
            for name, prop in schema_params["properties"].items():
                # Map JSON schema types to Python types
                type_map = {
                    "string": str,
                    "integer": int,
                    "number": float,
                    "boolean": bool,
                    "array": list,
                    "object": dict,
                }
                param_type = type_map.get(prop.get("type", "string"), t.Any)
                params[name] = param_type

        # Create function with type hints
        action_func = types.FunctionType(
            function.__code__,
            globals=globals(),
            name=action,
            closure=function.__closure__,
        )
        
        # Add type hints
        action_func.__annotations__ = {
            "ctx": RunContext[AgentDeps],
            "return": t.Dict,
            **params
        }
        
        # Create signature
        parameters = [
            Parameter(
                name="ctx",
                kind=Parameter.POSITIONAL_OR_KEYWORD,
                annotation=RunContext[AgentDeps]
            )
        ]
        for name, type_hint in params.items():
            parameters.append(
                Parameter(
                    name=name,
                    kind=Parameter.KEYWORD_ONLY,
                    annotation=type_hint,
                    default=Parameter.empty if name in schema_params.get("required", []) else None
                )
            )
        
        action_func.__signature__ = Signature(parameters=parameters)  # type: ignore
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

        return Tool(
            function=action_func,
            name=action,
            description=description,
            takes_ctx=True,
            max_retries=3,  # Can be made configurable
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