# pylint: disable=import-outside-toplevel

from typing import Dict

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction


class ScrapeWebsiteToolRequest(BaseModel):
    url: str = Field(
        ..., description="Mandatory website url to read contents of the website from"
    )


class ScrapeWebsiteToolResponse(BaseModel):
    content: str = Field(
        ..., description="The content of the website in markdown format"
    )


class Scrape(LocalAction[ScrapeWebsiteToolRequest, ScrapeWebsiteToolResponse]):
    """
    Scrape contents of a website
    """

    _tags = ["Web"]

    def execute(
        self, request: ScrapeWebsiteToolRequest, metadata: Dict
    ) -> ScrapeWebsiteToolResponse:
        """Scrape the website and return the content in markdown format"""

        try:
            from spider import Spider
            from spider.spider_types import RequestParamsDict
        except ImportError as e:
            raise ImportError("Failed to import Spider:", e) from e

        try:
            spider = Spider()
            params = RequestParamsDict(return_format="markdown")
            response = spider.scrape_url(request.url, params)
            if response is None:
                raise ValueError(f"Error getting response for url {request.url}")
            return ScrapeWebsiteToolResponse(content=response.content)
        except (ConnectionError, TimeoutError) as e:
            raise ValueError(f"Connection or timeout error occurred: {e}") from e
        except Exception as e:
            raise ValueError(f"An unexpected error occurred: {e}") from e
