from openai import OpenAI
from composio import Composio
from composio_openai import OpenAIProvider

# Initialize Composio client with OpenAI Provider
composio = Composio(provider=OpenAIProvider())
openai = OpenAI()

user_id = "user@acme.org"
tools = composio.tools.get(user_id=user_id, toolkits=["HACKERNEWS"])

response = openai.chat.completions.create(
    model="gpt-4.1",
    tools=tools,
    messages=[
        {"role": "user", "content": "What's the latest Hackernews post about?"},
    ],
)

# Execute the function calls.
result = composio.provider.handle_tool_calls(response=response, user_id=user_id)
print(result)
# will return the raw response from the HACKERNEWS API.