# Initialise imports
# Import from composio_langchain
from composio_langchain import Action, App, ComposioToolSet
from composio import action
from langchain import hub
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_openai import ChatOpenAI

@action(toolname="math", requires=["smtplib"])
def multiply(a: int, b: int, c: int):
    """
    Multiply three numbers
    a: int
    b: int
    c: int
    """
    print("Multiplying the numbers: ", a, b, c)
    return {"execution_details": {"executed": True, "result": a * b * c}}


llm = ChatOpenAI(model="gpt-4-turbo")

prompt = hub.pull("hwchase17/openai-functions-agent")

# Get All the tools
tools = ComposioToolSet().get_actions(actions=[multiply])
print(tools)


task = "Calculate the forumula 445*669*8886"

agent = create_openai_functions_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# Execute using agent_executor
agent_executor.invoke({"input": task})
