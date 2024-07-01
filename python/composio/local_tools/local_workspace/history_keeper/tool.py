import typing as t

from composio.core.local import Action, Tool
from composio.workspace.get_logger import get_logger

from .actions import GetWorkspaceHistory


logger = get_logger("workspace")


class HistoryFetcherTool(Tool):
    """
    local workspace tool which can maintain history across commands.
    """

    def actions(self) -> list[t.Type[Action]]:
        return [GetWorkspaceHistory]

    def triggers(self) -> list:
        return []
