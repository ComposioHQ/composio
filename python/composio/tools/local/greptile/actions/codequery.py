import json
import os
import typing as t

import requests
from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction


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
    sessionId: t.Optional[str] = Field(
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
        description="The repository to ask the question about. This should be a github repository. Example openai/docs, composiohq/composio",
        examples=["openai/docs", "composiohq/composio"],
    )
    timeout: int = Field(
        default=60,
        description="The timeout for the Greptile API request. Default is 20 seconds",
        examples=[60, 120, 180],
    )
    branch: t.Optional[str] = Field(
        default=None,
        description="The branch to ask the question about. Default is master, if not specified. Example: main, master",
        examples=["master", "main"],
    )


class CodeQueryResponse(BaseModel):
    response: dict = Field(..., description="The response to the question")


class CodeQuery(LocalAction[CodeQueryRequest, CodeQueryResponse]):
    """
    Ask the mentor, any questions on the code and get the answer from the mentor.
    with a list of relevant code references (filepaths, line numbers, etc)
    If it's first question
    examples:
    “How does auth work in this codebase?”
    “Generate a description for the JIRA ticket with codebase context”
    “Rewrite this code snippet using relevant abstractions already in the repo”
    """

    _tags = ["code_query"]

    def execute(self, request: CodeQueryRequest, metadata: t.Dict) -> CodeQueryResponse:
        token = metadata.get("greptile_token", os.getenv("GREPTILE_TOKEN"))
        if token is None:
            self.logger.error("GREPTILE_TOKEN is not set")
            raise ValueError("GREPTILE_TOKEN is not set")

        github_token = metadata.get("github_token", os.getenv("GITHUB_TOKEN"))
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
                {"content": request.question, "role": "user"},
            ],
            "repositories": [
                {
                    "remote": "github",
                    "branch": request.branch,
                    "repository": request.repository,
                }
            ],
            "genius": request.genius,
        }

        if request.sessionId and request.sessionId != "":
            data["sessionId"] = request.sessionId

        # Send the POST request to the Greptile API
        response = requests.post(
            "https://api.greptile.com/v2/query",
            headers=headers,
            data=json.dumps(data),
            timeout=request.timeout,
        )

        # Check if the request was successful
        if response.status_code == 200:
            return CodeQueryResponse(response=response.json())

        self.logger.error(
            "Failed to fetch data from Greptile API, status code: %s",
            response.status_code,
        )

        raise ValueError(
            f"Failed to fetch data from Greptile API with status code "
            f"{response.status_code} and error {response.content.decode()}"
        )
