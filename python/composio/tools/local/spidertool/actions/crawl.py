from typing import Dict

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction


# pylint: disable=import-outside-toplevel


class CrawlToolRequest(BaseModel):
    url: str = Field(..., description="Mandatory website url to read the file")


class CrawlToolResponse(BaseModel):
    content: str = Field(..., description="The content of the selected element")


class Crawl(LocalAction[CrawlToolRequest, CrawlToolResponse]):
    """
    Crawl a website
    """

    _tags = ["web", "scrape"]

    def execute(self, request: CrawlToolRequest, metadata: Dict) -> CrawlToolResponse:
        """Crawl a website and return its content in markdown format"""
        try:
            from spider import Spider
            from spider.spider_types import RequestParamsDict

        except ImportError as e:
            raise ImportError("Failed to import Spider:", e) from e

        try:
            spider = Spider()
            params = RequestParamsDict(return_format="markdown")
            response = spider.crawl_url(request.url, params)
            if response is None:
                raise ValueError(f"Error getting response for url {request.url}")
            return CrawlToolResponse(content=response.content)
        except (ConnectionError, TimeoutError) as e:
            raise ValueError(f"Connection or timeout error occurred: {e}") from e
        except Exception as e:
            raise ValueError(f"An unexpected error occurred: {e}") from e
