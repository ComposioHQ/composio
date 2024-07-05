import typing as t

from composio.tools.local.base import Action, Tool

from .actions import ScrapeWebsiteContent, ScrapeWebsiteElement


class WebTool(Tool):
    """Web Tools"""

    def actions(self) -> list[t.Type[Action]]:
        return [ScrapeWebsiteContent, ScrapeWebsiteElement]

    def triggers(self) -> list:
        return []
