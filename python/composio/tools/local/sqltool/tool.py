from typing import Type

from composio.tools.base.local import LocalAction, LocalTool

from .actions.sql_query import SqlQuery


class Sqltool(LocalTool, autoload=True):
    """
    This class enables us to execute sql queries in a database
    """

    logo = "https://raw.githubusercontent.com/ComposioHQ/composio/master/python/docs/imgs/logos/sqltool.png"

    requires = ["sqlalchemy>=2.0"]

    @classmethod
    def actions(cls) -> list[Type[LocalAction]]:
        return [SqlQuery]
