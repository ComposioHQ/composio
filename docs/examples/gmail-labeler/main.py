import sys

# region setup
import asyncio

from composio import Composio
from composio_claude_agent_sdk import ClaudeAgentSDKProvider
from claude_agent_sdk import query, ClaudeAgentOptions, create_sdk_mcp_server

composio = Composio(provider=ClaudeAgentSDKProvider())
# endregion setup


# region connect
def connect(user_id: str):
    """Check if Gmail is connected. If not, start OAuth and wait."""
    session = composio.create(user_id=user_id, toolkits=["gmail"])
    toolkits = session.toolkits()

    for t in toolkits.items:
        if t.slug == "gmail" and t.connection and t.connection.is_active:
            print("Gmail is already connected.")
            return

    connection_request = session.authorize("gmail")
    print(f"Open this URL to connect Gmail:\n{connection_request.redirect_url}")
    connection_request.wait_for_connection()
    print("Connected.")
# endregion connect


# region label
async def label_email(session, message_id: str, subject: str, body: str):
    """Use Claude to label an incoming email."""
    tools = session.tools()
    tool_server = create_sdk_mcp_server(name="composio", version="1.0.0", tools=tools)

    prompt = f"""You received a new email. Analyze it and apply an appropriate label.

Message ID: {message_id}
Subject: {subject}
Body: {body}

Steps:
1. List the existing Gmail labels.
2. Decide which label fits best, or create a new label if none fit.
3. Apply the label to this email using its message ID."""

    options = ClaudeAgentOptions(
        system_prompt="You are an email organizer. Label incoming emails with the most appropriate Gmail label.",
        permission_mode="bypassPermissions",
        mcp_servers={"composio": tool_server},
    )

    async for message in query(prompt=prompt, options=options):
        print(message)
# endregion label


# region listen
def listen(user_id: str):
    """Create a trigger, subscribe to events, and label incoming emails."""
    session = composio.create(user_id=user_id, toolkits=["gmail"])

    trigger = composio.triggers.create(
        slug="GMAIL_NEW_GMAIL_MESSAGE",
        user_id=user_id,
        trigger_config={},
    )
    print(f"Trigger created: {trigger.trigger_id}")

    loop = asyncio.new_event_loop()
    subscription = composio.triggers.subscribe()

    @subscription.handle(trigger_id=trigger.trigger_id)
    def handle_event(data):
        payload = data.get("payload", {})
        print(f"New email: {payload.get('subject', 'No subject')}")
        try:
            loop.run_until_complete(
                label_email(
                    session,
                    message_id=payload.get("id", ""),
                    subject=payload.get("subject", ""),
                    body=payload.get("message_text", ""),
                )
            )
        except Exception as e:
            print(f"Error labeling email: {e}")

    print("Listening for new emails...")
    subscription.wait_forever()
# endregion listen


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python main.py connect <user_id>")
        print("  python main.py listen <user_id>")
        sys.exit(1)

    command = sys.argv[1]

    if command == "connect":
        uid = sys.argv[2] if len(sys.argv) > 2 else "default"
        connect(uid)
    elif command == "listen":
        uid = sys.argv[2] if len(sys.argv) > 2 else "default"
        listen(uid)
    else:
        print(f"Unknown command: {command}")
        print("Use 'connect' or 'listen'.")
        sys.exit(1)
