from composio_openai import ComposioToolSet, Action, App
from openai import OpenAI

toolset = ComposioToolSet()
client = OpenAI()

tools = toolset.get_tools(
    actions=[Action.GITHUB_GET_THE_AUTHENTICATED_USER], check_connected_accounts=True
)

tools = toolset.get_tools(apps=[App.GITHUB, App.LINEAR, App.SLACK], check_connected_accounts=True)

messages = [...]
response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=messages,
    tools=tools,
)

result = toolset.handle_tool_calls(response)
print(result)
