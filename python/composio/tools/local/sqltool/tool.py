from typing import Type

from composio.tools.local.base import Action, Tool

from .actions.sql_query import SqlQuery


class SqlTool(Tool):
    """
    This class enables us to execute sql queries in a database
    """

    def actions(self) -> list[Type[Action]]:
        return [SqlQuery]

    def triggers(self) -> list:
        return []
