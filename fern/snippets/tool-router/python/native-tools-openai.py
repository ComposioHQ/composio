from dotenv import load_dotenv
from composio import Composio
from agents import Agent, Runner, SQLiteSession
from composio_openai_agents import OpenAIAgentsProvider

load_dotenv()

# Initialize Composio with OpenAI Agents provider (API key from env var COMPOSIO_API_KEY)
composio = Composio(provider=OpenAIAgentsProvider())

# Unique identifier of the user
user_id = "user_123"

# Create a session and get native tools for the user
session = composio.create(user_id=user_id)
tools = session.tools()

# Configure OpenAI agent with Composio tools
agent = Agent(
    name="Personal Assistant",
    instructions="You are a helpful personal assistant. Use Composio tools to take action.",
    model="gpt-5.2",
    tools=tools,
)

# Memory for multi-turn conversation
memory = SQLiteSession("conversation")

# Execute an initial task
print("Fetching GitHub issues from the Composio repository...\n")
try:
    result = Runner.run_sync(
        starting_agent=agent,
        input="Fetch all the open GitHub issues on the @ComposioHQ/composio repository and group them by bugs/features/docs.",
        session=memory,
    )
    print(f"{result.final_output}\n")
except Exception as e:
    print(f"[Error]: {e}")

# Continue with interactive conversation
print("\nWhat else would you like me to do? (Type 'exit' to exit)")

while True:
    user_input = input("You: ").strip()
    if user_input.lower() == "exit":
        break

    print("Assistant: ", end="", flush=True)
    try:
        result = Runner.run_sync(starting_agent=agent, input=user_input, session=memory)
        print(f"{result.final_output}\n")
    except Exception as e:
        print(f"\n[Error]: {e}")