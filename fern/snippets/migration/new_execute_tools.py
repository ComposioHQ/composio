from composio import Composio
from openai import OpenAI

openai_client = OpenAI()
composio = Composio()

tools = composio.tools.get(user_id="user@acme.com",
                           toolkits=["GITHUB_GET_THE_ZEN_OF_GITHUB"])

response = openai_client.chat.completions.create(
    model="gpt-4.1",
    messages=[{"role": "user", "content": "gimme some zen."}],
    tools=tools,
)

result = composio.provider.handle_tool_calls(user_id="user@acme.com", response=response)
print(result)
