import ssl
from urllib.request import Request, urlopen

from pydantic import BaseModel, Field

from composio.core.local import Action


class WikipediaToolRequest(BaseModel):
    page: str = Field(
        ..., description="Mandatory page name to read contents from"
    )


class WikipediaToolResponse(BaseModel):
    wiki_content: str = Field(..., description="The content of the wiki page")


class WikipediaContent(Action):
    """
    Get contents from a wikipedia page
    """

    _display_name = "Wikipedia"
    _request_schema = WikipediaToolRequest
    _response_schema = WikipediaToolResponse
    _tool_name = "wikipedia"

    def execute(self, request: WikipediaToolRequest, authorisation_data: dict = {}):
        """Scrape the website and return the content"""
        page = request.page
        try:
            # pylint: disable=import-outside-toplevel
            import wikipediaapi
            # pylint: enable=import-outside-toplevel
        except ImportError as e:
            raise ImportError("Failed to import wikipediaapi:", e) from e
        try:
            # Adding headers to mimic a browser request
            wiki_wiki = wikipediaapi.Wikipedia('Composio (merlin@example.com)', 'en')
            req = wiki_wiki.page(page)
            print("RESPONSE _________________________", str(req.text))
            result = str(req)
            return result
        except Exception as e:
            print("ERROR __________________", e)
            result = f"Error getting wikipedia page data: {e}"
            return result
