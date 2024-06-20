"""
Griptape demo.
"""

import dotenv
from composio_griptape import App, ComposioToolSet
from griptape.structures import Agent
from griptape.utils import Chat


# Load environment variables from .env
dotenv.load_dotenv()

# Initialize Toolset
composio_toolset = ComposioToolSet()

# Retrieve tools
github_tools = composio_toolset.get_tools(apps=[App.GITHUB])

# Initialize agent.
agent = Agent(tools=github_tools)

# Start the agent.
Chat(agent).start()
