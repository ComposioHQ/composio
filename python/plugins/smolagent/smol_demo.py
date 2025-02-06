from dotenv import load_dotenv
import os

from composio import Action
from composio_smol import ComposioToolSet
from smolagents import HfApiModel, CodeAgent

# Initialize toolset
composio_toolset = ComposioToolSet()

tools = composio_toolset.get_tools(
    actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER],
)
# Create agent with Composio tools
agent = CodeAgent(
    tools=list(tools),
    model=HfApiModel()
)

agent.run("Star the composiohq/composio repo")
