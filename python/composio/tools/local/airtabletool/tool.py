import typing as t

from composio.tools.base.local import LocalAction, LocalTool

from .actions import AirTableListRecord,AirTableCreateTable


class AirtableTool(LocalTool,autoload=True):
    """Airtable Local tool"""

    @classmethod
    def actions(cls) -> list[t.Type[LocalAction]]:
        return [AirTableListRecord,AirTableCreateTable]
