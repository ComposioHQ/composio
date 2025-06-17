import requests
from pydantic import BaseModel, Field

from composio import Composio
from composio.types import ExecuteRequestFn

composio = Composio()


class AddTwoNumbersInput(BaseModel):
    a: int = Field(
        ...,
        description="The first number to add",
    )
    b: int = Field(
        ...,
        description="The second number to add",
    )


@composio.tools.custom_tool
def add_two_numbers(request: AddTwoNumbersInput) -> int:
    """Add two numbers."""
    return request.a + request.b


class GetIssueInfoInput(BaseModel):
    issue_number: int = Field(
        ...,
        description="The number of the issue to get information about",
    )


@composio.tools.custom_tool(toolkit="github")
def get_issue_info(
    request: GetIssueInfoInput,
    execute_request: ExecuteRequestFn,
    auth_credentials: dict,
) -> dict:
    """Get information about a GitHub issue."""
    response = execute_request(
        endpoint=f"/repos/composiohq/composio/issues/{request.issue_number}",
        method="GET",
        parameters=[
            {
                "name": "Accept",
                "value": "application/vnd.github.v3+json",
                "type": "header",
            },
            {
                "name": "Authorization",
                "value": f"Bearer {auth_credentials['access_token']}",
                "type": "header",
            },
        ],
    )
    return {"data": response.data}


@composio.tools.custom_tool(toolkit="github")
def get_issue_info_direct(
    request: GetIssueInfoInput,
    execute_request: ExecuteRequestFn,
    auth_credentials: dict,
) -> dict:
    """Get information about a GitHub issue."""
    response = requests.get(
        f"https://api.github.com/repos/composiohq/composio/issues/{request.issue_number}",
        headers={
            "Accept": "application/vnd.github.v3+json",
            "Authorization": f"Bearer {auth_credentials['access_token']}",
        },
    )
    return {"data": response.json()}


response = composio.tools.execute(
    user_id="default",
    slug=get_issue_info.slug,
    arguments={"issue_number": 1},
)

print(response)
