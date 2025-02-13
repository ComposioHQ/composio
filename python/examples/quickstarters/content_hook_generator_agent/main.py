import os
import dotenv
from composio_llamaindex import App, ComposioToolSet
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI
from llama_index.llms.groq import Groq

dotenv.load_dotenv()
composio_toolset = ComposioToolSet()
tools = composio_toolset.get_tools(apps=[App.GOOGLESHEETS])

sheet_id = '1fVAkbBVeocPIPRMgaH-rO2kkswXWLUBVSZ8jf-xputs'
#llm = Groq(model="llama3-70b-8192", api_key=os.environ['GROQ_API_KEY'])
llm = OpenAI(model='gpt-4o')
prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            "You are an Content Hook Generator Agent."
            "First scrape the google spreadsheet info"
            "You have access to a google sheet that is a database of Hook Lines with metrics and categories"
            "The user will describe their content to you and you'll look at this sheet to find the perfect hookline and tailor it to the usecase."
        ),
    )
]

while True:
    main_task = input("Describe your content (or type 'exit' to quit): ")
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
    
    response = agent.chat(f"This is the content: {main_task}, the sheet id is {sheet_id}. Figure out the best hookline by using the tools available to you. Rephrase the content idea to match the spreadsheet content.")
    print("Response:", response)