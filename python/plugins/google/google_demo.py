"""
Google AI Python Gemini demo.
"""

import os
import dotenv
from vertexai.generative_models import GenerativeModel, ChatSession
from composio_google import App, ComposioToolSet

# Load environment variables from .env
dotenv.load_dotenv()

# Initialize tools
composio_toolset = ComposioToolSet()

# Get GitHub tools that are pre-configured
tools = composio_toolset.get_tools(apps=[App.GITHUB])

# Create a Tool object from the FunctionDeclarations
tool = composio_toolset.create_tool(tools)

# Initialize the Gemini model
model = GenerativeModel("gemini-pro", tools=[tool])

# Start a chat session
chat = model.start_chat()

def main():
    # Define task
    task = "Star a repo composiohq/composio on GitHub"

    # Send a message to the model
    response = chat.send_message(task)

    print("Model response:")
    print(response.text)

    # Handle function calls if any
    for candidate in response.candidates:
        for part in candidate.content.parts:
            if hasattr(part, 'function_call'):
                function_call = part.function_call
                print("\nFunction call detected:")
                print(f"Function name: {function_call.name}")
                print(f"Arguments: {function_call.args}")
                
                result = composio_toolset.execute_function_call(function_call)
                print("\nFunction call result:")
                print(result)

if __name__ == "__main__":
    main()