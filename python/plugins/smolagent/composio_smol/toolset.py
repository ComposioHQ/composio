import types
import typing as t
from inspect import Signature
from typing import Callable, Dict

import pydantic
import pydantic.error_wrappers
from smolagents.tools import Tool

from composio import ActionType, AppType, TagType
from composio.tools import ComposioToolSet as BaseComposioToolSet
from composio.tools.toolset import ProcessorsType
from composio.utils.pydantic import parse_pydantic_error
from composio.utils.shared import get_signature_format_from_schema_params


class StructuredTool(Tool):
    def __init__(
        self,
        name: str,
        description: str,
        params: Dict[str, Dict[str, str | type | bool]],
        output_type: str,
        function: Callable,
    ):
        self.name = name
        self.description = description
        self.inputs = params
        self.output_type = output_type
        self.forward = function
        self.is_initialized = True

    def run(self, *args, **kwargs):
        try:
            return self.forward(*args, **kwargs)
        except pydantic.ValidationError as e:
            return {"successful": False, "error": parse_pydantic_error(e), "data": None}


class ComposioToolSet(
    BaseComposioToolSet,
    runtime="smol",
    description_char_limit=1024,
    action_name_char_limit=64,
):
    """
    Composio toolset for Smolagents framework.

    Example:
    ```python
    from dotenv import load_dotenv
    from composio import Action
    from composio_smol import ComposioToolSet
    from smolagents import HfApiModel, CodeAgent

    load_dotenv()
    # Initialize toolset
    composio_toolset = ComposioToolSet()

    tools = composio_toolset.get_tools(
        actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER],
    )
    # Create agent with Composio tools
    agent = CodeAgent(
        tools=list(tools),
        model=HfApiModel()
    )

    agent.run("Star the composiohq/composio repo")

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
        action_func.__signature__ = Signature(  # type: ignore
            parameters=get_signature_format_from_schema_params(
                schema_params=schema_params
            )
        )

        action_func.__doc__ = description

        return action_func

    def _wrap_tool(
        self,
        schema: t.Dict[str, t.Any],
        entity_id: t.Optional[str] = None,
    ) -> StructuredTool:
        """Wraps composio tool as StructuredTool object."""
        action = schema["name"]
        description = schema["description"]
        schema_params = schema["parameters"]
        action_func = self._wrap_action(
            action=action,
            description=description,
            schema_params=schema_params,
            entity_id=entity_id,
        )
        # Flatten and format the parameters structure
        params = schema_params["properties"]
        tool = StructuredTool(
            name=action,
            description=description,
            params=params,
            output_type="object",
            function=action_func,
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
    ) -> t.Sequence[StructuredTool]:
        """
        Get composio tools wrapped as StructuredTool objects.

        :param actions: List of actions to wrap
        :param apps: List of apps to wrap
        :param tags: Filter the apps by given tags
        :param entity_id: Entity ID for the function wrapper
        :param processors: Optional processors to apply to the tools
        :param check_connected_accounts: Whether to check for connected accounts
        :return: Composio tools wrapped as `StructuredTool` objects
        """
        self.validate_tools(apps=apps, actions=actions, tags=tags)
        if processors is not None:
            self._processor_helpers.merge_processors(processors)
        return [
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
