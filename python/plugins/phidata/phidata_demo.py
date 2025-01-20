from composio_phidata import Action, ComposioToolSet
from phi.assistant.assistant import Assistant


toolset = ComposioToolSet()
composio_tools = toolset.get_tools(
    actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER]
)

assistant = Assistant(
    run_id=None, tools=composio_tools, show_tool_calls=True
)  # run_id is a mandatory parameter

assistant.print_response("Can you start composiohq/composio repo?")
