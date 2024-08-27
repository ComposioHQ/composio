from composio.tools.local.base import Action, Tool
from .actions import connection, create_table
import typing as t

class Postgres(Tool):

    def actions(self) -> t.List[Action]:
        # return super().actions()
        return [connection, create_table]
    
    def triggers(self) -> t.List:
        return super().triggers()