import typing as t
from typing import Optional

from composio.core.local import Action, Tool
from composio.workspace.history_processor import (
    HistoryProcessor,
)
from composio.workspace.get_logger import get_logger

from .actions import GetWorkspaceHistory


logger = get_logger("workspace")


class HistoryKeeper(Tool):
    """
    local workspace tool which can maintain history across commands.
    """
    history_processor: Optional[HistoryProcessor] = None

    def actions(self) -> list[t.Type[Action]]:
        return [GetWorkspaceHistory]

    def triggers(self) -> list:
        return []

    def set_history_processor(self, history_processor: HistoryProcessor):
        self.history_processor = history_processor

    def get_history_processor(self) -> Optional[HistoryProcessor]:
        return self.history_processor
