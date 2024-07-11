import typing as t

from composio.tools.local.base import Action, Tool

from .actions import Crawl, Scrape


class SpiderTool(Tool):
    """Spider Tools"""

    def actions(self) -> list[t.Type[Action]]:
        return [Scrape, Crawl]

    def triggers(self) -> list:
        return []
