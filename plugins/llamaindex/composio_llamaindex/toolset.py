import typing as t

from llama_index.core.tools import FunctionTool

from composio.client.enums import Action, App, Tag
from composio.constants import DEFAULT_ENTITY_ID
from composio_langchain import ComposioToolSet as BaseComposioToolSet


class ComposioToolSet(BaseComposioToolSet):
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
        task = "Star a repo SamparkAI/docs on GitHub"

        # Define agent
        agent = create_openai_functions_agent(openai_client, tools, prompt)
        agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

        # Execute using agent_executor
        agent_executor.invoke({"input": task})
    ```
    """

    def __init__(
        self,
        api_key: t.Optional[str] = None,
        base_url: t.Optional[str] = None,
        entity_id: str = DEFAULT_ENTITY_ID,
    ) -> None:
        """
        Initialize composio toolset.

        :param api_key: Composio API key
        :param base_url: Base URL for the Composio API server
        :param entity_id: Entity ID for making function calls
        """
        super().__init__(
            api_key=api_key,
            base_url=base_url,
            entity_id=entity_id,
        )
        self.runtime = "llamaindex"

    def _wrap_tool(
        self,
        schema: t.Dict[str, t.Any],
        entity_id: t.Optional[str] = None,
    ) -> FunctionTool:
        """Wraps composio tool as LlamaIndex FunctionTool object."""
        app = schema["appName"]
        action = schema["name"]
        description = schema["description"]
        schema_params = schema["parameters"]

        action_func = self.prepare_python_function(
            app=app,
            action=action,
            description=description,
            schema_params=schema_params,
            entity_id=entity_id,
        )
        return FunctionTool.from_defaults(
            action_func,
            name=action,
            description=description,
        )

    def get_actions(
        self,
        actions: t.Sequence[Action],
        entity_id: t.Optional[str] = None,
    ) -> t.Sequence[FunctionTool]:
        """
        Get composio tools wrapped as LlamaIndex FunctionTool objects.

        :param actions: List of actions to wrap
        :param entity_id: Entity ID to use for executing function calls.
        :return: Composio tools wrapped as `StructuredTool` objects
        """
        return super().get_actions(actions, entity_id)

    def get_tools(
        self,
        apps: t.Sequence[App],
        tags: t.Optional[t.List[t.Union[str, Tag]]] = None,
        entity_id: t.Optional[str] = None,
    ) -> t.Sequence[FunctionTool]:
        """
        Get composio tools wrapped as LlamaIndex FunctionTool objects.

        :param apps: List of apps to wrap
        :param tags: Filter the apps by given tags
        :param entity_id: Entity ID to use for executing function calls.
        :return: Composio tools wrapped as `StructuredTool` objects
        """
        return super().get_tools(apps, tags, entity_id)
