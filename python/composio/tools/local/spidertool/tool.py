import typing as t

from composio.tools.base.local import LocalAction, LocalTool

from .actions import Crawl, Scrape


class Spidertool(LocalTool, autoload=True):
    """Spider Tools"""

    @classmethod
    def actions(cls) -> list[t.Type[LocalAction]]:
        return [Scrape, Crawl]
