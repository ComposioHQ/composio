from pydantic import BaseModel, Field
from composio import Composio
from composio.core.models.custom_tools import ExecuteRequestFn


composio = Composio()

class GetIssueInfoInput(BaseModel):
    issue_number: int = Field(
        ...,
        description="The number of the issue to get information about",
    )

# function name will be used as slug
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
