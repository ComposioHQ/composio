import types
import typing as t
import warnings
from inspect import Signature

import typing_extensions as te
from llama_index.core.tools import FunctionTool

from composio import Action, ActionType, AppType
from composio import ComposioToolSet as BaseComposioToolSet
from composio import TagType
from composio.tools.toolset import ProcessorsType
from composio.utils import help_msg
from composio.utils.shared import get_pydantic_signature_format_from_schema_params


class ComposioToolSet(
    BaseComposioToolSet,
    runtime="llamaindex",
    description_char_limit=1024,
    action_name_char_limit=64,
):
    """
    Composio toolset for LlamaIndex framework.

    Example:
    ```python
        import os
        import dotenv

        from composio_langchain import App, ComposioToolSet
        from langchain.agents import AgentExecutor, create_openai_functions_agent
        from langchain_openai import ChatOpenAI

        from langchain import hub


        # Load environment variables from .env
        dotenv.load_dotenv()


        # Pull relevant agent model.
        prompt = hub.pull("hwchase17/openai-functions-agent")

        # Initialize tools.
        openai_client = ChatOpenAI(api_key=os.environ["OPENAI_API_KEY"])
        composio_toolset = ComposioToolSet()

        # Get All the tools
        tools = composio_toolset.get_tools(apps=[App.GITHUB])

        # Define task
        task = "Star a repo composiohq/composio on GitHub"

        # Define agent
        agent = create_openai_functions_agent(openai_client, tools, prompt)
        agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

        # Execute using agent_executor
        agent_executor.invoke({"input": task})
    ```
    """

    def _wrap_action(
        self,
        action: str,
        description: str,
        schema_params: t.Dict,
        skip_default: bool = False,
        entity_id: t.Optional[str] = None,
    ):
        def function(**kwargs: t.Any) -> t.Dict:
            """Wrapper function for composio action."""
            return self.execute_action(
                action=Action(value=action),
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
            parameters=get_pydantic_signature_format_from_schema_params(
                schema_params=schema_params,
                skip_default=skip_default,
            )
        )
        action_func.__doc__ = description
        return action_func

    def _wrap_tool(
        self,
        schema: t.Dict[str, t.Any],
        entity_id: t.Optional[str] = None,
        skip_default: bool = False,
    ) -> FunctionTool:
        """Wraps composio tool as LlamaIndex FunctionTool object."""
        action = schema["name"]
        description = schema.get("description", schema["name"])
        schema_params = schema["parameters"]
        action_func = self._wrap_action(
            action=action,
            description=description,
            schema_params=schema_params,
            skip_default=skip_default,
            entity_id=entity_id,
        )
        return FunctionTool.from_defaults(
            action_func,
            name=action,
            description=description,
        )

    @te.deprecated("Use `ComposioToolSet.get_tools` instead.\n", category=None)
    def get_actions(
        self,
        actions: t.Sequence[ActionType],
        entity_id: t.Optional[str] = None,
    ) -> t.Sequence[FunctionTool]:
        """
        Get composio tools wrapped as LlamaIndex FunctionTool objects.

        :param actions: List of actions to wrap
        :param entity_id: Entity ID for the function wrapper

        :return: Composio tools wrapped as `StructuredTool` objects
        """
        warnings.warn(
            "Use `ComposioToolSet.get_tools` instead.\n" + help_msg(),
            DeprecationWarning,
            stacklevel=2,
        )
        return self.get_tools(actions=actions, entity_id=entity_id)

    def get_tools(
        self,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        apps: t.Optional[t.Sequence[AppType]] = None,
        tags: t.Optional[t.List[TagType]] = None,
        entity_id: t.Optional[str] = None,
        *,
        processors: t.Optional[ProcessorsType] = None,
        skip_default: bool = False,
        check_connected_accounts: bool = True,
    ) -> t.Sequence[FunctionTool]:
        """
        Get composio tools wrapped as LlamaIndex FunctionTool objects.

        :param actions: List of actions to wrap
        :param apps: List of apps to wrap
        :param tags: Filter the apps by given tags
        :param entity_id: Entity ID for the function wrapper

        :return: Composio tools wrapped as `StructuredTool` objects
        """
        self.validate_tools(apps=apps, actions=actions, tags=tags)
        if processors is not None:
            self._processor_helpers.merge_processors(processors)
        return [
            self._wrap_tool(
                schema=tool.model_dump(exclude_none=True),
                entity_id=entity_id or self.entity_id,
                skip_default=skip_default,
            )
            for tool in self.get_action_schemas(
                actions=actions,
                apps=apps,
                tags=tags,
                check_connected_accounts=check_connected_accounts,
                _populate_requested=True,
            )
        ]
