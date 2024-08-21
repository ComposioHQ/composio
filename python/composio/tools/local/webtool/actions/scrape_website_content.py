import ssl
from typing import Dict
from urllib.request import Request, urlopen

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction


# pylint: disable=import-outside-toplevel
class ScrapeWebsiteToolRequest(BaseModel):
    website_url: str = Field(
        ..., description="Mandatory website url to read contents of the website from"
    )


class ScrapeWebsiteToolResponse(BaseModel):
    website_content: str = Field(..., description="The content of the website")


class ScrapeWebsiteContent(
    LocalAction[
        ScrapeWebsiteToolRequest,
        ScrapeWebsiteToolResponse,
    ]
):
    """Scrape contents of a website"""

    _tags = ["Webbrowser"]

    def execute(
        self, request: ScrapeWebsiteToolRequest, metadata: Dict
    ) -> ScrapeWebsiteToolResponse:
        """Scrape the website and return the content"""
        try:
            from bs4 import BeautifulSoup
        except ModuleNotFoundError as e:
            raise ModuleNotFoundError("Failed to import BeautifulSoup:", e) from e

        # Adding headers to mimic a browser request
        req = Request(
            request.website_url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/58.0.3029.110 Safari/537.3"
                )
            },
        )
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        with urlopen(req, context=context) as response:
            html = response.read().decode("utf-8")
            soup = BeautifulSoup(html, "html.parser")
            return ScrapeWebsiteToolResponse(website_content=str(soup))
