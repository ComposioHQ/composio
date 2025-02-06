from dotenv import load_dotenv
from composio import Action
from composio_smol import ComposioToolSet
from smolagents import HfApiModel, CodeAgent

load_dotenv()
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
