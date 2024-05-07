from griptape.structures import Agent
from griptape.utils import Chat

from composio_griptape import App, Action, Tag, ComposioToolset
import dotenv


dotenv.load_dotenv("/Users/sawradip/Desktop/practice_code/practice_composio/composio_sdk/examples/.env")

composio_toolset = ComposioToolset()
composio_tools = composio_toolset.get_tools(tools = App.GITHUB)

agent = Agent(
    tools=composio_tools
)

Chat(agent).start()