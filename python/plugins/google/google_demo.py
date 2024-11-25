"""
Google AI Python Gemini demo.
"""

import dotenv
from composio_google import App, ComposioToolset
from vertexai.generative_models import GenerativeModel


# Load environment variables from .env
dotenv.load_dotenv()

# Initialize tools
composio_toolset = ComposioToolset()

# Get GitHub tools that are pre-configured
tool = composio_toolset.get_tool(apps=[App.GITHUB])

# Initialize the Gemini model
model = GenerativeModel("gemini-1.5-pro", tools=[tool])

# Start a chat session
chat = model.start_chat()


def main():
    # Define task
    task = "Star a repo composiohq/composio on GitHub"

    # Send a message to the model
    response = chat.send_message(task)

    print("Model response:")
    print(response)

    result = composio_toolset.handle_response(response)
    print("Function call result:")
    print(result)


if __name__ == "__main__":
    main()
