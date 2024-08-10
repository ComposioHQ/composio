from composio_phidata import Action, ComposioToolSet
from phi.assistant import Assistant


toolset = ComposioToolSet()
composio_tools = toolset.get_actions(
    actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER]
)

assistant = Assistant(tools=composio_tools, show_tool_calls=True)

assistant.print_response("Can you start sawradip/sawradip repo?")
# pprint(tool)
