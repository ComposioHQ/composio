from composio_gemini import Action, ComposioToolSet, App
from google import genai # type: ignore
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

# Create composio client
toolset = ComposioToolSet()

# Create google client
client = genai.Client()

# Create genai client config
config = types.GenerateContentConfig(
    temperature=0.2,
    system_instruction="""
    You are a game developer that can build and iterate very quickly.
    You don't ask questions, you just write the code and execute it well.
    """,
)
# Use the chat interface.
chat = client.chats.create(model="gemini-2.5-pro-exp-03-25", config=config)
response = chat.send_message(
"""
Create a Pygame based Galaga with a retro-neon aesthetic.
Don't describe the features.
"""
)

print(response.text)

config = types.GenerateContentConfig(
    system_instruction="""
    You are a game intern, you're given the instructions from a game dev, get the code from the instructions, you just have to implement it in a file and run it.
    Use the Shell to execute the code.
    """,
    tools=toolset.get_tools(  # type: ignore
        actions=[
            Action.FILETOOL_CREATE_FILE,
            Action.FILETOOL_EDIT_FILE, 
            Action.SHELLTOOL_CREATE_SHELL,
            Action.SHELLTOOL_EXEC_COMMAND
        ]
    ),
)

chat = client.chats.create(model="gemini-2.0-flash-lite", config=config)
response = chat.send_message(
    f"Here's the code:{response.text}, save it in a relevant file and execute it",
)
print(response.text)
