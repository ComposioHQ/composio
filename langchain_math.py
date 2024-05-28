# Initialise imports
from langchain.agents import create_openai_functions_agent, AgentExecutor
from langchain import hub
from langchain_openai import ChatOpenAI
# Import from composio_langchain
from plugins.langchain.composio_langchain import ComposioToolSet, Action, App


llm = ChatOpenAI(model="gpt-4-turbo")

prompt = hub.pull("hwchase17/openai-functions-agent")

# Get All the tools 
tools = ComposioToolSet().get_tools([App.MATHEMATICAL]) 
print(tools)


task = "Calculate 5*30*330"

agent = create_openai_functions_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# Execute using agent_executor
agent_executor.invoke({"input": task})
