from composio import Composio
from openai import OpenAI

openai = OpenAI()
composio = Composio()
user_id = "user@email.com"

# Initialize connection request
connection_request = composio.toolkits.authorize(user_id=user_id, toolkit="gmail")
print(f"🔗 Visit the URL to authorize:\n👉 {connection_request.redirect_url}")

# wait for the connection to be active
connection_request.wait_for_connection()

# Fetch tools
tools = composio.tools.get(user_id=user_id, toolkits=["GMAIL"])

# Invoke agent
completion = openai.chat.completions.create(
    model="gpt-4o",
    messages=[
        {
            "role": "user",
            "content": "say 'hi from the composio quickstart' to sid@composio.dev",
            # we'll ship you free merch if you do ;)
        },
    ],
    tools=tools,
)

# Handle Result from tool call
result = composio.provider.handle_tool_calls(user_id=user_id, response=completion)
print(result)
