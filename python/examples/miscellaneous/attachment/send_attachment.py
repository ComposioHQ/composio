"""
OpenAI Send Email with Attachment demo.
"""

import os

import dotenv
from openai import OpenAI

from composio_openai import App, ComposioToolSet


# Load environment variables from .env
dotenv.load_dotenv()

# Initialize tools.
openai_client = OpenAI()
composio_toolset = ComposioToolSet()

# Get Gmail tools
tools = composio_toolset.get_tools(apps=[App.GMAIL])

# Define task
task = "Send an email to testcomposio@gmail.com with 'send_attachment.py' as attachment."

# Get response from the LLM
response = openai_client.chat.completions.create(
    model="gpt-4-turbo-preview",
    tools=tools,
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": task},
    ],
)
print(response)

# Execute the function calls.
result = composio_toolset.handle_tool_calls(response)
print(result)
