import dotenv
from composio_griptape import App, ComposioToolset
from griptape.structures import Agent
from griptape.utils import Chat


dotenv.load_dotenv()
composio_toolset = ComposioToolset()
composio_tools = composio_toolset.get_tools(tools=App.GITHUB)

agent = Agent(tools=composio_tools)

Chat(agent).start()
