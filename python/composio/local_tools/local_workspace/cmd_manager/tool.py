from typing import Optional

from composio.core.local import Tool
from composio.local_tools.local_workspace.cmd_manager.actions import (
    AutoflakeLinter,
    Autopep8Linter,
    BlackLinter,
    CreateFileCmd,
    EditFile,
    FindFileCmd,
    Flake8Linter,
    GetCurrentDirCmd,
    GetPatchCmd,
    GitRepoTree,
    GithubCloneCmd,
    GoToLineNumInOpenFile,
    IsortLinter,
    OpenFile,
    PylintLinter,
    RunCommandOnWorkspace,
    Scroll,
    SearchDirCmd,
    SearchFileCmd,
)
from composio.local_tools.local_workspace.commons import (
    HistoryProcessor,
    WorkspaceManagerFactory,
)


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
            GitRepoTree,
            Flake8Linter,
            PylintLinter,
            IsortLinter,
            BlackLinter,
            AutoflakeLinter,
            Autopep8Linter,
            GetPatchCmd,
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
