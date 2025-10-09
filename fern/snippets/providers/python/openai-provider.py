from openai import OpenAI
from composio import Composio
from composio_openai import OpenAIProvider

# Initialize Composio client with OpenAI Provider
composio = Composio(provider=OpenAIProvider())
openai = OpenAI()

# Make sure to create an auth config and a connected account for the user with gmail toolkit
# Make sure to replace "your-user-id" with the actual user ID
user_id = "your-user-id"

tools = composio.tools.get(user_id=user_id, tools=["GMAIL_SEND_EMAIL"])

response = openai.chat.completions.create(
    model="gpt-5",
    tools=tools,
    messages=[
        {"role": "user", "content": "Send an email to soham.g@composio.dev with the subject 'Running OpenAI Provider snippet' and body 'Hello from the code snippet in openai docs'"},
    ],
)

# Execute the function calls
result = composio.provider.handle_tool_calls(response=response, user_id=user_id)
print(result)
