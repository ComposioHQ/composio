import os
import dotenv
from composio_llamaindex import App, ComposioToolSet
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI

from composio.tools.local import filetool, sqltool

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

human_description = "The database to use is company.db"
human_input = "Query the table MOCK_DATA for all rows and plot a graph between first names and salary by using code interpretor"
response = agent.chat(
    "Database description =" + human_description + "Task to perform:" + human_input
)
print("Response:", response)
