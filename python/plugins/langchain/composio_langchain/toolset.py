import types
import typing as t
from inspect import Signature

from langchain_core.tools import StructuredTool

from composio import Action, ActionType, AppType, TagType
from composio.constants import DEFAULT_ENTITY_ID
from composio.tools import ComposioToolSet as BaseComposioToolSet
from composio.tools.env.factory import ExecEnv
from composio.utils.shared import (
    get_signature_format_from_schema_params,
    json_schema_to_model,
)

from typing import Union, List, Dict, Any

class ComposioToolSet(BaseComposioToolSet):
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
        task = "Star a repo composiohq/composio on GitHub"

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
        output_in_file: bool = False,
        workspace_env: ExecEnv = ExecEnv.HOST,
        workspace_id: t.Optional[str] = None,
    ) -> None:
        """
        Initialize composio toolset.

        :param api_key: Composio API key
        :param base_url: Base URL for the Composio API server
        :param entity_id: Entity ID for making function calls
        :param output_in_file: Whether to write output to a file
        """
        super().__init__(
            api_key=api_key,
            base_url=base_url,
            runtime="langchain",
            entity_id=entity_id,
            output_in_file=output_in_file,
            workspace_env=workspace_env,
            workspace_id=workspace_id,
        )

class ComposioToolSet(BaseComposioToolSet):
    # ... existing code ...

    def _serialize_notion_format(self, obj: Any) -> Union[Dict[str, Any], List[Dict[str, Any]], Any]:
        """Helper function to serialize NotionAgentTextFormat objects."""
        print(f"Serializing object: {obj}")
        if isinstance(obj, list):
            print("Object is a list")
            return [self._serialize_notion_format(item) for item in obj]
        elif hasattr(obj, '__slots__'):  # This is likely a NotionAgentTextFormat object
            print("Object has __slots__")
            return {
                slot: self._serialize_notion_format(getattr(obj, slot))
                for slot in obj.__slots__
                if hasattr(obj, slot) and getattr(obj, slot) is not None
            }
        elif hasattr(obj, 'model_dump'):  # This is likely a Pydantic model
            print("Object is a Pydantic model")
            return obj.model_dump()
        elif isinstance(obj, dict):
            print("Object is a dictionary")
            return {k: self._serialize_notion_format(v) for k, v in obj.items()}
        else:
            print("Object is a primitive type")
            return obj  # Return primitive types as-is


        
    def _wrap_action(
        self,
        action: str,
        description: str,
        schema_params: t.Dict,
        entity_id: t.Optional[str] = None,
    ):
        def function(**kwargs: t.Any) -> t.Dict:
            """Wrapper function for composio action."""
            print("kwargs: ", kwargs)
            # import pdb; pdb.set_trace()
            serialized_kwargs = self._serialize_notion_format(kwargs)
            print("serialized_kwargs: ", serialized_kwargs)
            return self.execute_action(
                action=Action(value=action),
                params=serialized_kwargs,
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
        print("parameters: ", parameters)
        return StructuredTool.from_function(
            name=action,
            description=description,
            args_schema=parameters,
            return_schema=True,
            func=action_func,
            infer_schema=False,
        )

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

        return [
            self._wrap_tool(
                schema=tool.model_dump(exclude_none=True),
                entity_id=entity_id or self.entity_id,
            )
            for tool in self.get_action_schemas(actions=actions)
        ]

    def get_tools(
        self,
        apps: t.Sequence[AppType],
        tags: t.Optional[t.List[TagType]] = None,
        entity_id: t.Optional[str] = None,
    ) -> t.Sequence[StructuredTool]:
        """
        Get composio tools wrapped as Langchain StructuredTool objects.

        :param apps: List of apps to wrap
        :param tags: Filter the apps by given tags
        :param entity_id: Entity ID to use for executing function calls.
        :return: Composio tools wrapped as `StructuredTool` objects
        """

        return [
            self._wrap_tool(
                schema=tool.model_dump(exclude_none=True),
                entity_id=entity_id or self.entity_id,
            )
            for tool in self.get_action_schemas(apps=apps, tags=tags)
        ]