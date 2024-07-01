from composio.core.local import Tool
from composio.local_tools.local_workspace.file_cmds.actions import (
    CreateFileCmd,
    EditFile,
    OpenFile,
    Scroll,
)


class FileTool(Tool):
    """
    command manager tool for workspace
    """

    def actions(self) -> list:
        return [
            EditFile,
            Scroll,
            OpenFile,
            CreateFileCmd,
        ]

    def triggers(self) -> list:
        return []
