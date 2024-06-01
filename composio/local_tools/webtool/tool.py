from composio.core.local import Tool, Action
from .actions import ScrapeWebsiteContent, ScrapeWebsiteElement
import typing as t

class WebTool(Tool):
    """Web Tools"""
    
    def actions(self) -> list[t.Type[Action]]:
        return [ScrapeWebsiteContent, ScrapeWebsiteElement]

    def triggers(self) -> list:
        return []