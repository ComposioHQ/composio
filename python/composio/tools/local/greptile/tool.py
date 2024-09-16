import typing as t

from composio.tools.base.local import LocalAction, LocalTool

from .actions import CodeQuery


class Greptile(LocalTool, autoload=True):
    """Code understanding tool. Index Code and answer questions about it."""

    logo = "https://raw.githubusercontent.com/ComposioHQ/composio/master/python/docs/imgs/logos/greptile.png"

    @classmethod
    def actions(cls) -> list[t.Type[LocalAction]]:
        return [CodeQuery]
