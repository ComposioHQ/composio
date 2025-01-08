from composio_phidata import Action, ComposioToolSet
from phi.agent import Agent


toolset = ComposioToolSet()
composio_tools = toolset.get_tools(
    actions=[Action.GOOGLECALENDAR_CREATE_EVENT]
)

print(composio_tools)
agent = Agent(tools=composio_tools, show_tool_calls=True)
agent.print_response("Create a new meeting at monday 08:00.")
