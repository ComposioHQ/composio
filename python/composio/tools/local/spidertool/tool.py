import typing as t

from composio.tools.base.local import LocalAction, LocalTool

from .actions import Crawl, Scrape


class Spidertool(LocalTool, autoload=True):
    """Spider Tools"""

    logo = "https://raw.githubusercontent.com/ComposioHQ/composio/master/python/docs/imgs/logos/spidertool.png"

    @classmethod
    def actions(cls) -> list[t.Type[LocalAction]]:
        return [Scrape, Crawl]
