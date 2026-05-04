import sys

# region setup
from agents import Agent, Runner
from composio import Composio
from composio_openai_agents import OpenAIAgentsProvider

composio = Composio(provider=OpenAIAgentsProvider())
# endregion setup


# region connect
def connect(user_id: str):
    """Check if Supabase is connected. If not, start OAuth and wait."""
    session = composio.create(user_id=user_id, toolkits=["supabase"])
    toolkits = session.toolkits()

    for t in toolkits.items:
        if t.slug == "supabase" and t.connection and t.connection.is_active:
            print("Supabase is already connected.")
            return

    connection_request = session.authorize("supabase")
    print(f"Open this URL to connect Supabase:\n{connection_request.redirect_url}")
    connection_request.wait_for_connection()
    print("Connected.")
# endregion connect


# region query
def query(user_id: str):
    """Interactive loop: ask questions in natural language, get SQL results."""
    session = composio.create(user_id=user_id, toolkits=["supabase"])
    tools = session.tools()

    agent = Agent(
        name="Supabase SQL Agent",
        instructions=(
            "You are a Supabase SQL assistant. You help users query their Supabase "
            "databases using natural language. First list the user's projects to find "
            "the right database, then translate their questions into SQL queries and "
            "run them. Always explain the results clearly."
        ),
        tools=tools,
    )

    print("Supabase SQL Agent (type 'exit' to quit)")
    print("-" * 45)

    last_response_id = None
    while True:
        user_input = input("you > ")
        if user_input.strip().lower() == "exit":
            break

        result = Runner.run_sync(
            starting_agent=agent,
            input=user_input,
            previous_response_id=last_response_id,
        )
        last_response_id = result.last_response_id
        print(f"agent > {result.final_output}\n")
# endregion query


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python main.py connect <user_id>")
        print("  python main.py query <user_id>")
        sys.exit(1)

    command = sys.argv[1]

    if command == "connect":
        user_id = sys.argv[2] if len(sys.argv) > 2 else "default"
        connect(user_id)
    elif command == "query":
        user_id = sys.argv[2] if len(sys.argv) > 2 else "default"
        query(user_id)
    else:
        print(f"Unknown command: {command}")
        print("Use 'connect' or 'query'.")
        sys.exit(1)
