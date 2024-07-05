import json
import os

import requests
from pydantic import BaseModel, Field

from composio.tools.local.base import Action


class message(BaseModel):
    id: str = Field(..., description="The id of the message")
    content: str = Field(..., description="The content of the message")
    role: str = Field(
        default="user",
        description="The role of the message. ex system,user",
        examples=["system", "user"],
    )


class CodeQueryRequest(BaseModel):
    question: str = Field(
        ...,
        description="The question to ask the mentor",
    )
    sessionId: str = Field(
        default=None,
        description="The session id of the conversation, if you want to continue the conversation with the same mentor. defaults to None",
        examples=["1234567890"],
    )
    genius: bool = Field(
        default=False,
        description="When set to true, multiple mentors will be asked and the answers be really good. Default is false",
        examples=[True, False],
    )
    repository: str = Field(
        ...,
        description="The repository to ask the question about. This should be a github repository. Example openai/docs, samparkai/composio",
        examples=["openai/docs", "samparkai/composio"],
    )


class CodeQueryResponse(BaseModel):
    response: str = Field(..., description="The response to the question")


class CodeQuery(Action[CodeQueryRequest, CodeQueryResponse]):
    """
    Ask the mentor, any questions on the code and get the answer from the mentor.
    with a list of relevant code references (filepaths, line numbers, etc)
    If it's first question
    examples:
    “How does auth work in this codebase?”
    “Generate a description for the JIRA ticket with codebase context”
    “Rewrite this code snippet using relevant abstractions already in the repo”
    """

    _display_name = "Code query"
    _request_schema = CodeQueryRequest
    _response_schema = CodeQueryResponse
    _tags = ["code_query"]
    _tool_name = "greptile"

    def execute(
        self, request_data: CodeQueryRequest, authorisation_data: dict = {}  # type: ignore[override]
    ) -> dict:
        token = os.getenv("GREPTILE_TOKEN")
        if token is None:
            self.logger.error("GREPTILE_TOKEN is not set")
            raise ValueError("GREPTILE_TOKEN is not set")

        github_token = os.getenv("GITHUB_TOKEN")
        if github_token is None:
            self.logger.error("GITHUB_TOKEN is not set")
            raise ValueError("GITHUB_TOKEN is not set")

        # Construct the headers for the API request
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-GitHub-Token": github_token,
        }

        # Construct the data payload for the API request
        data = {
            "messages": [
                {
                    "content": "You are a helpful assistant",
                    "role": "assistant",
                },
                {
                    "content": request_data.question,
                    "role": "user",
                },
            ],
            "repositories": [
                {
                    "remote": "github",
                    "branch": "master",
                    "repository": request_data.repository,
                }
            ],
            "genius": request_data.genius,
        }

        if request_data.sessionId and request_data.sessionId != "":
            data["sessionId"] = request_data.sessionId
        # Send the POST request to the Greptile API
        response = requests.post(
            "https://api.greptile.com/v2/query",
            headers=headers,
            data=json.dumps(data),
            timeout=20,
        )
        # Check if the request was successful
        if response.status_code == 200:
            return response.json()
        self.logger.error(
            "Failed to fetch data from Greptile API, status code: %s",
            response.status_code,
        )
        return {
            "error": "Failed to fetch data from Greptile API",
            "status_code": response.status_code,
        }
