from composio.tools.local.base import Tool
from composio.tools.local.shelltool.find_cmds.actions import (
    FindFileCmd,
    SearchDirCmd,
    SearchFileCmd,
)


class SearchTool(Tool):
    """
    command manager tool for workspace
    """

    def actions(self) -> list:
        return [SearchDirCmd, SearchFileCmd, FindFileCmd]

    def triggers(self) -> list:
        return []
