from agno.agent import Agent
from composio_agno.toolset import Action, ComposioToolSet


toolset = ComposioToolSet()
composio_tools = toolset.get_tools(actions=[Action.GMAIL_GET_PROFILE])

agent = Agent(tools=composio_tools, show_tool_calls=True)

agent.print_response("Can you get my profile")
