from composio_llamaindex import ComposioToolSet, App, Action
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI
from llama_index.llms.cerebras import Cerebras
from llama_index.llms.groq import Groq
from dotenv import load_dotenv
from pathlib import Path
import os

load_dotenv()
llm = OpenAI(model='gpt-4o')
#llm = Groq(model="llama3-groq-70b-8192-tool-use-preview")
#llm = Cerebras(model="llama3.1-70b")
composio_toolset = ComposioToolSet()
tools = composio_toolset.get_tools(apps = [App.TAVILY, App.GOOGLEDOCS])

prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            f"""
        You are a market research agent that finds niche ideas that can be built and marketed. 
        Your users are primarily indie hackers who want to build something new and are looking for ideas. The input will 
        be a domain or a category and your job is to research extensively and find ideas that can be marketed.
        Write this content in a google doc, create a google doc before writing in it.
        I want you to show the following content:
        - Data Collection and Aggregation - Show data supporting a trend
        - Sentiment Analysis - Show customer sentiment on the topic
        - Trend Forecasting
        - Competitor Analysis
        - Competitor Benchmarking
        - Idea Validation
             """
        )
    )
]


agent = FunctionCallingAgentWorker(
    tools=tools,  # Tools available for the agent to use
    llm=llm,  # Language model for processing requests
    prefix_messages=prefix_messages,  # Initial system messages for context
    max_function_calls=10,  # Maximum number of function calls allowed
    allow_parallel_tool_calls=False,  # Disallow parallel tool calls
    verbose=True,  # Enable verbose output
).as_agent()


agent = FunctionCallingAgentWorker(
    tools=tools,  # Tools available for the agent to use
    llm=llm,  # Language model for processing requests
    prefix_messages=prefix_messages,  # Initial system messages for context
    max_function_calls=10,  # Maximum number of function calls allowed
    allow_parallel_tool_calls=False,  # Disallow parallel tool calls
    verbose=True,  # Enable verbose output
).as_agent()
a = input('Enter the domain or category you want to research about:')
task = f"""
The domain or category you want to research about is {a}. Use all the tools available to you to find and gather more insights on customers and market.
"""
response = agent.chat(task)
print(response)
