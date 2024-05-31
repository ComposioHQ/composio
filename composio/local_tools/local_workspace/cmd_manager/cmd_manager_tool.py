from typing import Optional

from composio.local_tools.local_workspace.cmd_manager.actions.clone_github import (
    GithubCloneCmd,
)

from composio.local_tools.local_workspace.cmd_manager.actions.cmds import (
    CreateFileCmd,
    GoToLineNumInOpenFile,
    OpenFile,
)
from composio.local_tools.local_workspace.cmd_manager.actions.edit_cmd import (
    EditFile,
)
from composio.local_tools.local_workspace.cmd_manager.actions.run_cmd import (
    RunCommandOnWorkspace,
)
from composio.local_tools.local_workspace.cmd_manager.actions.scroll_cmds import (
    Scroll,
)
from composio.local_tools.local_workspace.cmd_manager.actions.search_cmds import (
    FindFileCmd,
    SearchDirCmd,
    SearchFileCmd,
    GithubCloneCmd,
    GetCurrentDirCmd,
)

from composio.local_tools.local_workspace.commons.history_processor import (
    HistoryProcessor,
)
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    WorkspaceManagerFactory,
)
from composio.local_tools.tool import Tool


class CmdManagerTool(Tool):
    """
    command manager tool for workspace
    """

    workspace_factory: Optional[WorkspaceManagerFactory] = None
    history_processor: Optional[HistoryProcessor] = None

    def actions(self) -> list:
        return [
            FindFileCmd,
            CreateFileCmd,
            GoToLineNumInOpenFile,
            OpenFile,
            Scroll,
            SearchFileCmd,
            SearchDirCmd,
            EditFile,
            RunCommandOnWorkspace,
            GetCurrentDirCmd,
            GithubCloneCmd,
        ]

    def triggers(self) -> list:
        return []

    def set_workspace_factory(self, workspace_factory: WorkspaceManagerFactory):
        self.workspace_factory = workspace_factory

    def get_workspace_factory(self) -> Optional[WorkspaceManagerFactory]:
        return self.workspace_factory

    def set_history_processor(self, history_processor: HistoryProcessor):
        self.history_processor = history_processor

    def get_history_processor(self) -> Optional[HistoryProcessor]:
        return self.history_processor
