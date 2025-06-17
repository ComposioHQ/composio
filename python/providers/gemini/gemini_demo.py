from composio import Composio
from composio_gemini import GeminiProvider

from google import genai
from google.genai import types


# Create composio client
composio = Composio(provider=GeminiProvider())

# Create google client
client = genai.Client()

# Create genai client config
config = types.GenerateContentConfig(
    tools=composio.tools.get(
        user_id="default",
        tools=[
            "GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER",
        ],
    )
)

# Use the chat interface.
chat = client.chats.create(model="gemini-2.0-flash", config=config)
response = chat.send_message("Can you star composiohq/composio repository on github")
print(response.text)
