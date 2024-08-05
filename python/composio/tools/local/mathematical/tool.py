import typing as t

from composio.tools.base.local import LocalAction, LocalTool

from .actions import Calculator


class Mathematical(LocalTool, autoload=True):
    """Mathematical Tools for LLM"""

    @classmethod
    def actions(cls) -> list[t.Type[LocalAction]]:
        return [Calculator]
