import os
import json
from openai import OpenAI
from composio_openai import ComposioToolSet, App, Action
from dotenv import load_dotenv

load_dotenv()
XAI_API_KEY = os.getenv("XAI_API_KEY")

client = OpenAI(
    api_key=XAI_API_KEY,
    base_url="https://api.x.ai/v1",
)

toolset = ComposioToolSet()
tools = toolset.get_tools(apps=[App.FILETOOL, App.SHELLTOOL])

messages = [{"role": "system", "content": "You are a creative and expert AI game developer. Your task is to design and create unique games using the `pygame` library in Python. You have to save it in a file with FileTool and have to use ShellTool to run it, this is mandatory."},
            {"role": "user", "content": "Create the best version of Flappy Bird game using `pygame`. Ensure the complete Python code is saved to a file named `flappy_bird.py` and you run the python file with the Shell Tool."}]

response = client.chat.completions.create(
    model="grok-3-mini-beta",
    messages=messages, # type: ignore
    tools=tools,  
    tool_choice="required",
    temperature=0.1
)

print(response.choices[0].message)

# Extract the response message
response_message = response.choices[0].message

# Append assistant's response to messages
messages.append(response_message) # type: ignore

# Check if the model decided to use tools
while response_message.tool_calls:
    tool_responses = []
    for tool_call in response_message.tool_calls:
        print(f"Executing tool call: {tool_call.function.name}")
        tool_response_content = toolset.execute_tool_call(
            tool_call=tool_call
        )
        print(f"Tool response: {tool_response_content}")
        # Append tool response to messages for the next turn
        tool_responses.append(
            {
                "tool_call_id": tool_call.id,
                "role": "tool",
                "name": tool_call.function.name,
                "content": json.dumps(tool_response_content), # Tool results must be JSON serializable
            }
        )

    # Append all tool responses to messages
    messages.extend(tool_responses) # type: ignore

    # Make the next API call AFTER processing all tool calls
    response = client.chat.completions.create(
        model="grok-3-mini-beta",
        messages=messages, # type: ignore
        tools=tools,
        tool_choice="auto",
        temperature=0.1
    )
    response_message = response.choices[0].message
    messages.append(response_message) # type: ignore

# Print the final response message after the loop finishes
print("Final response:")
print(response_message.content)