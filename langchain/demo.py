import os

import dotenv
from composio_langchain import App, ComposioToolset
from langchain_openai import ChatOpenAI

from langchain import hub
from langchain.agents import AgentExecutor, create_openai_functions_agent

# Loading the variables from .env file
dotenv.load_dotenv()

llm = ChatOpenAI(api_key=os.environ["OPENAI_API_KEY"])

prompt = hub.pull("hwchase17/openai-functions-agent")

# Import from composio_langchain

# Get All the tools
tools = ComposioToolset(apps=[App.GITHUB])


task = "Star a repo SamparkAI/docs on GitHub"

agent = create_openai_functions_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# Execute using agent_executor
agent_executor.invoke({"input": task})
