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
# Define the images path and query string
images_path = "/path/to/the/images/folder"
search_prompt = "image_description"
top_no_of_images = 1 #returns n closest images to the search 


#Create a vector store prompt templat e
create_task_description = "Create a vector store of the images in the "+images_path

#Query the vector store prompt template
query_task_description = "Only Query the vector store for the top"+str(top_no_of_images)+",image of:"+search_prompt+"at the indexed directory:"+images_path


# Execute the task using the agent
response = agent.chat(create_task_description)

# Print the response
print("Response:", response)
