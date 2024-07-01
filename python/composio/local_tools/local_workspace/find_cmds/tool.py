from typing import Optional

from composio.core.local import Tool
from composio.local_tools.local_workspace.find_cmds.actions import (
    SearchDirCmd, SearchFileCmd, FindFileCmd
)


class SearchTool(Tool):
    """
    command manager tool for workspace
    """
    history_processor: Optional[HistoryProcessor] = None

    def actions(self) -> list:
        return [
            SearchDirCmd, SearchFileCmd, FindFileCmd
        ]

    def triggers(self) -> list:
        return []
