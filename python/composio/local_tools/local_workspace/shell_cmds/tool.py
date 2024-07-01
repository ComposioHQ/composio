from typing import Optional

from composio.core.local import Tool
from composio.local_tools.local_workspace.shell_cmds.actions import (
    RunCommandOnWorkspace, GetCurrentDirCmd
)
from composio.workspace.history_processor import (
    HistoryProcessor,
)


class CmdManagerTool(Tool):
    """
    command manager tool for workspace
    """
    history_processor: Optional[HistoryProcessor] = None

    def actions(self) -> list:
        return [
            RunCommandOnWorkspace, GetCurrentDirCmd
        ]

    def triggers(self) -> list:
        return []

    def set_history_processor(self, history_processor: HistoryProcessor):
        self.history_processor = history_processor

    def get_history_processor(self) -> Optional[HistoryProcessor]:
        return self.history_processor
