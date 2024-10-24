import os
import dotenv
from composio_llamaindex import App, ComposioToolSet
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.groq import Groq
from pathlib import Path

dotenv.load_dotenv()
composio_toolset = ComposioToolSet(output_dir=Path.home() / "composio_output")
tools = composio_toolset.get_tools(apps=[App.GOOGLESHEETS, App.CODEINTERPRETER])


llm = Groq(model="llama3-70b-8192", api_key=os.environ['GROQ_API_KEY'])

prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            "You are an AI agent specialized in analyzing Google Sheets data."
            "Your job is to analyse the data in the google sheets. Draw key and useful insights from it."
            "You can also run Python code, create charts and plots. Remember to get the file/chart if you are creating one in the code."
            "Represent the data in these sheets in plots and graphs that are easily readable."
            "NOTE: Mostly the user passes small sheets, so try to read the whole sheet at once and not via ranges."
        ),
    )
]

while True:
    main_task = input("Enter the task you want to perform (or type 'exit' to quit): ")
    if main_task.lower() == 'exit':
        break

    agent = FunctionCallingAgentWorker(
    tools=tools,
    llm=llm,
    prefix_messages=prefix_messages,
    max_function_calls=10,
    allow_parallel_tool_calls=False,
    verbose=True,
    ).as_agent()
    
    response = agent.chat(f"Analyze the sheet and plot the graphs based on it. The task is: {main_task}")
    print("Response:", response)