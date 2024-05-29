from composio.local_tools.local_workspace.commons.history_processor import (
    HistoryProcessor,
)
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    WorkspaceManagerFactory,
)
from composio.local_tools.local_workspace.workspace.actions.create_workspace import (
    CreateWorkspaceAction,
)
from composio.local_tools.local_workspace.workspace.actions.setup_github_repo import (
    SetupGithubRepo,
)
from composio.local_tools.local_workspace.workspace.actions.workspace_setup import (
    SetupWorkspace,
)
from composio.local_tools.local_workspace.workspace.actions.workspace_status import (
    WorkspaceStatus,
)
from composio.local_tools.tool import Tool


class LocalWorkspace(Tool):
    """
    Use this action to create a workspace and get workspace ID in return.
    this is a tool for creating local workspace
    """

    workspace_factory: WorkspaceManagerFactory = None
    history_processor: HistoryProcessor = None

    def actions(self) -> list:
        return [WorkspaceStatus, SetupWorkspace, SetupGithubRepo, CreateWorkspaceAction]

    def triggers(self) -> list:
        return []

    def set_workspace_factory(self, workspace_factory: WorkspaceManagerFactory):
        self.workspace_factory = workspace_factory

    def get_workspace_factory(self) -> WorkspaceManagerFactory:
        return self.workspace_factory

    def set_history_processor(self, history_processor: HistoryProcessor):
        self.history_processor = history_processor

    def get_history_processor(self) -> HistoryProcessor:
        return self.history_processor
