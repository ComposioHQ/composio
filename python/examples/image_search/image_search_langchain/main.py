# Import necessary libraries
import os  # For accessing environment variables

import dotenv  # For loading environment variables from a .env file

# Import modules from Composio and LangChain
from composio import ComposioToolSet, App,Action 
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
llm = ChatOpenAI(model="gpt-4o")

# Pull a prompt from LangChain hub to create an OpenAI functions agent
prompt = hub.pull("hwchase17/openai-functions-agent")

# Initialize a ComposioToolSet with the API key from environment variables
composio_toolset = ComposioToolSet(api_key=os.environ["COMPOSIO_API_KEY"])
# Retrieve tools from Composio, specifically the EMBEDTOOL apppip
tools = composio_toolset.get_tools(apps=[App.EMBEDTOOL])


# Define the images path and query string
images_path = "/path/to/the/images/folder"
search_prompt = "image_description"
top_no_of_images = 1 #returns n closest images to the search 


#Create a vector store prompt template
create_task_description = "Create a vector store of the images in the "+images_path

#Query the vector store prompt template
query_task_description = "Only Query the vector store for the top"+str(top_no_of_images)+",image of:"+search_prompt+"at the indexed directory:"+images_path


# Create an OpenAI functions agent with the given LLM, tools, and prompt
query_agent = create_openai_functions_agent(llm, tools, prompt)

# Initialize an AgentExecutor with the agent and tools
agent_executor = AgentExecutor(agent=query_agent, tools=tools, verbose=True) # type: ignore

# Execute the query task and get the result
res = agent_executor.invoke({"input": create_task})

# Print the result
print(res)
