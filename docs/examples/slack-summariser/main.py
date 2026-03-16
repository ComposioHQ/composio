import sys

# region setup
from agents import Agent, Runner
from composio import Composio
from composio_openai_agents import OpenAIAgentsProvider

composio = Composio(provider=OpenAIAgentsProvider())
# endregion setup


# region connect
def connect(user_id: str):
    """Check if Slack is connected. If not, start OAuth and wait."""
    session = composio.create(user_id=user_id, toolkits=["slack"])
    toolkits = session.toolkits()

    for t in toolkits.items:
        if t.slug == "slack" and t.connection and t.connection.is_active:
            print("Slack is already connected.")
            return

    connection_request = session.authorize("slack")
    print(f"Open this URL to connect Slack:\n{connection_request.redirect_url}")
    connection_request.wait_for_connection()
    print("Connected.")
# endregion connect


# region summarize
def summarize(user_id: str, channel: str):
    """Fetch recent messages from a Slack channel and summarize them."""
    session = composio.create(user_id=user_id, toolkits=["slack"])
    tools = session.tools()

    agent = Agent(
        name="Slack Summarizer",
        instructions=(
            "You summarize Slack channel messages. "
            "Fetch recent messages from the given channel and provide a concise summary "
            "of the key topics, decisions, and action items."
        ),
        tools=tools,
    )

    result = Runner.run_sync(
        starting_agent=agent,
        input=f"Summarize the recent messages from the #{channel} channel.",
    )
    print(result.final_output)
# endregion summarize


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python main.py connect <user_id>")
        print("  python main.py summarize <user_id> <channel>")
        sys.exit(1)

    command = sys.argv[1]

    if command == "connect":
        user_id = sys.argv[2] if len(sys.argv) > 2 else "default"
        connect(user_id)
    elif command == "summarize":
        user_id = sys.argv[2] if len(sys.argv) > 2 else "default"
        channel = sys.argv[3] if len(sys.argv) > 3 else "general"
        summarize(user_id, channel)
    else:
        print(f"Unknown command: {command}")
        print("Use 'connect' or 'summarize'.")
        sys.exit(1)
