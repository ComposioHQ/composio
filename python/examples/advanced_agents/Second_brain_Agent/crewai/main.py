from dotenv import load_dotenv
from pathlib import Path
import os

from composio_crewai import ComposioToolSet, App, Action
from crewai import Agent, Task, Crew, Process
from langchain_openai import ChatOpenAI
#from langchain_groq import ChatGroq
#from langchain_cerebras import ChatCerebras

load_dotenv()
llm = ChatOpenAI(model='gpt-4o')
#llm = ChatGroq(model="llama3-groq-70b-8192-tool-use-preview")

composio_toolset = ComposioToolSet()
tools = composio_toolset.get_tools(apps = [App.EMBED_TOOL, App.RAGTOOL, App.WEBTOOL, App.SERPAPI, App.FILETOOL])

second_brain_agent = Agent(
    role="Second Brain Agent",
    goal="You are supposed to act as the second brain for the user.",
    backstory= f"""
            You are an AI Assistant who's function it is to act like a second brain.
            You're a memory layer that stores all the information a user wants using RAG and embed tool.
            For Images use the embedtool. If it's a url make sure you browse the web and scrape the text
            when adding the information to the VectorStore. The path for both of them will be current directory.
   
             """,
    tools=tools,
)

vector_store_path = "./"
while True:
    x = input("If you want to add something to the vector store, type 'add' and if you want to query, type 'query':")
    if x == 'add':
        a = input('Enter the url or image path to add in the vector store:')
        add_task = Task(
        description=f"""
        This is the item you've to add to the vector store: {a}.
        If its an image use Embed tool and if its a url scrape the text content and add it in RAG vector store
       
        The vector store/ Folder path should exist in {vector_store_path}.
        If its an image, the vector name should be Images
    
        """,
            expected_output="task was completed.",
            agent=second_brain_agent,
            tools=tools,
            verbose=True
        )
        crew = Crew(
            agents=[second_brain_agent],
            tasks=[add_task]
        )
        response = crew.kickoff()
        print(response)
    elif x == 'query':
        a = input("What is your query?")
        task = f"""
        Vector store exists in {vector_store_path}
        Query is {a}. Query either the rag tool for textual content and embed tool for image related content.
        When the query is vague prioritise RAG tool.
        """
        query_task = Task(
            description=task,
            expected_output="task was completed.",
            agent=second_brain_agent,
            tools=tools,
            verbose=True
        )
        crew = Crew(
            agents=[second_brain_agent],
            tasks=[query_task]
        )
        response = crew.kickoff()
        print(response)
    else:
        a = input("response fuzzy ending.")
        exit()




