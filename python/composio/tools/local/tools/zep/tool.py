"""
Zep as composio tool.

Read about zep - https://help.getzep.com/concepts
"""

import typing as t

from composio.core.local.action import Action
from composio.core.local.tool import Tool
from composio.local_tools.zep.actions.add_memory import AddMemory
from composio.local_tools.zep.actions.create_session import CreateSession
from composio.local_tools.zep.actions.get_memory import GetMemory
from composio.local_tools.zep.actions.search_memory import SearchMemory


class ZepTool(Tool):
    """Tool definition for zep"""

    def actions(self) -> t.List[t.Type[Action]]:
        """Get zep actions."""
        return [
            CreateSession,
            AddMemory,
            GetMemory,
            SearchMemory,
        ]

    def triggers(self) -> list:
        """Get zep triggers."""
        return []
