from composio import Composio
from composio_gemini import GeminiProvider
from google import genai
from google.genai import types

user_id = "0000-1111-2222"

# Create composio client
composio = Composio(provider=GeminiProvider())

# Create google client
client = genai.Client()

# Create genai client config
config = types.GenerateContentConfig(
    tools=composio.tools.get(
        user_id=user_id,
        tools=[
            "COMPOSIO_SEARCH_DUCK_DUCK_GO_SEARCH",
        ],
    )
)

# Use the chat interface.
chat = client.chats.create(model="gemini-2.0-flash", config=config)
response = chat.send_message("What's new happening with Cluely?")
print(response.text)
