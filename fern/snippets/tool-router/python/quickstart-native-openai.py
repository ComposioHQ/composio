import os
import json
from dotenv import load_dotenv
from composio import Composio
from openai import OpenAI

# Load environment variables from .env file
load_dotenv()

composio_api_key = os.environ.get("COMPOSIO_API_KEY")
user_id = "user_123"  # Your user's unique identifier

# Initialize Composio and create a Tool Router session
composio = Composio(api_key=composio_api_key)
session = composio.create(user_id=user_id)

# Initialize OpenAI client
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# Get Tool Router as a native tool
tool_router = session.get_tool_router()

print("Assistant: What would you like me to do today?\n")

# Interactive loop
messages = []
while True:
    user_input = input("> ")
    if user_input == "exit":
        break
    
    # Add user message
    messages.append({"role": "user", "content": user_input})
    
    # Get response from OpenAI
    response = client.chat.completions.create(
        model="gpt-4-turbo-preview",
        messages=messages,
        tools=[tool_router.tool],
        tool_choice="auto"
    )
    
    assistant_message = response.choices[0].message
    messages.append(assistant_message)
    
    # Handle tool calls
    if assistant_message.tool_calls:
        for tool_call in assistant_message.tool_calls:
            if tool_call.function.name == "composio_tool_router":
                # Execute the tool
                args = json.loads(tool_call.function.arguments)
                result = tool_router.execute(args)
                
                # Add tool result to messages
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(result)
                })
        
        # Get final response after tool execution
        final_response = client.chat.completions.create(
            model="gpt-4-turbo-preview",
            messages=messages,
            tools=[tool_router.tool]
        )
        
        final_message = final_response.choices[0].message
        messages.append(final_message)
        print(f"Assistant: {final_message.content}\n")
    else:
        print(f"Assistant: {assistant_message.content}\n")