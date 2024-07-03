from typing import Optional

from composio.tools.env.history import HistoryProcessor
from composio.tools.local.base import Tool
from composio.tools.local.shelltool.shell_cmds.actions import (
    GetCurrentDirCmd,
    RunCommandOnWorkspace,
)


class ShellCmdTool(Tool):
    """
    command manager tool for workspace
    """

    history_processor: Optional[HistoryProcessor] = None

    def actions(self) -> list:
        return [RunCommandOnWorkspace, GetCurrentDirCmd]

    def triggers(self) -> list:
        return []

    def set_history_processor(self, history_processor: HistoryProcessor):
        self.history_processor = history_processor

    def get_history_processor(self) -> Optional[HistoryProcessor]:
        return self.history_processor
