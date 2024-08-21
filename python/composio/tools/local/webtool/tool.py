import typing as t

from composio.tools.base.local import LocalAction, LocalTool

from .actions import ScrapeWebsiteContent, ScrapeWebsiteElement


class Webtool(LocalTool, autoload=True):
    """Web Tools"""

    @classmethod
    def actions(cls) -> list[t.Type[LocalAction]]:
        return [ScrapeWebsiteContent, ScrapeWebsiteElement]
