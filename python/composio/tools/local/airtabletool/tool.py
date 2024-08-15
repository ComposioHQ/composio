import typing as t

from composio.tools.local.base import Action, Tool

from .actions import Read, Write


class AirtableTool(Tool):
    """Airtable Tools"""

    def actions(self) -> list[t.Type[Action]]:
        return [Read, Write]

    def triggers(self) -> list:
        return []
