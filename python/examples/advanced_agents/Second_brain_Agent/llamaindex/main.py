from composio_llamaindex import ComposioToolSet, App, Action
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI
from llama_index.llms.groq import Groq
from dotenv import load_dotenv
from pathlib import Path
import os

load_dotenv()
#llm = OpenAI(model='gpt-4o')
llm = Groq(model="llama3-groq-70b-8192-tool-use-preview")

composio_toolset = ComposioToolSet()
tools = composio_toolset.get_tools(apps = [App.EMBED_TOOL, App.RAGTOOL, App.WEBTOOL, App.SERPAPI, App.FILETOOL])

prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            f"""
            You are an AI Assistant who's function it is to act like a second brain.
            You're a memory layer that stores all the information a user wants using RAG and embed tool.
            For Images use the embedtool. If it's a url make sure you browse the web and scrape the text
            when adding the information to the VectorStore. The path for both of them will be current directory.
   
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

vector_store_path = "./"
while True:
    x = input("If you want to add something to the vector store, type 'add' and if you want to query, type 'query':")
    if x == 'add':
        a = input('Enter the url or image path to add in the vector store:')
        task = f"""
        This is the item you've to add to the vector store: {a}.
        If its an image use Embed tool and if its a url scrape the text content and add it in RAG vector store
       
        The vector store/ Folder path should exist in {vector_store_path}.
        If its an image, the vector name should be Images
    
        """
        response = agent.chat(task)
        print(response)
    elif x == 'query':
        a = input("What is your query?")
        task = f"""
        Vector store exists in {vector_store_path}
        Query is {a}. Query either the rag tool for textual content and embed tool for image related content
        """
        response = agent.chat(task)
        print(response)
    else:
        a = input("response fuzzy ending.")
        exit()




