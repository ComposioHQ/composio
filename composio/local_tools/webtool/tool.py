from composio.local_tools.tool import Tool
from ..tool import Action
from .actions.scrape_website_content import ScrapeWebsiteContent
from .actions.scrape_website_element import ScrapeWebsiteElement
import typing as t

class WebTool(Tool):
    """Web Tools"""
    
    def actions(self) -> list[t.Type[Action]]:
        return [ScrapeWebsiteContent, ScrapeWebsiteElement]

    def triggers(self) -> list:
        return []