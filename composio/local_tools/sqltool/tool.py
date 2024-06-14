
from composio.core.local import Tool, Action
from .actions.sql_query import SqlQuery

class SqlTool(Tool):
    """
    This class enables us to execute sql queries in a database
    """

    def actions(self) -> list[Action]:
        return [SqlQuery]
    
    def triggers(self) -> list:
        return []
