from composio import Composio
from composio_gemini import GeminiProvider
from google import genai
from google.genai import types

# Create composio client
composio = Composio(provider=GeminiProvider())
# Create google client
client = genai.Client()

user_id = "0000-1111-2222"
tools = composio.tools.get(user_id, tools=["COMPOSIO_SEARCH_DUCK_DUCK_GO_SEARCH"])

# Create genai client config
config = types.GenerateContentConfig(tools=tools)

# # Use the chat interface.
chat = client.chats.create(model="gemini-2.0-flash", config=config)
response = chat.send_message("search about the latest info on windsurf acquisition.")
print(response.text)
