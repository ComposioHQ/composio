import dotenv 
import anthropic
from pprint import pprint
from composio_claude import App, ComposioToolset

# Loading the variables from .env file
dotenv.load_dotenv()

claude_client = anthropic.Anthropic()

toolset = ComposioToolset()
composio_tools = toolset.get_tools(tools=App.GITHUB)


response = claude_client.beta.tools.messages.create(
    model="claude-3-opus-20240229",
    max_tokens=1024,
    tools= composio_tools,
    messages=[
        {
            "role": "user", 
            "content": "Star me sawradip/sawradip repo in github."
        }
    ],
)
print(response)

result = toolset.handle_tool_calls(response)
pprint(result)