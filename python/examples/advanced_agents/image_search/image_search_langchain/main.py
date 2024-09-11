# Import necessary libraries
import os  # For accessing environment variables

import dotenv  # For loading environment variables from a .env file

# Import modules from Composio and LangChain
from composio_langchain import ComposioToolSet, App, Action
from composio.tools.local import embedtool  # For embedding tool
from langchain import hub  # For accessing LangChain hub
from langchain.agents import (  # For creating agents
    AgentExecutor,
    create_openai_functions_agent,
)

# Import ChatOpenAI from langchain_openai
from langchain_openai import ChatOpenAI


# Load environment variables from a .env file (if applicable)
dotenv.load_dotenv()  # Uncomment if you are using a .env file


# Initialize a ChatOpenAI instance with GPT-4o model
llm = ChatOpenAI(model="gpt-4o")

# Pull a prompt from LangChain hub to create an OpenAI functions agent
prompt = hub.pull("hwchase17/openai-functions-agent")

# Initialize a ComposioToolSet with the API key from environment variables
composio_toolset = ComposioToolSet()
# Retrieve tools from Composio, specifically the EMBEDTOOL apppip
tools = composio_toolset.get_tools(apps=[App.EMBEDTOOL])


# Define the images path and query string
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
    Search the vector store for {search_prompt}
    The images path and indexed directory is {images_path}
    return the top {top_no_of_images} results.

"""
# Create an OpenAI functions agent with the given LLM, tools, and prompt
query_agent = create_openai_functions_agent(llm, tools, prompt)

# Initialize an AgentExecutor with the agent and tools
agent_executor = AgentExecutor(agent=query_agent, tools=tools, verbose=True)  # type: ignore

# Execute the query task and get the result
res = agent_executor.invoke({"input": task_description})

# Print the result
print(res)
