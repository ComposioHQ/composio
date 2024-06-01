import ssl
from pydantic import BaseModel, Field
from urllib.request import Request, urlopen
from composio.core.local import Action

class ScrapeWebsiteElementToolRequest(BaseModel):
    website_url: str = Field(..., description="Mandatory website url to read the file")
    element_selector: str = Field(..., description="CSS selector for the element to scrape")

class ScrapeWebsiteElementToolResponse(BaseModel):
    element_content: str = Field(..., description="The content of the selected element")


class ScrapeWebsiteElement(Action):
    """
    Scrame website element
    """
    _display_name = "Scrape a website element"
    _request_schema = ScrapeWebsiteElementToolRequest
    _response_schema = ScrapeWebsiteElementToolResponse
    _tags = ["Webbrowser"]
    _tool_name = "webtool"
    
    def execute(self, request: ScrapeWebsiteElementToolRequest , authorisation_data: dict = {}):
        """Scrape a specific element from the website and return its content"""
        url = request.website_url
        selector = request.element_selector
        try:
            from bs4 import BeautifulSoup
        except ImportError as e:
            raise ImportError("Failed to import BeautifulSoup:", e)
        try:
            # Adding headers to mimic a browser request
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
            }
            req = Request(url, headers=headers)
            # Adding SSL context to handle CERTIFICATE_VERIFY_FAILED error
            context = ssl.create_default_context()
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE
            response = urlopen(req, context=context)
            html = response.read().decode('utf-8')
            soup = BeautifulSoup(html, 'html.parser')
            element = soup.select_one(selector)
            if element:
                return str(element)
            else:
                return "Element not found"
        except Exception as e:
            return f"Error scraping element: {e}"
