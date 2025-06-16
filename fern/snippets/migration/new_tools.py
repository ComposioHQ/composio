from composio import Composio

composio = Composio()

user_id = "user@acme.org"

tools_1 = composio.tools.get(user_id=user_id, toolkits=["GITHUB", "LINEAR"])

tools_2 = composio.tools.get(user_id=user_id, toolkits=["SLACK"], limit=5)  # Default limit=20

tools_3 = composio.tools.get(
    user_id=user_id,
    tools=["GITHUB_CREATE_AN_ISSUE", "GITHUB_CREATE_AN_ISSUE_COMMENT", "GITHUB_CREATE_A_COMMIT"],
)

tools_4 = composio.tools.get(user_id="john", search="hackernews posts")
