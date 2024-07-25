import typing as t

from composio.tools.local.base import Action, Tool

from .actions import GetWorkspaceHistory


class HistoryFetcherTool(Tool):
    """
    local workspace tool which can maintain history across commands.
    """

    def actions(self) -> list[t.Type[Action]]:
        return [GetWorkspaceHistory]

    def triggers(self) -> list:
        return []
