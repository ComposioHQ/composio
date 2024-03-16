from composio.sdk import ComposioClient

client = ComposioClient()

actions = client.get_actions(["github"])
print(actions)

resp = client.execute_action("CreateIssues", "github", {
    "owner": "utkarsh-dixit",
    "repo": "speedy",
    "title": "testing E2E new 6",
    "body": "testing E2E new 6"
})
print(resp)