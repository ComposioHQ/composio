import os
import dotenv
from composio_langchain import ComposioToolSet, App
from composio.local_tools import embedtool
from langchain import hub
from langchain.agents import AgentExecutor, create_openai_functions_agent

from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o")
prompt = hub.pull("hwchase17/openai-functions-agent")

composio_toolset = ComposioToolSet(api_key=os.environ["COMPOSIO_API_KEY"])
tools = composio_toolset.get_tools(apps = [App.EMBEDTOOL])
query_task = "Create a vector store animals the path for folder is ./images/ and query the store for a horse"
query_agent = create_openai_functions_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=query_agent, tools=tools, verbose=True)
res = agent_executor.invoke({"input": query_task})
print(res)