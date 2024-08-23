import ssl
from typing import Dict
from urllib.request import Request, urlopen

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction


# pylint: disable=import-outside-toplevel
class ScrapeWebsiteElementToolRequest(BaseModel):
    website_url: str = Field(..., description="Mandatory website url to read the file")
    element_selector: str = Field(
        ..., description="CSS selector for the element to scrape"
    )


class ScrapeWebsiteElementToolResponse(BaseModel):
    element_content: str = Field(..., description="The content of the selected element")


class ScrapeWebsiteElement(
    LocalAction[
        ScrapeWebsiteElementToolRequest,
        ScrapeWebsiteElementToolResponse,
    ]
):
    """Scrape website element"""

    _tags = ["Web browser"]

    def execute(
        self,
        request: ScrapeWebsiteElementToolRequest,
        metadata: Dict,
    ) -> ScrapeWebsiteElementToolResponse:
        """Scrape a specific element from the website and return its content"""
        try:
            from bs4 import BeautifulSoup
        except ModuleNotFoundError as e:
            raise ModuleNotFoundError("Failed to import BeautifulSoup:", e) from e

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
            element = soup.select_one(request.element_selector)
            if element:
                return ScrapeWebsiteElementToolResponse(element_content=str(element))
        raise ValueError(
            f"No content found for element selector {request.element_selector}"
        )
