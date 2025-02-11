from composio_llamaindex import ComposioToolSet, App, Action
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI
from dotenv import load_dotenv

load_dotenv()
toolset = ComposioToolSet(api_key="")
tools = toolset.get_tools(apps=[App.PEOPLEDATALABS, App.GOOGLESHEETS])

llm = OpenAI(model="gpt-4o")

spreadsheetid = '14T4e0j1XsWjriQYeFMgkM2ihyvLAplPqB9q8hytytcw'
# Set up prefix messages for the agent
prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            f"""
            You are a lead research agent. Based on user input, find 10 relevant leads using people data labs.
            After finding the leads, create a Google Sheet with the details for the lead description, and spreadsheet ID: ${spreadsheetid}.
            Print the list of people and their details and the link to the google sheet."""
        ),
    )
]

agent = FunctionCallingAgentWorker(
    tools=tools, # type: ignore
    llm=llm,
    prefix_messages=prefix_messages,
    max_function_calls=10,
    allow_parallel_tool_calls=False,
    verbose=True,
).as_agent()

lead_description = 'Senior frontend developers in San Francisco'
user_input = f"Create a lead list based on the description: {lead_description}"
response = agent.chat(user_input)
