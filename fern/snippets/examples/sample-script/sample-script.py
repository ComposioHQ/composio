from composio_core import Composio
from openai import OpenAI

# Initialize OpenAI client
openai = OpenAI(api_key="your-openai-api-key")

# Initialize Composio client
composio = Composio(api_key="your-composio-api-key")

# Set up user identifier
userId = "your@email.com"

# Authorize and get tools for Gmail
connection, tools = composio.toolkits.authorize(userId, "gmail")
print(f"🔗 Visit the URL to authorize:\n👉 {connection.redirect_url}")

# Wait for the user to complete authorization
connection.wait_for_connection()

# Create a chat completion with tool calling
completion = openai.chat.completions.create(
    model="gpt-4o",
    messages=[
        {
            "role": "system",
            "content": "You are a helpful assistant that can send emails.",
        },
        {
            "role": "user",
            "content": "send an email to soham@composio.dev saying 'hi from the composio quickstart'",
            # we'll ship you free merch if you do ;)
        },
    ],
    tools=tools,
    tool_choice="auto",
)

# Handle the tool call and execute
result = composio.provider.handle_tool_call(userId, completion)
print("✅ Email sent successfully!")
print(result)
