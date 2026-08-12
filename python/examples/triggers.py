import os

from composio import Composio

composio = Composio()

# Connected account with Gmail access and its owner (raise KeyError when unset)
gmail_connected_account_id = os.environ["COMPOSIO_EXAMPLES_GMAIL_CONNECTED_ACCOUNT_ID"]
user_id = os.environ["COMPOSIO_EXAMPLES_USER_ID"]


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
trigger = composio.triggers.get_type(slug="GMAIL_NEW_GMAIL_MESSAGE")
print(trigger)

# Create a trigger instance pinned to a connected account
instance = composio.triggers.create(
    slug="GMAIL_NEW_GMAIL_MESSAGE",
    connected_account_id=gmail_connected_account_id,
    trigger_config={},
)
print(instance)

# Or use user ID and let the backend resolve the active connection
instance = composio.triggers.create(
    slug="GMAIL_NEW_GMAIL_MESSAGE",
    user_id=user_id,
    trigger_config={},
)
print(instance)

# Disable a trigger instance
disabled_instance = composio.triggers.disable(trigger_id=instance.trigger_id)
print(disabled_instance)

# Enable a trigger instance
enabled_instance = composio.triggers.enable(trigger_id=instance.trigger_id)
print(enabled_instance)

# Delete a trigger instance
deleted_instance = composio.triggers.delete(trigger_id=instance.trigger_id)
print(deleted_instance)


# Verify a webhook (example in Flask)
# @app.route('/webhook', methods=['POST'])
# def webhook():
#     try:
#         result = composio.triggers.verify_webhook(
#             id=request.headers.get('webhook-id', ''),
#             payload=request.get_data(as_text=True),
#             signature=request.headers.get('webhook-signature', ''),
#             timestamp=request.headers.get('webhook-timestamp', ''),
#             secret=os.environ['COMPOSIO_WEBHOOK_SECRET'],
#         )
#
#         # Result contains:
#         # - version: WebhookVersion (V1, V2, or V3)
#         # - payload: Normalized TriggerEvent
#         # - raw_payload: Original parsed payload
#         print(f"Webhook version: {result['version']}")
#         print(f"Trigger: {result['payload']['trigger_slug']}")
#         return 'OK', 200
#     except WebhookSignatureVerificationError:
#         return 'Unauthorized', 401


# Subscribe to a trigger
subscription = composio.triggers.subscribe()


# Define a callback functions
@subscription.handle(toolkit="GITHUB")
def handle_github_event(data):
    print(data)


@subscription.handle(toolkit="SLACK")
def handle_slack_event(data):
    print(data)


print("Subscribed to triggers. Waiting for events...", flush=True)
subscription.wait_forever()
