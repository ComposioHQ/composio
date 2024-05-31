# Initialise imports
from langchain import hub
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_openai import ChatOpenAI

# Import from composio_langchain
from composio_langchain import Action, App, ComposioToolSet


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
