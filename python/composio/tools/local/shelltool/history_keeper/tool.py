import typing as t

from composio.tools.base.local import LocalAction, LocalTool

from .actions import GetWorkspaceHistory


class HistoryFetcher(LocalTool, autoload=True):
    """Local workspace tool which can maintain history across commands"""

    logo = "https://raw.githubusercontent.com/ComposioHQ/composio/master/python/docs/imgs/logos/shelltool.png"

    @classmethod
    def actions(cls) -> list[t.Type[LocalAction]]:
        return [GetWorkspaceHistory]
