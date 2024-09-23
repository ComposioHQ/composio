import typing as t

from composio.tools.local.base import Action, Tool

from .actions import GetSchema, ReadAll, Write


class AirtableTool(Tool):
    """Airtable Tools"""

    def actions(self) -> list[t.Type[Action]]:
        return [GetSchema, ReadAll, Write]

    def triggers(self) -> list:
        return []
