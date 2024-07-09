import ssl
from urllib.request import Request, urlopen

from pydantic import BaseModel, Field

from composio.tools.local.base import Action


class ScrapeWebsiteElementToolRequest(BaseModel):
    website_url: str = Field(..., description="Mandatory website url to read the file")
    element_selector: str = Field(
        ..., description="CSS selector for the element to scrape"
    )


class ScrapeWebsiteElementToolResponse(BaseModel):
    element_content: str = Field(..., description="The content of the selected element")


class ScrapeWebsiteElement(
    Action[ScrapeWebsiteElementToolRequest, ScrapeWebsiteElementToolResponse]
):
    """
    Scrame website element
    """

    _display_name = "Scrape a website element"
    _request_schema = ScrapeWebsiteElementToolRequest
    _response_schema = ScrapeWebsiteElementToolResponse
    _tags = ["Webbrowser"]
    _tool_name = "webtool"

    def execute(
        self, request: ScrapeWebsiteElementToolRequest, authorisation_data: dict
    ) -> dict:
        """Scrape a specific element from the website and return its content"""
        if authorisation_data is None:
            authorisation_data = {}
        url = request.website_url
        selector = request.element_selector
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
                element = soup.select_one(selector)
                if element:
                    return {"element_content": str(element)}
                return {"element_content": "Element not found"}
        except Exception as e:
            return {"error": f"Error scraping element: {e}"}
