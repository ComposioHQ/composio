import logging
import os

import dotenv
from composio_crewai import App, ComposioToolset
from crewai import Agent, Task
from flask import Flask
from langchain_openai import ChatOpenAI


logging.basicConfig(level=logging.INFO)

"""
This is an example of using composio tool - Scheduler,
1. setup a ngrok webhook
2. setup a simple flask server to handle connection on webhook
3. On a hit on the webhook, call Google Calendar agent to find a free slot
4. Schedule this job using Composio-scheduling tool
"""

# Loading the variables from .env file
dotenv.load_dotenv()
app = Flask(__name__)

llm = ChatOpenAI(
    openai_api_key=os.environ["OPENAI_API_KEY"], model_name="gpt-4-turbo-preview"
)

# Get All the tools
composio_tool_set = ComposioToolset(apps=[App.GOOGLECALENDAR, App.SCHEDULER])


async def run_crew():
    gcal_agent = Agent(
        role="Google Calendar Agent",
        goal="""You take action on Google Calendar using Google Calendar APIs""",
        backstory="""You are AI agent that is responsible for taking actions on
            Google Calendar on users behalf. You need to take action on
            Calendar using Google Calendar APIs. Use Correct tools to run
            apis from the given tool-set""",
        verbose=True,
        tools=composio_tool_set,
        llm=llm,
    )
    task = Task(
        description="Find a free slot in my calendar from 9am to 1pm",
        agent=gcal_agent,
        expected_output="if free slot is found",
    )
    task.execute()
    return "Crew run initiated", 200


@app.route("/", methods=["POST"])
async def webhook():
    logging.info("request received for google calendar summary")
    return await run_crew()


def schedule_task():
    scheduling_agent = Agent(
        role="Scheduling Job Agent",
        goal="""You take action using Scheduler APIs""",
        backstory="""You are AI agent that is responsible for scheduling jobs on users behalf.
             Use Correct tools to run apis from the given tool-set""",
        verbose=True,
        tools=composio_tool_set,
        llm=llm,
    )
    task = Task(
        description="set up a cron to run at 7 am once a week for "
        "sending a request on my webhook. My webhook url is https://b54f-45-117-31-163.ngrok-free.app",
        agent=scheduling_agent,
        expected_output="if the job scheduled",
    )
    return task.execute()


if __name__ == "__main__":
    schedule_task()
    # start the webhook service
    app.run(port=2000, debug=True)
