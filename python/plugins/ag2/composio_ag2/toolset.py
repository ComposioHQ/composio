import typing as t

from autogen.agentchat.conversable_agent import ConversableAgent
from autogen_core.tools import FunctionTool

from composio import ActionType, AppType, TagType
from composio.tools.toolset import ProcessorsType

from composio_autogen import ComposioToolSet as ComposioAutogenToolset


class ComposioToolSet(
    ComposioAutogenToolset,
    runtime="ag2",
    description_char_limit=1024,
    action_name_char_limit=64,
):
    """
    Composio toolset for Ag2 framework.
    """

    def register_tools(
        self,
        caller: ConversableAgent,
        executor: ConversableAgent,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        apps: t.Optional[t.Sequence[AppType]] = None,
        tags: t.Optional[t.List[TagType]] = None,
        entity_id: t.Optional[str] = None,
    ) -> None:
        """
        Register tools to the proxy agents.

        :param executor: Executor agent.
        :param caller: Caller agent.
        :param apps: List of apps to wrap
        :param actions: List of actions to wrap
        :param tags: Filter the apps by given tags
        :param entity_id: Entity ID for the function wrapper
        :param entity_id: Entity ID to use for executing function calls.
        """
        super().register_tools(
            caller=caller,
            executor=executor,
            actions=actions,
            apps=apps,
            tags=tags,
            entity_id=entity_id,
        )

    def get_tools(
        self,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        apps: t.Optional[t.Sequence[AppType]] = None,
        tags: t.Optional[t.List[TagType]] = None,
        entity_id: t.Optional[str] = None,
        *,
        processors: t.Optional[ProcessorsType] = None,
        check_connected_accounts: bool = True,
    ) -> t.Sequence[FunctionTool]:
        """
        Get composio tools as Ag2 FunctionTool objects.

        Args:
            actions: List of actions to wrap
            apps: List of apps to wrap
            tags: Filter apps by given tags
            entity_id: Entity ID for function wrapper
            processors: Optional dict of processors to merge
            check_connected_accounts: Whether to check for connected accounts

        Returns:
            List of Ag2 FunctionTool objects
        """
        return super().get_tools(
            actions=actions,
            apps=apps,
            tags=tags,
            entity_id=entity_id,
            processors=processors,
            check_connected_accounts=check_connected_accounts,
        )
