from composio.tools.local.base import Tool

from .actions.getrecord import GetRecord
from .actions.listrecords import ListRecords

class AirtableLocal(Tool):
    def actions(self) -> list:
        return [
            GetRecord,
            ListRecords
        ]
