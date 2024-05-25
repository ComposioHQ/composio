from composio.sdk.local_tools.lib.tool import Tool
from composio.sdk.local_tools.local_workspace.workspace.actions.workspace_setup import SetupWorkspace
from composio.sdk.local_tools.local_workspace.workspace.actions.workspace_status import WorkspaceStatus
from composio.sdk.local_tools.local_workspace.workspace.actions.setup_github_repo import SetupGithubRepo


class LocalWorkspace(Tool):
    """
    Mathematical Tools for LLM
    """
    def actions(self) -> list:
        return [WorkspaceStatus,
                SetupWorkspace,
                SetupGithubRepo]

    def triggers(self) -> list:
        return []
