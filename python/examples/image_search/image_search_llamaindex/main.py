# Import necessary libraries
import os  # For accessing environment variables

import dotenv  # For loading environment variables from a .env file

# Import modules from Composio and LlamaIndex
from composio_llamaindex import App, ComposioToolSet
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI

# Import embedtool from composio.tools.local.tools
from composio.tools.local.tools import embedtool


# Load environment variables from a .env file
dotenv.load_dotenv()

# Initialize a ComposioToolSet with the API key from environment variables
toolset = ComposioToolSet(api_key=os.environ["COMPOSIO_API_KEY"])

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

# Define the images path and collection name
collection_name = "animals"
collection_path = "/path/to/the/chromadb/folder/in/your/working/directory"
images_path = "/path/to/the/images"
prompt = "horse"

# Execute the task using the agent
response = agent.chat(
    "Create a vectorstore of name:"
    + collection_name
    + " using images in path:"
    + images_path
    + " and query the string:"
    + query_string
)

# Print the response
print("Response:", response)
