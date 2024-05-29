"""
Langchain demo.
"""

import os

import dotenv
from composio_langchain import App, ComposioToolSet
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_openai import ChatOpenAI

from langchain import hub  # type: ignore


# Load environment variables from .env
dotenv.load_dotenv()

# Pull relevant agent model.
prompt = hub.pull("hwchase17/openai-functions-agent")

# Initialize tools.
openai_client = ChatOpenAI(api_key=os.environ["OPENAI_API_KEY"])
composio_toolset = ComposioToolSet()

# Get All the tools
tools = composio_toolset.get_tools(apps=[App.MATHEMATICAL])

# Define task
task = "Star a repo SamparkAI/docs on GitHub"

# Define agent
agent = create_openai_functions_agent(openai_client, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# Execute using agent_executor
agent_executor.invoke({"input": task})
