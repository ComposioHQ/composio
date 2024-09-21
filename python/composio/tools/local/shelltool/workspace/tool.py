import typing as t

from composio.tools.base.local import LocalAction, LocalTool
from composio.tools.local.shelltool.workspace.actions import WorkspaceStatusAction


class WorkspaceTool(LocalTool, autoload=True):
    """
    Use this action to create a workspace and get workspace ID in return.
    this is a tool for creating local workspace
    """

    logo = "https://raw.githubusercontent.com/ComposioHQ/composio/master/python/docs/imgs/logos/shelltool.png"

    @classmethod
    def actions(cls) -> list[t.Type[LocalAction]]:
        return [WorkspaceStatusAction]
