import os

from composio import (
    Composio,
    after_execute,
    before_execute,
    before_file_upload,
    schema_modifier,
)
from composio.types import Tool, ToolExecuteParams, ToolExecutionResponse

composio = Composio()


@before_execute(tools=["HACKERNEWS_GET_USER"])
def before_execute_modifier(
    tool: str,
    toolkit: str,
    params: ToolExecuteParams,
) -> ToolExecuteParams:
    # Perform modifications on the request
    print("before_execute_modifier", tool, toolkit)
    return params


@before_file_upload(tools=["HACKERNEWS_GET_USER"])
def rewrite_upload_path(path: str, tool: str, toolkit: str) -> str:
    """Optional: same pattern as before_execute; use for per-tool file path policy."""
    return path


@after_execute(tools=["HACKERNEWS_GET_USER"])
def after_execute_modifier(
    tool: str,
    toolkit: str,
    response: ToolExecutionResponse,
) -> ToolExecutionResponse:
    return {
        **response,
        "data": {
            "karama": response["data"]["karama"],
        },
    }


# execute tool
response = composio.tools.execute(
    user_id="default",
    slug="HACKERNEWS_GET_USER",
    arguments={"username": "pg"},
    modifiers=[
        before_execute_modifier,
        rewrite_upload_path,
        after_execute_modifier,
    ],
)
print(response)


@schema_modifier(tools=["HACKERNEWS_GET_USER"])
def modify_schema(
    tool: str,
    toolkit: str,
    schema: Tool,
) -> Tool:
    # Perform modifications on the schema
    print("modify_schema", tool, toolkit)
    return schema


tools = composio.tools.get(
    user_id="default",
    slug="HACKERNEWS_GET_USER",
    modifiers=[modify_schema],
)
print(tools)


@before_execute(toolkits=["NOTION"])
def add_custom_auth(
    tool: str,
    toolkit: str,
    params: ToolExecuteParams,
) -> ToolExecuteParams:
    if params["custom_auth_params"] is None:
        params["custom_auth_params"] = {"parameters": []}

    params["custom_auth_params"]["parameters"].append(  # type: ignore
        {
            "name": "x-api-key",
            "value": os.getenv("NOTION_API_KEY"),
            "in": "header",
        }
    )
    return params


result = composio.tools.execute(
    user_id="default",
    slug="NOTION_GET_DATABASES",
    arguments={},
    modifiers=[
        add_custom_auth,
    ],
)
print(result)
