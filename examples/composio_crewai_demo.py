import os

import dotenv
from crewai import Agent, Task
from langchain_openai import ChatOpenAI

from plugins.crew_ai.composio_crewai import Action, ComposioToolset


# Loading the variables from .env file
dotenv.load_dotenv()

llm = ChatOpenAI(openai_api_key=os.environ["OPENAI_API_KEY"])


# Get All the tools
tools = ComposioToolset(
    actions=[Action.COMPOSIO_CHECK_ACTIVE_CONNECTION], entity_id="soham"
)


crewai_agent = Agent(
    role="User Connection Checker",
    goal="""You check if the user connection is active for an app""",
    backstory="""You are AI agent that is responsible for making sure that if the user connection is active for an app""",
    verbose=True,
    tools=tools,
    llm=llm,
)

task = Task(
    description="Check ifthe user connection is active for github",
    agent=crewai_agent,
    expected_output="Tell me if the user connection is active for github",
)

task.execute()
