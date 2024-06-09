from pydantic import BaseModel, Field
from composio.core.local import Action
import requests

class FetchSummaryRequestSchema(BaseModel):
    title: str = Field(..., description="Title of the Wikipedia article")

class FetchSummaryResponseSchema(BaseModel):
    summary: str = Field(..., description="Summary of the Wikipedia article")

class FetchSummaryAction(Action):
    """
    Fetches the summary of a Wikipedia article.
    """

    _display_name = "Fetch Wikipedia Summary"
    _request_schema = FetchSummaryRequestSchema
    _response_schema = FetchSummaryResponseSchema
    _tags = ["wikipedia", "summary"]
    _tool_name = "wikipediatool"  

    def execute(
        self, request_data: FetchSummaryRequestSchema, authorization_data: dict = {}
    ) -> dict:
        response = requests.get(
            f"https://en.wikipedia.org/api/rest_v1/page/summary/{request_data.title}"
        )
        data = response.json()
        summary = data.get("extract", "No summary available.")
        response_data = {"summary": summary}
        return {"execution_details": {"executed": True}, "response_data": response_data}
