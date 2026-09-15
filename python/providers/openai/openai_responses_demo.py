"""
OpenAI Responses API demo.
"""

import json

from composio_openai import OpenAIResponsesProvider
from openai import OpenAI

from composio import Composio

# Initialize tools.
openai_client = OpenAI()
composio = Composio(provider=OpenAIResponsesProvider())

# Define task.
task = "Tell me about the user `pg` on Hacker News."

# Get tools that are pre-configured for the Responses API.
tools = composio.tools.get(user_id="default", tools=["HACKERNEWS_GET_USER"])

# Get the first response from the LLM.
response = openai_client.responses.create(
    model="gpt-5.2",
    tools=tools,
    input=task,
)
print(response)

# Execute tool calls until the model returns a final answer.
while True:
    tool_calls = [item for item in response.output if item.type == "function_call"]
    if not tool_calls:
        break

    results = composio.provider.handle_tool_calls(response=response, user_id="default")
    response = openai_client.responses.create(
        model="gpt-5.2",
        tools=tools,
        previous_response_id=response.id,
        input=[
            {
                "type": "function_call_output",
                "call_id": tool_calls[index].call_id,
                "output": json.dumps(result),
            }
            for index, result in enumerate(results)
        ],
    )

print(response.output_text)
