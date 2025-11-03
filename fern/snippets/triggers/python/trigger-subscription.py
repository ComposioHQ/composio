from composio import Composio

# Initialize Composio client
composio = Composio(api_key="your_api_key_here")

# Subscribe to trigger events
subscription = composio.triggers.subscribe()

# Define event handler
@subscription.handle(trigger_id="your_trigger_id")
def handle_github_commit(data):
    print(f"New commit detected: {data}")
    # Add your custom logic here

# listen for events on the trigger
subscription.wait_forever()
# Note: For production use, set up webhooks instead
