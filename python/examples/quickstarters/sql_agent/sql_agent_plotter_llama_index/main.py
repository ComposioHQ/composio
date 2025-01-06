"""
SQL Agent plotter example using LlamaIndex framework to execute SQL queries and create visualizations.
This example demonstrates the integration of SQL tools with LlamaIndex's function calling agent worker.
"""

import dotenv
from composio_llamaindex import App, ComposioToolSet
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI


dotenv.load_dotenv()
toolset = ComposioToolSet()
sql_tool = toolset.get_tools(apps=[App.SQLTOOL])
code_interpretor_tool = toolset.get_tools(apps=[App.CODEINTERPRETER])
tools = toolset.get_tools(apps=[App.SQLTOOL, App.CODEINTERPRETER])

llm = OpenAI(model="gpt-4o")

prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            "You are now a integration agent, and what  ever you are requested, you will try to execute utilizing your toools."
        ),
    )
]

agent = FunctionCallingAgentWorker(
    tools=tools,
    llm=llm,
    prefix_messages=prefix_messages,
    max_function_calls=10,
    allow_parallel_tool_calls=False,
    verbose=True,
).as_agent()

HUMAN_DESCRIPTION = "The database to use is company.db"
HUMAN_INPUT = "Query the table MOCK_DATA for all rows and plot a graph between first names and salary by using code interpreter"
response = agent.chat(
    "Database description =" + HUMAN_DESCRIPTION + "Task to perform:" + HUMAN_INPUT
)
print("Response:", response)
