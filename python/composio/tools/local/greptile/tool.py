import typing as t

from composio.tools.base.local import LocalAction, LocalTool

from .actions import CodeQuery


class Greptile(LocalTool, autoload=True):
    """Code understanding tool. Index Code and answer questions about it."""

    @classmethod
    def actions(cls) -> list[t.Type[LocalAction]]:
        return [CodeQuery]
