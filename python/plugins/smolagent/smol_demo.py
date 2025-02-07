from composio_smol import ComposioToolSet
from dotenv import load_dotenv
from smolagents import CodeAgent, HfApiModel

from composio import Action


load_dotenv()
# Initialize toolset
composio_toolset = ComposioToolSet()

tools = composio_toolset.get_tools(
    actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER],
)
# Create agent with Composio tools
agent = CodeAgent(tools=tools, model=HfApiModel())

agent.run("Star the composiohq/composio repo")
