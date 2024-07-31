import typing as t
from composio.tools.local.base import Action, Tool
from .actions.filter import Filter
from .actions.comment import Comment


class Reddit(Tool):
    """
    Reddit tool
    """

    def actions(self) -> list[t.Type[Action]]:
        return [Filter, Comment]

    def triggers(self) -> list:
        return []  # If applicable, define triggers here
    
    