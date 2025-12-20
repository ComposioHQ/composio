import os
from dotenv import load_dotenv
from composio import Composio
from agents import Agent, Runner, HostedMCPTool, SQLiteSession

load_dotenv()

composio_api_key = os.environ.get("COMPOSIO_API_KEY")
user_id = "user_123"  # Your user's unique identifier

composio = Composio(api_key=composio_api_key)
composio_session = composio.create(user_id=user_id)

agent = Agent(
    name="Personal Assistant",
    instructions="You are a helpful personal assistant. Use Composio tools to take action.",
    model="gpt-5.2",  
    tools=[
        HostedMCPTool(
            tool_config={
                "type": "mcp",
                "server_label": "composio",
                "server_url": composio_session.mcp.url,
                "require_approval": "never",
                "headers": {"x-api-key": composio_api_key},
            }
        )
    ],
)

# Create a session for multi-turn conversation memory
conversation_session = SQLiteSession(user_id)

print("Assistant: What would you like me to do today?\n")

while True:
    user_input = input("> ")
    if user_input == "exit":
        break
    
    result = Runner.run_sync(
        starting_agent=agent, 
        input=user_input,
        session=conversation_session
    )
    
    print(f"Assistant: {result.final_output}\n")

