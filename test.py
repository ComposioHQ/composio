from langchain.agents import create_openai_functions_agent
from langchain.agents import AgentExecutor
from langchain import hub
from composio_langchain import ComposioToolset
from langchain_openai import ChatOpenAI
from composio.sdk import Action, App

llm = ChatOpenAI(openai_api_key="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", model="gpt-4-turbo-preview")

prompt = hub.pull("hwchase17/openai-functions-agent")

tools = ComposioToolset([App.GITHUB])

agent = create_openai_functions_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)
agent_executor.invoke({"input": "Create a github issue on the utkarsh-dixit/speedy repository with the title 'Test Issue' and the body 'This is a test issue created by the openai functions agent.'"})