import os
import json
from dotenv import load_dotenv
from composio import Composio
from openai import OpenAI

# Load environment variables from .env file
load_dotenv()

composio_api_key = os.environ["COMPOSIO_API_KEY"]
user_id = "user_123"  # Your user's unique identifier

# Initialize Composio and create a Tool Router session
composio = Composio(api_key=composio_api_key)
session = composio.create(user_id=user_id)

# Initialize OpenAI client
client = OpenAI(
    api_key=os.environ["OPENAI_API_KEY"]
)

# Get Tool Router as a native tool
tool_router = session.get_tool_router()

# Create a chat completion with the tool
response = client.chat.completions.create(
    model="gpt-4-turbo-preview",
    messages=[
        {
            "role": "user",
            "content": (
                "Fetch all open issues from the composio/composio GitHub repository "
                "and create a summary of the top 5 by priority"
            )
        }
    ],
    tools=[tool_router.tool],
    tool_choice="auto"
)

print("Assistant:", response.choices[0].message.content)

# Handle tool calls if the assistant wants to use Tool Router
tool_calls = response.choices[0].message.tool_calls
if tool_calls:
    tool_call = tool_calls[0]
    
    if tool_call.function.name == "composio_tool_router":
        # Execute the tool with Tool Router
        args = json.loads(tool_call.function.arguments)
        result = tool_router.execute(args)
        
        # Send the result back to OpenAI
        final_response = client.chat.completions.create(
            model="gpt-4-turbo-preview",
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Fetch all open issues from the composio/composio GitHub repository "
                        "and create a summary of the top 5 by priority"
                    )
                },
                response.choices[0].message,
                {
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(result)
                }
            ],
            tools=[tool_router.tool]
        )
        
        print("Assistant:", final_response.choices[0].message.content)