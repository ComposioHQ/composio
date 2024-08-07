import typing as t

from composio.tools.local.base import Action, Tool

from .actions import CreateIndex, GetClassInfo, GetMethodBody, GetMethodSignature


class CodeAnalysisTool(Tool):
    """Code index tool."""

    def actions(self) -> t.List[t.Type[Action]]:
        """Return the list of actions."""
        return [CreateIndex, GetClassInfo, GetMethodBody, GetMethodSignature]

    def triggers(self) -> t.List:
        """Return the list of triggers."""
        return []
