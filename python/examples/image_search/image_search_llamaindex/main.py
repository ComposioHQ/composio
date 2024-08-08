# Import necessary libraries
import os  # For accessing environment variables

import dotenv  # For loading environment variables from a .env file

# Import modules from Composio and LlamaIndex
from composio_llamaindex import App, ComposioToolSet
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI

# Import embedtool from composio.tools.local
from composio.tools.local import embedtool


# Load environment variables from a .env file
dotenv.load_dotenv()

# Initialize a ComposioToolSet with the API key from environment variables
toolset = ComposioToolSet()

# Retrieve tools from Composio, specifically the EMBEDTOOL app
tools = toolset.get_tools(apps=[App.EMBEDTOOL])

# Initialize an OpenAI instance with the GPT-4o model
llm = OpenAI(model="gpt-4o")

# Define the system message for the agent
prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            "You are now an integration agent, and whatever you are requested, you will try to execute utilizing your tools."
        ),
    )
]

# Initialize a FunctionCallingAgentWorker with the tools, LLM, and system messages
agent = FunctionCallingAgentWorker(
    tools=tools,  # Tools available for the agent to use
    llm=llm,  # Language model for processing requests
    prefix_messages=prefix_messages,  # Initial system messages for context
    max_function_calls=10,  # Maximum number of function calls allowed
    allow_parallel_tool_calls=False,  # Disallow parallel tool calls
    verbose=True,  # Enable verbose output
).as_agent()

images_path = input("Enter the path to the images folder:")
search_prompt = input("Enter the image description for the image you want to search:")
top_no_of_images = int(
    input(
        "What number of images that are closest to the description that should be returned:"
    )
)  # returns n closest images to the search

task_description = f"""
    Check if a Vector Store exists for the image directory
    If it doesn't create a vector store.
    If it already exists, query the vector store
    The images path and indexed directory is {images_path}
    the prompt for the image to search is {search_prompt}
    return the top {top_no_of_images} results.

"""
# Execute the task using the agent
response = agent.chat(task_description)

# Print the response
print("Response:", response)
