# Import base packages
import os
from datetime import datetime
from typing import List, Tuple

from composio_crewai import App, ComposioToolSet
from crewai import Agent, Task, Crew
from crewai.agent import Agent as CrewAgent
from crewai.task import Task as CrewTask
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI


# Load environment variables and verify they exist
load_dotenv()

if not os.getenv("OPENAI_API_KEY"):
    raise ValueError("OPENAI_API_KEY environment variable is not set")
if not os.getenv("COMPOSIO_API_KEY"):
    raise ValueError("COMPOSIO_API_KEY environment variable is not set")

# Initialize the language model
llm = ChatOpenAI(model="gpt-4")

# Define tools for the agents
# We are using Google calendar tool from composio to connect to our calendar account.
try:
    composio_toolset = ComposioToolSet()
    tools = composio_toolset.get_tools(apps=[App.GOOGLECALENDAR])
except Exception as e:
    print(f"Error initializing Composio Toolset: {e}")
    raise

# Retrieve the current date and time
date = datetime.today().strftime("%Y-%m-%d")
timezone = datetime.now().astimezone().tzinfo

# Setup Todo list with time slots and activities
todo: str = """
    1PM - 3PM -> Code,
    5PM - 7PM -> Meeting,
    9AM - 12AM -> Learn something,
    8PM - 10PM -> Game
"""


# Create and Execute Agent.
def run_crew() -> Tuple[str, int]:
    """
    Creates and executes a Calendar Agent to schedule events from the todo list.
    
    The function initializes a CrewAI agent that uses Google Calendar APIs to schedule
    events based on the provided todo list. It handles the creation and scheduling of
    events for the current day in the specified timezone.
    
    Returns:
        Tuple[str, int]: A tuple containing the execution status message and HTTP status code
        
    Raises:
        ValueError: If required environment variables are not set
        Exception: If there's an error initializing the Composio Toolset
    """
    calendar_agent: CrewAgent = Agent(
        role="Google Calendar Agent",
        goal="""You take action on Google Calendar using Google Calendar APIs""",
        backstory="""You are an AI agent responsible for taking actions on Google Calendar on users' behalf. 
        You need to take action on Calendar using Google Calendar APIs. Use correct tools to run APIs from the given tool-set.""",
        verbose=True,
        tools=tools,
        llm=llm,
        cache=False,
    )
    task: CrewTask = Task(
        description=f"Book slots according to {todo}. Label them with the work provided to be done in that time period. Schedule it for today. Today's date is {date} (it's in YYYY-MM-DD format) and make the timezone be {timezone}.",
        agent=calendar_agent,
        expected_output="if free slot is found",
    )
    crew: Crew = Crew(agents=[calendar_agent], tasks=[task])
    result: str = crew.kickoff()
    print(result)
    return "Crew run initiated", 200


run_crew()
