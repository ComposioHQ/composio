from composio_llamaindex import ComposioToolSet, App, Action
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI
from dotenv import load_dotenv

load_dotenv()
toolset = ComposioToolSet(api_key=os.getenv("COMPOSIO_API_KEY"))
tools = toolset.get_tools(apps=[App.PEOPLEDATALABS, App.GOOGLESHEETS])

llm = OpenAI(model="gpt-4o")

spreadsheetid = '14T4e0j1XsWjriQYeFMgkM2ihyvLAplPqB9q8hytytcw'
# Set up prefix messages for the agent
prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            f"""
            You are a recruiter agent. Based on user input, identify 10 highly qualified candidates using People Data Labs.
            After identifying the candidates, create a Google Sheet with their details for the provided candidate description, and spreadsheet ID: ${spreadsheetid}.
            Print the list of candidates and their details along with the link to the Google Sheet.
            """
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

candidate_description = 'Senior Backend developers in San Francisco with prior experience in Python and Django'
user_input = f"Create a candidate list based on the description: {candidate_description}"
response = agent.chat(user_input)
