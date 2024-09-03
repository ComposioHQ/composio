import types
import typing as t
from inspect import Signature

import typing_extensions as te
from langchain_core.tools import StructuredTool

from composio import Action, ActionType, AppType, TagType
from composio.tools import ComposioToolSet as BaseComposioToolSet
from composio.utils.shared import (
    get_signature_format_from_schema_params,
    json_schema_to_model,
)


class ComposioToolSet(
    BaseComposioToolSet,
    runtime="langchain",
    description_char_limit=1024,
):
    """
    Composio toolset for Langchain framework.

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
        task = "Star a repo SamparkAI/docs on GitHub"

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
        entity_id: t.Optional[str] = None,
    ):
        def function(**kwargs: t.Any) -> t.Dict:
            """Wrapper function for composio action."""
            return self.execute_action(
                action=Action(value=action),
                params=kwargs,
                entity_id=entity_id or self.entity_id,
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
        """Wraps composio tool as Langchain StructuredTool object."""
        action = schema["name"]
        description = schema["description"]
        schema_params = schema["parameters"]
        action_func = self._wrap_action(
            action=action,
            description=description,
            schema_params=schema_params,
            entity_id=entity_id,
        )
        parameters = json_schema_to_model(
            json_schema=schema_params,
        )
        return StructuredTool.from_function(
            name=action,
            description=description,
            args_schema=parameters,
            return_schema=True,
            func=action_func,
        )

    @te.deprecated("Use `ComposioToolSet.get_tools` instead")
    def get_actions(
        self,
        actions: t.Sequence[ActionType],
        entity_id: t.Optional[str] = None,
    ) -> t.Sequence[StructuredTool]:
        """
        Get composio tools wrapped as Langchain StructuredTool objects.

        :param actions: List of actions to wrap
        :param entity_id: Entity ID to use for executing function calls.

        :return: Composio tools wrapped as `StructuredTool` objects
        """
        return self.get_tools(actions=actions, entity_id=entity_id)

    def get_tools(
        self,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        apps: t.Optional[t.Sequence[AppType]] = None,
        tags: t.Optional[t.List[TagType]] = None,
        entity_id: t.Optional[str] = None,
    ) -> t.Sequence[StructuredTool]:
        """
        Get composio tools wrapped as Langchain StructuredTool objects.

        :param actions: List of actions to wrap
        :param apps: List of apps to wrap
        :param tags: Filter the apps by given tags
        :param entity_id: Entity ID for the function wrapper

        :return: Composio tools wrapped as `StructuredTool` objects
        """
        self.validate_tools(apps=apps, actions=actions, tags=tags)
        return [
            self._wrap_tool(
                schema=tool.model_dump(
                    exclude_none=True,
                ),
                entity_id=entity_id or self.entity_id,
            )
            for tool in self.get_action_schemas(actions=actions, apps=apps, tags=tags)
        ]
