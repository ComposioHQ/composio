# Calendar Agent

This project is an example which uses Composio to seamlessly convert your to-do lists into Google Calendar events. It automatically schedules tasks with specified labels and times, ensuring your calendar is always up-to-date and organized.

<div style="border: 1px solid #ddd; border-radius: 8px; padding: 16px; width: fit-content; background-color: #f5f5f5;">
  <img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" alt="GitHub Logo" width="50" style="vertical-align: middle; margin-right: 10px;">
  <strong style="font-size: 1.2em;"><a href="https://github.com/ComposioHQ/composio/tree/master/python/examples/quickstarters/calendar_agent">Calendar Agent GitHub Repository</a></strong>
  <p style="margin-top: 8px; font-size: 1em;">Explore the complete source code for the RAG Agent project. This repository contains all the necessary files and scripts to set up and run the RAG system using CrewAI and Composio.</p>
</div>



+ ## 1. Install the required packages
  Create a .env file and add your OpenAI API Key.
  ### Install the required packages
  ```python
  pip install composio-crewai langchain-openai
  ```


+ ## 2. Import base packages
  Next, we’ll import the essential libraries for our project.
  ### Python - Import statements
  ```python
  import os
  from datetime import datetime

  from composio_crewai import App, ComposioToolSet
  from crewai import Agent, Task, Crew
  from dotenv import load_dotenv
  from langchain_openai import ChatOpenAI
  ```



+ ## 3. Initialise Language Model and Define tools
  We’ll initialize our language model and set up the necessary tools for our agents
  ### Models and Tools
  ```python
  load_dotenv()

  # Initialize the language model
  llm = ChatOpenAI(model="gpt-4o")

  # Define tools for the agents
  # We are using Google calendar tool from composio to connect to our calendar account.
  composio_toolset = ComposioToolSet()
  tools = composio_toolset.get_tools(apps=[App.GOOGLECALENDAR])

  # Retreive the current date and time
  date = datetime.today().strftime("%Y-%m-%d")
  timezone = datetime.now().astimezone().tzinfo        

  ```



+ ## 4. Setup Todo
  Define the todo list that we want to convert into calendar events.
  ### Python - Todo Setup
  ```python 
  # Setup Todo
  todo = """
      1PM - 3PM -> Code,
      5PM - 7PM -> Meeting,
      9AM - 12AM -> Learn something,
      8PM - 10PM -> Game
  """        
  ```



+ ## 5. Create and Execute Agent
  Finally, we’ll define and execute the agent responsible for creating Google Calendar events based on the todo list.
  ### Run agent
  ```python
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
  )
  task = Task(
       description=f"Book slots according to {todo}. Label them with the work provided to be done in that time period. Schedule it for today. Today's date is {date} (it's in YYYY-MM-DD format) and make the timezone be {timezone}.",
      agent=calendar_agent,
      expected_output="if free slot is found",
  )
  crew = Crew(agents=[calendar_agent], tasks=[task])
  result = crew.kickoff()
  print(result) 
  ```




# Complete Code
### Python Final Code
```python

# Import base packages
import os
from datetime import datetime

from composio_crewai import App, ComposioToolSet
from crewai import Agent, Task
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

# Retreive the current date and time
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
    )
    task = Task(
        description=f"Book slots according to {todo}. Label them with the work provided to be done in that time period. Schedule it for today. Today's date is {date} (it's in YYYY-MM-DD format) and make the timezone be {timezone}.",
        agent=calendar_agent,
        expected_output="if free slot is found",
    )
    crew = Crew(agents=[calendar_agent], tasks=[task])
    result = crew.kickoff()
    print(result)
    return result

run_crew()    
```