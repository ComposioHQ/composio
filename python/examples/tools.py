from composio import Composio

composio = Composio()

# Get all tools by toolkit
tools = composio.tools.get(user_id="default", toolkits=["GITHUB"])

# Get all tools by search
tools = composio.tools.get(user_id="default", search="user")

# Get all tools by toolkit and search
tools = composio.tools.get(user_id="default", toolkits=["GITHUB"], search="star")

# execute tool
response = composio.tools.execute(
    user_id="default",
    slug="HACKERNEWS_GET_USER",
    arguments={"username": "pg"},
)
print(response)

# execute proxy call (github)
proxy_response = composio.tools.proxy(
    endpoint="/repos/composiohq/composio/issues/1",
    method="GET",
    connected_account_id="ac_1234",  # use connected account for github
    parameters=[
        {
            "name": "Accept",
            "value": "application/vnd.github.v3+json",
            "type": "header",
        },
    ],
)
print(proxy_response)

# Using custom auth params
response = composio.tools.execute(
    user_id="default",
    slug="GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER",
    arguments={
        "owner": "composiohq",
        "repo": "composio",
    },
    custom_auth_params={
        "parameters": [
            {
                "name": "Authorization",
                "value": "Bearer <ACCESS_TOKEN>",
                "in": "header",
            },
            {
                "name": "Accept",
                "value": "application/vnd.github.v3+json",
                "in": "header",
            },
        ],
    },
)
print(response)
