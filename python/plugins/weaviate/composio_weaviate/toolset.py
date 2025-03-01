import os
import types
import typing as t
import warnings
from inspect import Signature

import typing_extensions as te
import weaviate
from weaviate.classes.init import Auth
from weaviate_agents.query import QueryAgent

from composio import Action, ActionType, AppType
from composio import ComposioToolSet as BaseComposioToolSet
from composio import TagType
from composio.tools.toolset import ProcessorsType
from composio.utils import help_msg
from composio.utils.shared import get_pydantic_signature_format_from_schema_params


class ComposioToolSet(
    BaseComposioToolSet,
    runtime="weaviate",
    description_char_limit=1024,
    action_name_char_limit=64,
):
    """
    Composio toolset for Weaviate framework.

    Example:
    ```python
        import os
        import dotenv

        from composio_weaviate import App, ComposioToolSet
        from weaviate_agents.query import QueryAgent
        import weaviate
        from weaviate.classes.init import Auth

        # Load environment variables from .env
        dotenv.load_dotenv()

        # Initialize Weaviate client
        weaviate_client = weaviate.connect_to_weaviate_cloud(
            cluster_url=os.environ["WEAVIATE_URL"],
            auth_credentials=Auth.api_key(os.environ["WEAVIATE_API_KEY"]),
            headers={
                "X-OpenAI-Api-Key": os.environ["OPENAI_API_KEY"]
            }
        )

        # Initialize tools
        composio_toolset = ComposioToolSet()

        # Get All the tools
        tools = composio_toolset.get_tools(apps=[App.GITHUB])

        # Initialize QueryAgent with Composio tools
        qa = QueryAgent(
            client=weaviate_client, 
            collections=["Blogs"],
            tools=tools
        )

        # Execute query
        result = qa.run("Star a repo composiohq/composio on GitHub")
        print(result.final_answer)
    ```
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.weaviate_client = None
        self.query_agent = None

    def connect_to_weaviate(self, cluster_url=None, api_key=None, openai_api_key=None, collections=None):
        """
        Connect to Weaviate and initialize QueryAgent.
        
        Args:
            cluster_url (str, optional): Weaviate cluster URL. Defaults to WEAVIATE_URL env var.
            api_key (str, optional): Weaviate API key. Defaults to WEAVIATE_API_KEY env var.
            openai_api_key (str, optional): OpenAI API key. Defaults to OPENAI_API_KEY env var.
            collections (list, optional): List of collections to query. Defaults to ["Blogs"].
        """
        cluster_url = cluster_url or os.environ.get("WEAVIATE_URL")
        api_key = api_key or os.environ.get("WEAVIATE_API_KEY")
        openai_api_key = openai_api_key or os.environ.get("OPENAI_API_KEY")
        collections = collections or ["Blogs"]
        
        self.weaviate_client = weaviate.connect_to_weaviate_cloud(
            cluster_url=cluster_url,
            auth_credentials=Auth.api_key(api_key),
            headers={
                "X-OpenAI-Api-Key": openai_api_key
            }
        )
        self.query_agent = QueryAgent(
            client=self.weaviate_client,
            collections=collections
        )
        return self

    def run_query(self, search_query: str) -> str:
        """
        Run a query against the Weaviate database using QueryAgent.
        
        Args:
            search_query (str): The search query to retrieve information
            
        Returns:
            str: The final answer from the QueryAgent
        """
        if not self.query_agent:
            raise ValueError("QueryAgent not initialized. Call connect_to_weaviate() first.")
        return self.query_agent.run(search_query).final_answer

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
                schema_params=schema_params
            )
        )
        action_func.__doc__ = description

        return action_func

    def _wrap_tool(
        self,
        schema: t.Dict[str, t.Any],
        entity_id: t.Optional[str] = None,
    ):
        """Wraps composio tool as Weaviate tool object."""
        action = schema["name"]
        description = schema.get("description", schema["name"])
        schema_params = schema["parameters"]

        action_func = self._wrap_action(
            action=action,
            description=description,
            schema_params=schema_params,
            entity_id=entity_id,
        )
        
        # Return the function directly as Weaviate agents accept callable tools
        return action_func

    @te.deprecated("Use `ComposioToolSet.get_tools` instead.\n", category=None)
    def get_actions(
        self,
        actions: t.Sequence[ActionType],
        entity_id: t.Optional[str] = None,
    ) -> t.Sequence[t.Callable]:
        """
        Get composio tools wrapped as callable functions for Weaviate.

        :param actions: List of actions to wrap
        :param entity_id: Entity ID for the function wrapper

        :return: Composio tools wrapped as callable functions
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
        check_connected_accounts: bool = True,
    ) -> t.Sequence[t.Callable]:
        """
        Get composio tools wrapped as callable functions for Weaviate.

        :param actions: List of actions to wrap
        :param apps: List of apps to wrap
        :param tags: Filter the apps by given tags
        :param entity_id: Entity ID for the function wrapper

        :return: Composio tools wrapped as callable functions
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