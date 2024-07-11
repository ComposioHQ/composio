from pydantic import BaseModel, Field

from composio.tools.local.base import Action


class CrawlToolRequest(BaseModel):
    url: str = Field(..., description="Mandatory website url to read the file")


class CrawlToolResponse(BaseModel):
    content: str = Field(..., description="The content of the selected element")


class Crawl(Action[CrawlToolRequest, CrawlToolResponse]):
    """
    Crawl a website
    """

    _display_name = "Crawl a website"
    _request_schema = CrawlToolRequest
    _response_schema = CrawlToolResponse
    _tags = ["Web"]
    _tool_name = "spidertool"

    def execute(self, request: CrawlToolRequest, authorisation_data: dict) -> dict:
        """Crawl a website and return its content in markdown format"""
        url = request.url
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
            response = spider.crawl_url(url, params)
            if response is None:
                return {"error": "Response is None"}
            return {"content": response.content}
        except (ConnectionError, TimeoutError) as e:
            return {"error": f"Connection or timeout error occurred: {e}"}
        except Exception as e:
            return {"error": f"An unexpected error occurred: {e}"}
