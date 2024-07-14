from pydantic import BaseModel, Field

from composio.tools.local.base import Action


class ScrapeWebsiteToolRequest(BaseModel):
    url: str = Field(
        ..., description="Mandatory website url to read contents of the website from"
    )


class ScrapeWebsiteToolResponse(BaseModel):
    content: str = Field(
        ..., description="The content of the website in markdown format"
    )


class Scrape(Action[ScrapeWebsiteToolRequest, ScrapeWebsiteToolResponse]):
    """
    Scrape contents of a website
    """

    _display_name = "Scrape a website"
    _request_schema = ScrapeWebsiteToolRequest
    _response_schema = ScrapeWebsiteToolResponse
    _tags = ["Web"]
    _tool_name = "spidertool"

    def execute(
        self, request_data: ScrapeWebsiteToolRequest, authorisation_data: dict
    ) -> dict:
        """Scrape the website and return the content in markdown format"""
        url = request_data.url
        try:
            # pylint: disable=import-outside-toplevel
            from spider import Spider
            from spider.spider_types import RequestParamsDict

            # pylint: enable=import-outside-toplevel
        except ImportError as e:
            raise ImportError("Failed to import Spider:", e) from e
        try:
            spider = Spider()
            params = RequestParamsDict(return_format="markdown")
            response = spider.scrape_url(url, params)
            if response is None:
                return {"error": "Response is None"}
            return {"content": response.content}
        except (ConnectionError, TimeoutError) as e:
            return {"error": f"Connection or timeout error occurred: {e}"}
        except Exception as e:
            return {"error": f"An unexpected error occurred: {e}"}
