from typing import Type

from composio.tools.local.base import Action, Tool

from .actions import PostgresIndex, PostgresQuery


class PostgresTool(Tool):
    """
    This class enables us to use PostgreSQL in a database
    """

    def actions(self) -> list[Type[Action]]:
        return [PostgresIndex, PostgresQuery]

    def triggers(self) -> list:
        return []
