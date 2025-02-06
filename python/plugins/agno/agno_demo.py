from agno.agent.agent import Agent
from composio_agno.toolset import Action, ComposioToolSet


toolset = ComposioToolSet()
composio_tools = toolset.get_tools(
    actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER]
)

agent = Agent(tools=composio_tools, show_tool_calls=True)

agent.print_response("Can you star ComposioHQ/composio repo?")
