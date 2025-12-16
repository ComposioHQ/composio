import os
from dotenv import load_dotenv
from composio import Composio
from agents import Agent, Runner, SQLiteSession
from composio_openai_agents import OpenAIAgentsProvider

load_dotenv()

composio = Composio(api_key=os.environ.get("COMPOSIO_API_KEY"), provider=OpenAIAgentsProvider())
session = composio.create(user_id="user_123")

# Get native tools from Composio
tools = session.tools()

# Create OpenAI agent with Composio tools
agent = Agent(
    name="AI Assistant",
    instructions="You are a helpful assistant with access to external tools. Use the available tools to complete user requests.",
    model="gpt-5.2",
    tools=tools,
)

# Create session for multi-turn conversation
conversation_session = SQLiteSession("conversation_example")

print("Assistant: What would you like me to do today? Type 'exit' to end the conversation.\n")

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