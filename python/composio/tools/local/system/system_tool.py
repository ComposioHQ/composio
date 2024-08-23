import typing as t

from composio.tools.base.local import LocalAction, LocalTool

from .actions import Notify, ScreenCapture


class SystemTools(LocalTool, autoload=True):
    """
    System Tools for LLM
    """

    @classmethod
    def actions(cls) -> list[t.Type[LocalAction]]:
        return [ScreenCapture, Notify]
