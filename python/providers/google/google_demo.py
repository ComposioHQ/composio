"""
Google AI Python Gemini demo.
"""

import dotenv
from composio_google import GoogleProvider
from vertexai.generative_models import GenerativeModel

from composio import Composio

# Load environment variables from .env
dotenv.load_dotenv()

# Initialize tools
composio = Composio(provider=GoogleProvider())

# Get GitHub tools that are pre-configured
tool = composio.tools.get(user_id="default", toolkits=["GITHUB"])

# Initialize the Gemini model
model = GenerativeModel("gemini-2.5-pro", tools=[tool])

# Start a chat session
chat = model.start_chat()


def main():
    # Define task
    task = "Star a repo composiohq/composio on GitHub"

    # Send a message to the model
    response = chat.send_message(task)

    print("Model response:")
    print(response)

    result = composio.provider.handle_response(user_id="default", response=response)
    print("Function call result:")
    print(result)


if __name__ == "__main__":
    main()
