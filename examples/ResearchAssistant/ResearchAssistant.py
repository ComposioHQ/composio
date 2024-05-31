# Import required libraries
from crewai import Agent, Task, Crew, Process
from composio_langchain import ComposioToolSet, Action, App
from langchain_google_genai import ChatGoogleGenerativeAI
import os

# Initialize tools and agents
llm = ChatGoogleGenerativeAI(
    model="gemini-pro", verbose=True, temperature=0.9, google_api_key=os.getenv("GOOGLE_API_KEY")
)

# Composio tool for SerpAPI
composiotoolset = ComposioToolSet()
tools = composiotoolset.get_tools(actions=[Action.SERPAPI_SEARCH])

# Define the Agent
researcher = Agent(
    role='Researcher',
    goal='Search the internet for the information requested',
    backstory="""
    You are a researcher. Using the information in the task, you find out some of the most popular facts about the topic along with some of the trending aspects.
    You provide a lot of information thereby allowing a choice in the content selected for the final blog.
    """,
    verbose=True,
    allow_delegation=False,
    tools=tools,
    llm=llm
)

# Define the Task
task1 = Task(
    description="""Research about open source LLMs vs closed source LLMs. Your final answer MUST be a full analysis report""",
    expected_output='When the research report is ready',
    agent=researcher
)

# Execute the Task
task1.execute()
