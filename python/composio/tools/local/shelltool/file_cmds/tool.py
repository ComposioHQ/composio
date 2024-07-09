from composio.tools.local.base import Tool
from composio.tools.local.shelltool.file_cmds.actions import (
    CreateFileCmd,
    EditFile,
    OpenFile,
    Scroll,
)


class FileEditTool(Tool):
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
