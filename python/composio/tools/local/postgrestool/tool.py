from typing import Type

from composio.tools.local.base import Action, Tool

from .actions.postgres_query import PostgresQuery


class PostgresTool(Tool):
    """
    This class enables us to execute PostgreSQL queries in a database
    """

    def actions(self) -> list[Type[Action]]:
        return [PostgresQuery]

    def triggers(self) -> list:
        return []
