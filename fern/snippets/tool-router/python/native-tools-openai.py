import os
from dotenv import load_dotenv
from composio import Composio
from agents import Agent, Runner, SQLiteSession
from composio_openai_agents import OpenAIAgentsProvider

# Load environment variables from .env file
load_dotenv()

composio = Composio(api_key=os.environ.get("COMPOSIO_API_KEY"), provider=OpenAIAgentsProvider())
session = composio.create(user_id="user_123")

# Get native tools from Composio
tools = session.tools()

# Create OpenAI agent with Composio tools
agent = Agent(
    name="AI Assistant",
    instructions="You are a helpful assistant with access to external tools. Always use the available tools to complete user requests instead of just explaining how to do them.",
    model="gpt-5.2",
    tools=tools,
)

# Create session for multi-turn conversation
conversation_session = SQLiteSession("conversation_example")

# Execute an initial task that requires GitHub access
print("Executing initial task: Fetching GitHub issues...\n")
result = Runner.run_sync(
    starting_agent=agent,
    input="Fetch all the open GitHub issues on the composio repository and group them by bugs/features/docs.",
    session=conversation_session,
)
print(f"Result: {result.final_output}\n")

# Continue with interactive conversation
print("Assistant: What else would you like me to do? Type 'exit' to end the conversation.\n")

while True:
    user_input = input("> ")
    if user_input.lower() == "exit":
        break
    
    # Run agent with session to maintain context
    result = Runner.run_sync(
        starting_agent=agent,
        input=user_input,
        session=conversation_session,
    )
    
    print(f"Assistant: {result.final_output}\n")