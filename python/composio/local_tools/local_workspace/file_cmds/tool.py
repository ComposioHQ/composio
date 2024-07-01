from typing import Optional

from composio.core.local import Tool
from composio.local_tools.local_workspace.file_cmds.actions import (
    EditFile,
    Scroll,
    OpenFile,
    CreateFileCmd,
)


class CmdManagerTool(Tool):
    """
    command manager tool for workspace
    """
    history_processor: Optional[HistoryProcessor] = None

    def actions(self) -> list:
        return [
            EditFile,
            Scroll,
            OpenFile,
            CreateFileCmd,
        ]

    def triggers(self) -> list:
        return []
