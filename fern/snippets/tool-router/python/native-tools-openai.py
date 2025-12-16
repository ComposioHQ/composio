import os
from dotenv import load_dotenv
from composio import Composio
from agents import Agent, Runner
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
    instructions="You are a helpful assistant with access to external tools. Use the available tools to complete user requests.",
    model="gpt-5.2",
    tools=tools,
)

# Run the agent with a specific task
result = Runner.run_sync(
    starting_agent=agent,
    input="Fetch all open issues from the composio/composio GitHub repository and create a summary of the top 5 by priority"
)

print(f"Assistant: {result.final_output}")