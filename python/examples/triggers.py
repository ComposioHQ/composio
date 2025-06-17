from composio import Composio

composio = Composio()


# List all triggers
triggers = composio.triggers.list()
print(triggers)

# List all active triggers
active_triggers = composio.triggers.list_active()
print(active_triggers)

# List all triggers enums
trigger_enums = composio.triggers.list_enum()
print(trigger_enums)

# Get a trigger by id
trigger = composio.triggers.get_type(slug="GITHUB_COMMIT_EVENT")
print(trigger)

# Create a trigger instance
instance = composio.triggers.create(
    slug="GITHUB_COMMIT_EVENT",
    connected_account_id="123",
    trigger_config={
        "repo": "composio",
        "owner": "composiohq",
    },
)
print(instance)

# Or use user ID
instance = composio.triggers.create(
    slug="GITHUB_COMMIT_EVENT",
    user_id="user@email.com",
    trigger_config={
        "repo": "composio",
        "owner": "composiohq",
    },
)
print(instance)

# Disable a trigger instance
disabled_instance = composio.triggers.disable(trigger_id="123")
print(disabled_instance)

# Enable a trigger instance
enabled_instance = composio.triggers.enable(trigger_id="123")
print(enabled_instance)

# Delete a trigger instance
deleted_instance = composio.triggers.delete(trigger_id="123")
print(deleted_instance)

# Subscribe to a trigger
subscription = composio.triggers.subscribe()


# Define a callback functions
@subscription.handle(toolkit="GITHUB")
def handle_github_event(data):
    print(data)


@subscription.handle(toolkit="SLACK")
def handle_slack_event(data):
    print(data)


subscription.wait_forever()
