from composio.sdk.local_tools.lib.tool import Tool
from composio.sdk.local_tools.local_workspace.cmd_manager.actions import (CreateFileCmd,
                                                                          GoToCmd,
                                                                          OpenCmd,
                                                                          ScrollUp,
                                                                          ScrollDown,
                                                                          SearchFileCmd,
                                                                          SearchDirCmd,
                                                                          FindFileCmd,
                                                                          SetCursors,
                                                                          EditFile)


class CmdManagerTool(Tool):
    """
    command manager tool for workspace
    """
    def actions(self) -> list:
        return [
              FindFileCmd,
              CreateFileCmd,
              GoToCmd,
              OpenCmd,
              ScrollUp,
              ScrollDown,
              SearchFileCmd,
              SearchDirCmd,
              SetCursors,
              EditFile]

    def triggers(self) -> list:
        return []
