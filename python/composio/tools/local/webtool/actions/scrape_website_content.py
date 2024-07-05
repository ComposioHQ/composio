import ssl
from urllib.request import Request, urlopen

from pydantic import BaseModel, Field

from composio.tools.local.base import Action


class ScrapeWebsiteToolRequest(BaseModel):
    website_url: str = Field(
        ..., description="Mandatory website url to read contents of the website from"
    )


class ScrapeWebsiteToolResponse(BaseModel):
    website_content: str = Field(..., description="The content of the website")


class ScrapeWebsiteContent(Action[ScrapeWebsiteToolRequest, ScrapeWebsiteToolResponse]):
    """
    Scrape contents of a website
    """

    _display_name = "Scrape a website"
    _request_schema = ScrapeWebsiteToolRequest
    _response_schema = ScrapeWebsiteToolResponse
    _tags = ["Webbrowser"]
    _tool_name = "webtool"

    def execute(
        self, request_data: ScrapeWebsiteToolRequest, authorisation_data: dict
    ) -> dict:
        """Scrape the website and return the content"""
        url = request_data.website_url
        try:
            # pylint: disable=import-outside-toplevel
            from bs4 import BeautifulSoup

            # pylint: enable=import-outside-toplevel
        except ImportError as e:
            raise ImportError("Failed to import BeautifulSoup:", e) from e
        try:
            # Adding headers to mimic a browser request
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"
            }
            req = Request(url, headers=headers)
            # Adding SSL context to handle CERTIFICATE_VERIFY_FAILED error
            context = ssl.create_default_context()
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE
            with urlopen(req, context=context) as response:
                html = response.read().decode("utf-8")
                soup = BeautifulSoup(html, "html.parser")
                result = {"website_content": str(soup)}
            return result
        except Exception as e:
            print("ERROR __________________", e)
            result = {"error": f"Error scraping website: {e}"}
            return result
