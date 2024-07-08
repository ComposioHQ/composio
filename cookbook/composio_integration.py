import os
import dotenv
from datetime import datetime
from crewai import Agent, Task
from langchain_openai import ChatOpenAI
from composio_langchain import ComposioToolSet, App, Action

# Load environment variables from .env file
dotenv.load_dotenv()

# Initialize CrewAI Agent
llm = ChatOpenAI(openai_api_key=os.environ["OPENAI_API_KEY"], model_name="gpt-3.5-turbo")

composio_toolset = ComposioToolSet()
tools = composio_toolset.get_tools(apps=[App.GOOGLECALENDAR])

date = datetime.today().strftime('%Y-%m-%d')
timezone = datetime.now().astimezone().tzinfo

# Function to run the CrewAI agent
def run_crew(task_description):
    gcal_agent = Agent(
        role='Google Calendar Agent',
        goal="You take action on Google Calendar using Google Calendar APIs",
        backstory="You are an AI agent responsible for taking actions on Google Calendar on users' behalf. You need to take action on Calendar using Google Calendar APIs. Use correct tools to run APIs from the given tool-set.",
        verbose=True,
        tools=tools,
        llm=llm
    )
    task = Task(
        description=f"{task_description}. Today's date is {date} (it's in YYYY-MM-DD format) and make the timezone be {timezone}.",
        agent=gcal_agent,
        expected_output="if free slot is found"
    )
    task.execute()
    return "Crew run initiated"

# Function to create an event in Google Calendar
async def create_google_calendar_event(event_data):
    try:
        task_description = f"Create an event with details: {event_data}"
        run_crew(task_description)
        return {'htmlLink': 'https://calendar.google.com/calendar/r/eventedit'}
    except Exception as e:
        print(f"Error creating event: {e}")
        return None

# Function to update an event in Google Calendar
async def update_google_calendar_event(event_id, event_data):
    try:
        task_description = f"Update the event with ID {event_id} with details: {event_data}"
        run_crew(task_description)
        return {'htmlLink': 'https://calendar.google.com/calendar/r/eventedit'}
    except Exception as e:
        print(f"Error updating event: {e}")
        return None

# Function to delete an event from Google Calendar
async def delete_google_calendar_event(event_id):
    try:
        task_description = f"Delete the event with ID {event_id}"
        run_crew(task_description)
        return True
    except Exception as e:
        print(f"Error deleting event: {e}")
        return False
