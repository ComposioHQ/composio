from openai import OpenAI
from composio import Composio

# Initialize Composio client with OpenAI Provider
composio = Composio()
openai = OpenAI()

# Use a unique external ID for each of your users
user_id = "user-dev-178"

#fetch toolkit
tools = composio.tools.get(user_id=user_id, toolkits=["HACKERNEWS"])

response = openai.chat.completions.create(
    model="gpt-4",
    tools=tools,
    messages=[
        {"role": "user", "content": "What's the latest Hackernews post on GPT about?"},    
    ],
)

# Execute the function calls
result = composio.provider.handle_tool_calls(response=response, user_id=user_id)
print(result)