# Import base packages
import os
from datetime import datetime

from composio_crewai import App, ComposioToolSet
from crewai import Agent, Task, Crew
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI


# Load environment variables
load_dotenv()

# Initialize the language model
llm = ChatOpenAI(model="gpt-4o")

# Define tools for the agents
# We are using Google calendar tool from composio to connect to our calendar account.
composio_toolset = ComposioToolSet()
tools = composio_toolset.get_tools(apps=[App.GOOGLECALENDAR])

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


# Create and Execute Agent.
def run_crew():
    calendar_agent = Agent(
        role="Google Calendar Agent",
        goal="""You take action on Google Calendar using Google Calendar APIs""",
        backstory="""You are an AI agent responsible for taking actions on Google Calendar on users' behalf. 
        You need to take action on Calendar using Google Calendar APIs. Use correct tools to run APIs from the given tool-set.""",
        verbose=True,
        tools=tools,
        llm=llm,
        cache=False,
    )
    task = Task(
        description=f"Book slots according to {todo}. Label them with the work provided to be done in that time period. Schedule it for today. Today's date is {date} (it's in YYYY-MM-DD format) and make the timezone be {timezone}.",
        agent=calendar_agent,
        expected_output="if free slot is found",
    )
    crew = Crew(agents=[calendar_agent], tasks=[task])
    result = crew.kickoff()
    print(result)
    return "Crew run initiated", 200


run_crew()
