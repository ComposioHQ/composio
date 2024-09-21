"""
Zep as composio tool.

Read about zep - https://help.getzep.com/concepts
"""

import typing as t

from composio.tools.base.local import LocalAction, LocalTool
from composio.tools.local.zep.actions.add_memory import AddMemory
from composio.tools.local.zep.actions.create_session import CreateSession
from composio.tools.local.zep.actions.get_memory import GetMemory
from composio.tools.local.zep.actions.search_memory import SearchMemory


class Zeptool(LocalTool, autoload=True):
    """Tool definition for zep"""

    logo = "https://raw.githubusercontent.com/ComposioHQ/composio/master/python/docs/imgs/logos/zep.png"

    @classmethod
    def actions(cls) -> t.List[t.Type[LocalAction]]:
        """Get zep actions."""
        return [
            CreateSession,
            AddMemory,
            GetMemory,
            SearchMemory,
        ]
