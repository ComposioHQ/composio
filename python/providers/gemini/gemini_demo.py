q"""
Gemini Provider Demo - Clean API with Callable Tools
Shows how to use the new CallableGeminiTool wrapper for clean function calling.
"""

from composio import Composio
from composio_gemini import GeminiProvider
from google import genai
from google.genai import types

# Create composio client with Gemini provider
composio = Composio(provider=GeminiProvider())

# Create google client
client = genai.Client()

# Get tools - they're now directly callable!
tools = composio.tools.get(
    user_id="default",
    tools=[
        "GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER",
    ],
)

print(f"✅ Loaded tool: {tools[0].__name__}")
print(f"   Tool is callable: {callable(tools[0])}")  # True! 🎉

# Create genai client config
# Note: For predictable behavior, we recommend manual function execution
config = types.GenerateContentConfig(
    tools=tools,
    automatic_function_calling=types.AutomaticFunctionCallingConfig(
        disable=True  # Manual execution for control
    )
)

# Use the chat interface
chat = client.chats.create(model="gemini-2.0-flash", config=config)
response = chat.send_message("Can you star composiohq/composio repository on github")

# Handle function calls with clean syntax!
if response.function_calls:
    fc = response.function_calls[0]
    print(f"\n🎯 Executing: {fc.name}")
    
    # Clean, Pythonic function calling - no more _execute()!
    result = tools[0](**fc.args)  # Beautiful! 🎉
    
    if result.get('successful'):
        print(f"✅ Successfully starred the repository!")
        print(f"   Response: {result}")
    else:
        print(f"❌ Error: {result.get('error')}")
    
    # Send the result back to the model
    chat.send_message(f"Done! Result: {result}")
else:
    # If automatic execution happened (less common)
    if response.text:
        print(response.text)
    else:
        print("No function calls made")

print("\n💡 Tip: While automatic execution is supported, models often prefer")
print("   returning function calls for manual execution. This gives you")
print("   more control over when and how functions are executed.")