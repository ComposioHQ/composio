import os
import dotenv
#from textwrap import dedent
from composio_llamaindex import Action, App, ComposioToolSet
from composio_llamaindex import App, ComposioToolSet, Action
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.groq import Groq
from datetime import datetime
from llama_index.core import Settings

# Load environment variables from .env file
dotenv.load_dotenv()
Settings.llm = Groq(model="llama3-groq-70b-8192-tool-use-preview", api_key=os.environ["GROQ_API_KEY"])
llm = Groq(model="llama-3.2-3b-preview", api_key=os.environ["GROQ_API_KEY"])


# Initialize the ComposioToolSet
toolset = ComposioToolSet()

# Get the RAG tool from the Composio ToolSet
tools = toolset.get_tools(apps=[App.GOOGLECALENDAR])

# Retrieve the current date and time
date = datetime.today().strftime("%Y-%m-%d")
timezone = datetime.now().astimezone().tzinfo

# Setup Todo
todo = """
    1PM - 3PM -> Code,
    5PM - 7PM -> Meeting,
    9AM - 12AM -> Learn something,
    8PM - 10PM -> Game
"""

# Define the RAG Agent
prefix_messages = [
    ChatMessage(
        role="system",
        content=(
        """
        You are an AI agent responsible for taking actions on Google Calendar on users' behalf. 
        You need to take action on Calendar using Google Calendar APIs. Use correct tools to run APIs from the given tool-set.
        """
        ),
    )
]

# Initialize a FunctionCallingAgentWorker with the tools, LLM, and system messages
agent = FunctionCallingAgentWorker(
    tools=tools,  # Tools available for the agent to use
    llm=llm,  # Language model for processing requests
    prefix_messages=prefix_messages,  # Initial system messages for context
    max_function_calls=10,  # Maximum number of function calls allowed
    allow_parallel_tool_calls=False,  # Disallow parallel tool calls
    verbose=True,  # Enable verbose output
).as_agent()

response = agent.chat(
    """
Book slots according to {todo}. 
Properly Label them with the work provided to be done in that time period. 
Schedule it for today. Today's date is {date} (it's in YYYY-MM-DD format) 
and make the timezone be {timezone}.
    """
)