import typing as t

from composio.tools.local.base import Action, Tool
from composio.tools.local.shelltool.workspace.actions import WorkspaceStatusAction


class WorkspaceTool(Tool):
    """
    Use this action to create a workspace and get workspace ID in return.
    this is a tool for creating local workspace
    """

    def actions(self) -> list[t.Type[Action]]:
        return [WorkspaceStatusAction]

    def triggers(self) -> list:
        return []
