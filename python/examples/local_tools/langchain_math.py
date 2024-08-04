# Initialise imports
# Import from composio_langchain
from composio_langchain import Action, App, ComposioToolSet
from langchain import hub
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_openai import ChatOpenAI


llm = ChatOpenAI(model="gpt-4-turbo")

prompt = hub.pull("hwchase17/openai-functions-agent")

# Get All the tools
tools = ComposioToolSet(output_in_file=True).get_tools([App.MATHEMATICAL])
print(tools)


task = "Calculate the forumula 4666*598"

agent = create_openai_functions_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# Execute using agent_executor
agent_executor.invoke({"input": task})
