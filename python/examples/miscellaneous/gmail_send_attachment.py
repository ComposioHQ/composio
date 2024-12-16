"""
OpenAI demo.
"""

import dotenv
from composio_openai import App, Action, ComposioToolSet
from openai import OpenAI


# Load environment variables from .env
dotenv.load_dotenv()

# Initialize tools.
import os

openai_client = OpenAI(
    base_url="https://oai.helicone.ai/v1",
    default_headers={
        "Helicone-Auth": f"Bearer {os.environ['HELICONE_API_KEY']}",
        "Helicone-Cache-Enabled": "true",
    },
)
composio_toolset = ComposioToolSet()

# Define task.
task = "Send a mail to sawradip0@gmail.com, with `Test Composio Attachment` in subject, and `defghijklm` in body, and `/Users/sawradip/Desktop/practice_code/practice_composio/composio/docs/media/intro.jpg` as attachment."

# Get GitHub tools that are pre-configured
tools = composio_toolset.get_actions(
    actions=[Action.GMAIL_SEND_EMAIL, Action.MATHEMATICAL_CALCULATOR]
)

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
