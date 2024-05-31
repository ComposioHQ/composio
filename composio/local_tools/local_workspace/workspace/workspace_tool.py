from typing import Optional

from composio.local_tools.local_workspace.commons.history_processor import (
    HistoryProcessor,
)
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    WorkspaceManagerFactory,
)
from composio.local_tools.tool import Tool
from composio.local_tools.local_workspace.workspace.actions.create_workspace import (
    CreateWorkspaceAction,
)
from composio.local_tools.local_workspace.workspace.actions.workspace_status import (
    WorkspaceStatus,
)


class LocalWorkspace(Tool):
    """
    Use this action to create a workspace and get workspace ID in return.
    this is a tool for creating local workspace
    """

    workspace_factory: Optional[WorkspaceManagerFactory] = None
    history_processor: Optional[HistoryProcessor] = None

    def actions(self) -> list:
        return [WorkspaceStatus, CreateWorkspaceAction]

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
