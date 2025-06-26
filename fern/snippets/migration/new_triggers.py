from composio import Composio

composio = Composio()

user_id = "user@example.com"
trigger_config = composio.triggers.get_type("GITHUB_COMMIT_EVENT")
print(trigger_config.config)
### Trigger Config
# {
#     "properties": {
#         "owner": {
#             "description": "Owner of the repository",
#             "title": "Owner",
#             "type": "string"
#         },
#         "repo": {
#             "description": "Repository name",
#             "title": "Repo",
#             "type": "string"
#         }
#     },
#     "required": ["owner", "repo"],
#     "title": "WebhookConfigSchema",
#     "type": "object"

trigger = composio.triggers.create(
    slug="GITHUB_COMMIT_EVENT",
    user_id=user_id,
    trigger_config={"repo": "composiohq", "owner": "composio"},
)
print(trigger)


# Managing triggers

composio.triggers.enable(id="ti_abcd123")