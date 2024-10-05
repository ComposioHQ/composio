from composio_crewai import ComposioToolSet, App, Action
from crewai import Crew, Agent, Task, Process
from langchain_openai import ChatOpenAI
from langchain_groq import ChatGroq
from dotenv import load_dotenv
from pathlib import Path
import os
load_dotenv()
#import agentops
#AGENTOPS_API_KEY = os.environ["AGENTOPS_API_KEY"]
#agentops.init(AGENTOPS_API_KEY)

llm = ChatOpenAI(model='gpt-4o')
#llm = ChatGroq(model="llama3-groq-70b-8192-tool-use-preview")

composio_toolset = ComposioToolSet(output_dir=Path("./"))
tools = composio_toolset.get_tools(apps=[
    App.EMBED_TOOL, 
    App.RAGTOOL, 
    App.WEBTOOL, 
    App.SERPAPI, 
    App.FILETOOL
])

ppt_agent = Agent(
    role="Second Brain Agent",
    goal="Act like a second Brain for the user",
    backstory=f"""
            You are an AI Assistant who's function it is to act like a second brain.
            You're a memory layer that stores all the information a user wants using RAG and embed tool.
            For Images use the embedtool. If it's a url make sure you browse the web and scrape the text
            when adding the information to the VectorStore. The path for both of them will be current directory.
    """,
    tools=tools,
)

vector_store_path = Path("python/examples/advanced_agents/Second_brain_Agent/crewai")

while True:
    x = input("If you want to add something to the vector store, type 'add' and if you want to query, type 'query':")
    if x == 'add':
        a = input('Enter the url or image path to add in the vector store:')

        agent_task = Task(
            description=f"""
            This is the item you've to add to the vector store: {a}.
            If its an image use Embed tool and if its a url Web scrape the TEXT CONTENT and NOT The HTML elements and add it in RAG vector store
        
            The vector store/ Folder path should exist in {vector_store_path}.
            If its an image, the vector name should be Images
        
            """,
            expected_output="Data was added successfully",
            tools=tools,
            agent=ppt_agent,
            verbose=True,
        )
        crew = Crew(
            agents=[ppt_agent],
            tasks=[agent_task],
            process=Process.sequential,
        )

        response= crew.kickoff()
        print(response)
    elif x == 'query':
        
        a = input("What is your query?")
        task = f"""
        Vector store exists in {vector_store_path}
        Query is {a}. Query either the rag tool for textual content and embed tool for image related content
        """

        agent_task = Task(
            description=task,
            expected_output="Query Answered Accurately",
            tools=tools,
            agent=ppt_agent,
            verbose=True,
        )
        crew = Crew(
            agents=[ppt_agent],
            tasks=[agent_task],
            process=Process.sequential,
        )

        response= crew.kickoff()
        print(response)
    else:
        a = input("response fuzzy ending.")
        exit()



