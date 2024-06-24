# Import necessary libraries
import os  # For accessing environment variables
import dotenv  # For loading environment variables from a .env file

# Import modules from Composio and LangChain
from composio_langchain import ComposioToolSet, App
from composio.local_tools import embedtool  # For embedding tool
from langchain import hub  # For accessing LangChain hub
from langchain.agents import AgentExecutor, create_openai_functions_agent  # For creating agents

# Import ChatOpenAI from langchain_openai
from langchain_openai import ChatOpenAI

# Load environment variables from a .env file (if applicable)
# dotenv.load_dotenv()  # Uncomment if you are using a .env file

# Initialize a ChatOpenAI instance with GPT-4o model
llm = ChatOpenAI(model="gpt-4o")

# Pull a prompt from LangChain hub to create an OpenAI functions agent
prompt = hub.pull("hwchase17/openai-functions-agent")

# Initialize a ComposioToolSet with the API key from environment variables
composio_toolset = ComposioToolSet(api_key=os.environ["COMPOSIO_API_KEY"])

# Retrieve tools from Composio, specifically the EMBEDTOOL app
tools = composio_toolset.get_tools(apps=[App.EMBEDTOOL])

# Define the query task
query_task = "Create a vector store animals the path for folder is ./images/ and query the store for a horse"

# Create an OpenAI functions agent with the given LLM, tools, and prompt
query_agent = create_openai_functions_agent(llm, tools, prompt)

# Initialize an AgentExecutor with the agent and tools
agent_executor = AgentExecutor(agent=query_agent, tools=tools, verbose=True) # type: ignore

# Execute the query task and get the result
res = agent_executor.invoke({"input": query_task})

# Print the result
print(res)
