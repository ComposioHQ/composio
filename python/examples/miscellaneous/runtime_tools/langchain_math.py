# Initialise imports
# Import from composio_langchain
from composio_langchain import Action, App, ComposioToolSet
from composio import action
from langchain import hub
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_openai import ChatOpenAI


@action(toolname="math", requires=["smtplib"])
def multiply(a: int, b: int, c: int) -> int:
    """
    Multiply three numbers

    :param a: Number a
    :param b: Number b
    :param c: Number c
    :return result: Result of the multiplication
    """
    return a * b * c


import os

llm = ChatOpenAI(
    model="gpt-4-turbo",
    base_url="https://oai.helicone.ai/v1",
    default_headers={
        "Helicone-Auth": f"Bearer {os.environ['HELICONE_API_KEY']}",
        "Helicone-Cache-Enabled": "true",
    },
)

prompt = hub.pull("hwchase17/openai-functions-agent")

# Get All the tools
tools = ComposioToolSet().get_tools(actions=[multiply])
task = "Calculate the formula 445*669*8886"

agent = create_openai_functions_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# Execute using agent_executor
agent_executor.invoke({"input": task})
