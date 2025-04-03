from composio_gemini import Action, ComposioToolSet
from google import genai
from google.genai import types

client = genai.Client()

toolset = ComposioToolSet()
tools = toolset.get_tools(
    actions=[
        Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER,
    ]
)

config = types.GenerateContentConfig(tools=tools)
chat = client.chats.create(model="gemini-2.0-flash", config=config)
response = chat.send_message(
    "Can you star composiohq/composio repository on github. Say Action executed successfully once done",
)
print(response.text)
