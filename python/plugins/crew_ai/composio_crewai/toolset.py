from crewai import __version__
from semver import Version


_BREAKING_VERSION = Version(major=0, minor=79, patch=0)
_CURRENT_VERSION = Version.parse(__version__)

if _CURRENT_VERSION < _BREAKING_VERSION:
    from composio_langchain import ComposioToolSet as Base

    class ComposioToolSet(  # type: ignore[no-redef]
        Base,
        runtime="crewai",
        description_char_limit=1024,
    ):
        pass

else:
    import typing as t

    import pydantic
    import pydantic.error_wrappers
    import typing_extensions as te
    from crewai.tools import BaseTool

    from composio import Action, ActionType, AppType, TagType
    from composio.tools.toolset import ComposioToolSet as BaseComposioToolSet
    from composio.tools.toolset import ProcessorsType
    from composio.utils.pydantic import parse_pydantic_error
    from composio.utils.shared import json_schema_to_model

    class ComposioToolSet(  # type: ignore[no-redef]
        BaseComposioToolSet,
        runtime="crewai",
        description_char_limit=1024,
    ):
        """
        Composio toolset for CrewiAI framework.

        Example:
        ```python
        import os

        import dotenv
        from crewai import Agent, Crew, Task
        from langchain_openai import ChatOpenAI

        from composio_crewai import Action, App, ComposioToolSet


        # Load environment variables from .env
        dotenv.load_dotenv()

        # Initialize tools.
        openai_client = ChatOpenAI(api_key=os.environ["OPENAI_API_KEY"])
        composio_toolset = ComposioToolSet()

        # Get All the tools
        tools = composio_toolset.get_tools(apps=[App.GITHUB])

        # Define agent
        crewai_agent = Agent(
            role="Github Agent",
            goal="You take action on Github using Github APIs",
            backstory=(
                "You are AI agent that is responsible for taking actions on Github "
                "on users behalf. You need to take action on Github using Github APIs"
            ),
            verbose=True,
            tools=tools,
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

        def _wrap_tool(
            self,
            schema: t.Dict[str, t.Any],
            entity_id: t.Optional[str] = None,
        ) -> BaseTool:
            """Wraps composio tool as Langchain StructuredTool object."""
            action = schema["name"]
            description = schema["description"]
            schema_params = schema["parameters"]

            def execute(**kwargs: t.Any) -> t.Dict:
                """Wrapper function for composio action."""
                return self.execute_action(
                    action=Action(value=action),
                    params=kwargs,
                    entity_id=entity_id or self.entity_id,
                )

            class Wrapper(BaseTool):

                def _run(self, *args, **kwargs):
                    try:
                        return execute(*args, **kwargs)
                    except pydantic.ValidationError as e:
                        return {
                            "successful": False,
                            "error": parse_pydantic_error(e),
                            "data": None,
                        }

            return Wrapper(
                name=action,
                description=description,
                args_schema=json_schema_to_model(
                    json_schema=schema_params,
                ),
            )

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
