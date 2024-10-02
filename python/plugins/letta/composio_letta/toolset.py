import typing as t

from composio import ActionType, AppType, TagType
from composio.tools.toolset import ComposioToolSet as BaseComposioToolSet
from composio_crewai import ComposioToolSet as CrewAIToolSet
from letta.schemas.tool import Tool

class ComposioToolSet(
    BaseComposioToolSet,
    runtime="letta",
    description_char_limit=1024,
):
    """
    Composio toolset for Letta framework.

    Example:
    ```python
        import os
        import dotenv
        from letta import create_client 

        from composio_letta import App, ComposioToolSet
        
        agent_state = client.create_agent(include_default_tools=False) 
        
        composio_toolset = ComposioToolSet()
        tools = composio_toolset.get_tools(apps=[App.GITHUB])
        
        client.add_tool(tools)
    ```
    """

    def get_tools(
        self,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        apps: t.Optional[t.Sequence[AppType]] = None,
        tags: t.Optional[t.List[TagType]] = None,
        entity_id: t.Optional[str] = None,
    ) -> t.Sequence[Tool]:
        """
        Get composio tools wrapped as Langchain StructuredTool objects.

        :param actions: List of actions to wrap
        :param apps: List of apps to wrap
        :param tags: Filter the apps by given tags
        :param entity_id: Entity ID for the function wrapper

        :return: Composio tools wrapped as `StructuredTool` objects
        """
        crewai_tools = CrewAIToolSet().get_tools(apps=apps, actions=actions, tags=tags, entity_id=entity_id)
        return [Tool.from_crewai(tool) for tool in crewai_tools]
