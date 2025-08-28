from composio import Composio
from composio_openai import OpenAIProvider
from openai import OpenAI

# Use a unique identifier for each user in your application
user_id = "user-k73345" 

# Create composio client
composio = Composio(provider=OpenAIProvider(), api_key="your_composio_api_key")

# Create openai client
openai = OpenAI()

# Get calendar tools for this user
tools = composio.tools.get(
    user_id=user_id,
    tools=["GOOGLECALENDAR_EVENTS_LIST"]
)

# Ask the LLM to check calendar
result = openai.chat.completions.create(
    model="gpt-4o-mini",
    tools=tools,
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "What's on my calendar today?"}
    ]
)


# Handle tool calls
result = composio.provider.handle_tool_calls(user_id=user_id, response=result)
print(result)
