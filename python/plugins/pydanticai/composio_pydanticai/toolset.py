import types
import typing as t
from inspect import Parameter, Signature

from pydantic import ValidationError
from pydantic_ai.tools import Tool

from composio import Action, ActionType, AppType, TagType
from composio.tools import ComposioToolSet as BaseComposioToolSet
from composio.tools.toolset import ProcessorsType
from composio.utils.pydantic import parse_pydantic_error
from composio.utils.shared import get_signature_format_from_schema_params


class ComposioToolSet(
    BaseComposioToolSet,
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

    # Initialize toolset
    composio_toolset = ComposioToolSet()

    # Configure max retries for specific tools
    max_retries = {
        Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER: 5,
        Action.GITHUB_CREATE_REPOSITORY: 2
    }

    # Get GitHub tools with retry configuration
    tools = composio_toolset.get_tools(
        actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER],
        max_retries=max_retries,
        default_max_retries=3
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
    task = "Star a repo composiohq/composio on GitHub"
    # Run the agent
    result = agent.run_sync(task)
    ```
    """

    def _wrap_action(
        self,
        action: str,
        description: str,
        schema_params: t.Dict[str, t.Any],
        entity_id: t.Optional[str] = None,
    ):
        """Create a wrapper function for the Composio action."""

        async def function(ctx, **kwargs):  # pylint: disable=unused-argument
            """Wrapper function for composio action."""
            try:
                return self.execute_action(
                    action=Action(value=action),
                    params=kwargs,
                    entity_id=entity_id or self.entity_id,
                    _check_requested_actions=True,
                )
            except ValidationError as e:
                # Return a structured error response that the agent can understand
                return {
                    "error": parse_pydantic_error(e),
                    "successful": False,
                    "data": None,
                }

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
            "ctx": "RunContext[None]",
            "return": t.Dict,
            **params,
        }

        # Create signature with context parameter first
        ctx_param = Parameter(
            name="ctx",
            kind=Parameter.POSITIONAL_OR_KEYWORD,
            annotation="RunContext[None]",
        )
        action_func.__signature__ = Signature(parameters=[ctx_param] + parameters)  # type: ignore
        action_func.__doc__ = description

        return action_func

    def _wrap_tool(
        self,
        schema: t.Dict[str, t.Any],
        entity_id: t.Optional[str] = None,
        max_retries: t.Optional[int] = None,
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
            max_retries=max_retries,
            docstring_format="auto",
        )

    def get_tools(
        self,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        apps: t.Optional[t.Sequence[AppType]] = None,
        tags: t.Optional[t.List[TagType]] = None,
        entity_id: t.Optional[str] = None,
        *,
        max_retries: t.Optional[t.Dict[Action, int]] = None,
        default_max_retries: int = 3,
        processors: t.Optional[ProcessorsType] = None,
        check_connected_accounts: bool = True,
    ) -> t.Sequence[Tool]:
        """
        Get composio tools wrapped as Pydantic-AI Tool objects.

        Args:
            actions: Optional sequence of actions to get tools for
            apps: Optional sequence of apps to get tools for
            tags: Optional list of tags to filter tools by
            entity_id: Optional entity ID to use for the tools
            max_retries: Optional dict mapping Action enum values to their max retry counts
            default_max_retries: Default max retries for tools not specified in max_retries
            processors: Optional processors to apply to the tools
            check_connected_accounts: Whether to check for connected accounts

        Returns:
            Sequence of Pydantic-AI Tool objects
        """
        self.validate_tools(apps=apps, actions=actions, tags=tags)
        if processors is not None:
            self._processor_helpers.merge_processors(processors)

        max_retries = max_retries or {}

        return [
            self._wrap_tool(
                schema=tool.model_dump(exclude_none=True),
                entity_id=entity_id or self.entity_id,
                max_retries=max_retries.get(Action(tool.name), default_max_retries),
            )
            for tool in self.get_action_schemas(
                actions=actions,
                apps=apps,
                tags=tags,
                check_connected_accounts=check_connected_accounts,
                _populate_requested=True,
            )
        ]
