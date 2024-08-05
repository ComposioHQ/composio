from typing import Type

from composio.tools.base.local import LocalAction, LocalTool

from .actions.sql_query import SqlQuery


class Sqltool(LocalTool, autoload=True):
    """
    This class enables us to execute sql queries in a database
    """

    @classmethod
    def actions(cls) -> list[Type[LocalAction]]:
        return [SqlQuery]
