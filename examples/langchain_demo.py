from composio_langchain import ComposioToolset
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_openai import ChatOpenAI

from composio.sdk.enums import App
from langchain import hub


llm = ChatOpenAI()

prompt = hub.pull("hwchase17/openai-functions-agent")

tools = ComposioToolset(apps=[App.GITHUB])

agent = create_openai_functions_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)
agent_executor.invoke({"input": "List repos available to me"})
