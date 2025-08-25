# Tools

Manage tools in the Composio SDK.

## composio.tools.custom_tool

Register a custom tool.

**Parameters**

    - **f**: The function to wrap.
    - **toolkit**: The toolkit to use for the custom tool. 

**Returns**

    - The custom tool.

**Examples**

```python
from pydantic import BaseModel, Field

# Define the request model
class AddNumbersRequest(BaseModel):
    a: int = Field(..., description="The first number")
    b: int = Field(..., description="The second number")

# Define a custom tool function
@composio.tools.custom_tool
def add_numbers(request: AddNumbersRequest) -> int:
    """return request.a + request.b"""

# Execute the custom tool
result = composio.tools.execute(
    user_id="<USER_ID>",
    slug=add_numbers.slug,
    arguments={"a": 1, "b": 2},
)
print(result)

# Define a custom tool function with a toolkit
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

# Execute the custom tool
result = composio.tools.execute(
    user_id="<USER_ID>",
    slug=get_issue_info.slug,
    arguments={"issue_number": 1},
)
print(result)

# Include the custom tool in your agent
tools = composio.tools.get(
    user_id="<USER_ID>",
    tools=[
        get_issue_info.slug,
    ],
)
print(tools)
```

## composio.tools.execute

Execute a tool with the provided parameters.  This method calls the Composio API or a custom tool handler to execute the tool and returns the response. It automatically determines whether to use a custom tool or a Composio API tool based on the slug.

**Parameters**

    - **slug**: The slug of the tool to execute.
    - **arguments**: The arguments to pass to the tool.
    - **connected_account_id**: The ID of the connected account to use for the tool.
    - **custom_auth_params**: The custom auth params to use for the tool.
    - **custom_connection_data**: The custom connection data to use for the tool, takes priority over custom_auth_params.
    - **user_id**: The ID of the user to execute the tool for.
    - **text**: Use this to pass a natural language query to the tool.
    - **version**: The version of the tool to execute.
    - **modifiers**: The modifiers to apply to the tool. 

**Returns**

    - The response from the tool.

**Examples**

```python
# Execute a tool with a custom auth params
response = composio.tools.execute(
    user_id="<USER_ID>",
    slug="GMAIL_SEND_EMAIL",
    arguments={
        "to": "test@example.com",
        "subject": "Hello",
        "body": "Hello, world!",
    },
)
print(response)

# Execute a tool with a custom auth params
response = composio.tools.execute(
    user_id="<USER_ID>",
    slug="GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER",
    arguments={
        "owner": "composiohq",
        "repo": "composio",
    },
    custom_auth_params={
        "base_url": "https://api.github.com",
        "parameters": [
            {
                "name": "Authorization",
                "value": "Bearer ghp_1234567890",
                "in": "header",
            }
        ],
    },
)
print(response)

# Execute a tool using natural language
response = composio.tools.execute(
    user_id="<USER_ID>",
    slug="GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER",
    text="Star the repository composiohq/composio on GitHub",
    arguments={},
)
print(response)
```

## composio.tools.get

Get a tool or list of tools based on the provided arguments.

**Parameters**

    - **user_id**: The ID of the user to get the tools for.
    - **slug**: The slug of the tool to get.
    - **tools**: The list of tool slugs to get.
    - **search**: The search term to filter the tools by.
    - **toolkits**: The list of toolkits to filter the tools by.
    - **scopes**: The scopes to filter the tools by.
    - **limit**: The limit of tools to return.
    - **modifiers**: The modifiers to apply to the tools. 

**Returns**

    - A tool or list of tools.

**Examples**

```python
# Get a tool by slug
tool = composio.tools.get(
    user_id="<USER_ID>",
    slug="GMAIL_SEND_EMAIL",
)
print(tool)

# Get a list of tools by tool slugs
tools = composio.tools.get(
    user_id="<USER_ID>",
    tools=[
        "GMAIL_SEND_EMAIL",
        "GMAIL_FETCH_EMAILS",
    ],
)
print(tools)

# Get a list of tools by search term
tools = composio.tools.get(
    user_id="<USER_ID>",
    search="star a github repository",
)
print(tools)
```

## composio.tools.get_raw_composio_tool_by_slug

Returns schema for the given tool slug.

**Parameters**

    - **slug**: The slug of the tool to get the schema for. 

**Returns**

    - The schema for the given tool slug.

**Examples**

```python
# Get the schema for a tool
schema = composio.tools.get_raw_composio_tool_by_slug(slug="github")
print(schema)
```

## composio.tools.get_raw_composio_tools

Get a list of tool schemas based on the provided filters.

**Parameters**

    - **tools**: The list of tools to get the schema for.
    - **search**: The search term to filter the tools by.
    - **toolkits**: The list of toolkits to filter the tools by.
    - **scopes**: The scopes to filter the tools by.
    - **limit**: The limit of tools to return. 

**Returns**

    - A list of tool schemas.

**Examples**

```python
# Get a list of tool schemas
schemas = composio.tools.get_raw_composio_tools()
print(schemas)

# Get a list of tool schemas filtered by toolkits
schemas = composio.tools.get_raw_composio_tools(toolkits=["github"])
print(schemas)

# Get a list of tool schemas filtered by search
schemas = composio.tools.get_raw_composio_tools(search="github")
print(schemas)
```

## composio.tools.proxy

Proxy a tool call to the Composio API.

**Parameters**

    - **endpoint**: The endpoint to proxy the tool call to.
    - **method**: The method to use for the tool call.
    - **body**: The body to use for the tool call.
    - **parameters**: The parameters to use for the tool call.
    - **connected_account_id**: The connected account ID to use for the tool call. 

**Returns**

    - The response from the tool.

**Examples**

```python
# Make request to GitHub API via Composio API
response = composio.tools.proxy(
    connected_account_id="<CONNECTED_ACCOUNT_ID>",  # Connected account ID corresponding to GitHub
    endpoint="/repos/composiohq/composio/issues/1",
    method="GET",
    body={},
)
print(response)
```

