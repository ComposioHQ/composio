import types
import typing as t
from inspect import Signature

import pydantic
import pydantic.error_wrappers
import typing_extensions as te

from composio import Action, ActionType, AppType, TagType
from composio.tools.toolset import ComposioToolSet as BaseComposioToolSet
from composio.tools.toolset import ProcessorsType
from composio.utils.pydantic import parse_pydantic_error
from composio.utils.shared import (
    get_signature_format_from_schema_params,
    json_schema_to_model,
)
from crewai.tools import BaseTool as BaseToolClass



class BaseTool(BaseToolClass):
    name: str 
    description: str
    
    def _run(self, *args, **kwargs):
        try:
            return super()._run(*args, **kwargs)
        except pydantic.ValidationError as e:
            return {"successful": False, "error": parse_pydantic_error(e), "data": None}


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
    from crewai import Agent, Crew, Task
    from langchain_openai import ChatOpenAI

    from composio_crewai import App, ComposioToolSet, Action


    # Load environment variables from .env
    dotenv.load_dotenv()

    # Initialize tools.
    openai_client = ChatOpenAI(api_key=os.environ["OPENAI_API_KEY"]) # type: ignore
    composio_toolset = ComposioToolSet()

    # Get All the tools
    tools = composio_toolset.get_actions(actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER])

    # Define agent
    crewai_agent = Agent(
        role="Github Agent",
        goal=""You take action on Github using Github APIs"",
        backstory=(
            "You are AI agent that is responsible for taking actions on Github "
            "on users behalf. You need to take action on Github using Github APIs"
        ),
        verbose=True,
        tools=tools, # type: ignore
        llm=openai_client,
    )

    # Define task
    task = Task(
        description="Star a repo composiohq/composio on GitHub",
        agent=crewai_agent,
        expected_output="if the star happened",
    )

    my_crew = Crew(agents=[crewai_agent], tasks=[task])

    result = my_crew.kickoff()
    print(result)

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
    ) -> BaseTool:
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
        tool = BaseTool(
            name=action,
            description=description,
            args_schema=parameters,
            #return_direct=True,
            #handle_tool_error=True,
        )
        return tool

    @te.deprecated("Use `ComposioToolSet.get_tools` instead")
    def get_actions(
        self,
        actions: t.Sequence[ActionType],
        entity_id: t.Optional[str] = None,
    ) -> t.Sequence[BaseTool]:
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
        *,
        processors: t.Optional[ProcessorsType] = None,
        check_connected_accounts: bool = True,
    ) -> t.Sequence[BaseTool]:
        """
        Get composio tools as Langchain StructuredTool objects.

        :param actions: List of actions to wrap
        :param apps: List of apps to wrap
        :param tags: Filter the apps by given tags
        :param entity_id: Entity ID for the function wrapper

        :return: Composio tools as `StructuredTool` objects
        """
        self.validate_tools(apps=apps, actions=actions, tags=tags)
        if processors is not None:
            self._merge_processors(processors)

        tools = [
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
            )
        ]

        return tools  # Ensure this returns a list of BaseTool instances