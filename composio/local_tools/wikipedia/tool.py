import typing as t

from composio.core.local import Action, Tool

from .actions import WikipediaContent


class Wikipedia(Tool):
    """Wiki tool"""

    def actions(self) -> list[t.Type[Action]]:
        return [WikipediaContent]

    def triggers(self) -> list:
        return []
