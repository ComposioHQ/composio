from composio import Composio, schema_modifier
from composio.types import Tool
from composio_google import GoogleProvider
from google import genai
from google.genai import types
from uuid import uuid4

composio = Composio(provider=GoogleProvider())
client = genai.Client()
user_id = uuid4()   # User ID from DB/App


@schema_modifier(tools=["GITHUB_LIST_REPOSITORY_ISSUES"])
def append_repository(
    tool: str, 
    toolkit: str,
    schema: Tool,
) -> Tool:
    schema.description += " When not specified, use the `composiohq/composio` repository"
    return schema


tools = composio.tools.get(
    user_id=user_id, tools=["GITHUB_LIST_REPOSITORY_ISSUES"], modifiers=[append_repository]
)

print(tools)

model = "gemini-2.5-pro"
config = types.GenerateContentConfig(
    temperature=1.5,
    system_instruction="You're a GitHub Taskmaster. Help me with managing my GitHub",
    max_output_tokens=65536,
    top_p=0.95,
    tools=tools,
)


response = client.models.generate_content(
    model=model, config=config, contents=["What are some issues on my GitHub repo?"]
)

print(response.text)
