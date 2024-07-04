# Import necessary libraries
import os  # For accessing environment variables

import dotenv  # For loading environment variables from a .env file

# Import modules from Composio and LangChain
from composio_langchain import App, ComposioToolSet
from langchain import hub  # For accessing LangChain hub
from langchain.agents import (  # For creating agents
    AgentExecutor,
    create_openai_functions_agent,
)

# Import ChatOpenAI from langchain_openai
from langchain_openai import ChatOpenAI

from composio.tools.local import embedtool  # For embedding tool


# Load environment variables from a .env file (if applicable)
dotenv.load_dotenv()  # Uncomment if you are using a .env file

# Initialize a ChatOpenAI instance with GPT-4o model
llm = ChatOpenAI(model="gpt-4o", openai_api_key =os.environ["OPENAI_API_KEY"])

# Pull a prompt from LangChain hub to create an OpenAI functions agent
prompt = hub.pull("hwchase17/openai-functions-agent")

# Initialize a ComposioToolSet with the API key from environment variables
composio_toolset = ComposioToolSet(api_key=os.environ["COMPOSIO_API_KEY"])
# Retrieve tools from Composio, specifically the EMBEDTOOL apppip
tools = composio_toolset.get_tools(apps=[App.EMBEDTOOL])

# Define the query task
collection_name = "animals"
collection_path = "/path/to/the/chromadb/folder/in/your/working/directory"
images_path = "/path/to/the/images"
prompt = "horse"
create_task = (
    "Create a vector store of the images in the "+images_path
    "collection name:"+ collection_name
    "folder_path:"+collection_path
)
query_task = (
    "Query the vector store for prompt:"+prompt
    "with store name:"+collection_name
    "collection_path at:"+collection_path
)

# Create an OpenAI functions agent with the given LLM, tools, and prompt
query_agent = create_openai_functions_agent(llm, tools, prompt)

# Initialize an AgentExecutor with the agent and tools
agent_executor = AgentExecutor(agent=query_agent, tools=tools, verbose=True) # type: ignore

# Execute the query task and get the result
res = agent_executor.invoke({"input": query_task})

# Print the result
print(res)
