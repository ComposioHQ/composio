import typing as t

from composio.tools.base.local import LocalAction, LocalTool

from .actions import ScrapeWebsiteContent, ScrapeWebsiteElement


class Webtool(LocalTool, autoload=True):
    """Web Tools"""

    logo = "https://raw.githubusercontent.com/ComposioHQ/composio/master/python/docs/imgs/logos/webtool.png"

    @classmethod
    def actions(cls) -> list[t.Type[LocalAction]]:
        return [ScrapeWebsiteContent, ScrapeWebsiteElement]
