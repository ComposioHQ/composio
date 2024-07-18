"""CrewAI SWE Agent"""

import os

import dotenv
from composio_crewai import App, ComposioToolSet, ExecEnv
from crewai import Agent, Crew, Process, Task
from langchain_openai import ChatOpenAI
from prompts import BACKSTORY, DESCRIPTION, EXPECTED_OUTPUT, GOAL, ROLE


# Load environment variables from .env
dotenv.load_dotenv()

# Initialize tool.
openai_client = ChatOpenAI(
    api_key=os.environ["OPENAI_API_KEY"], model="gpt-4-turbo"  # type: ignore
)
composio_toolset = ComposioToolSet(workspace_env=ExecEnv.DOCKER)

# Get required tools
tools = composio_toolset.get_tools(
    apps=[
        App.SEARCHTOOL,
        App.GITCMDTOOL,
        App.FILEEDITTOOL,
        App.HISTORYFETCHERTOOL,
        App.SHELLEXEC,
    ]
)

# Define agent
agent = Agent(
    role=ROLE,
    goal=GOAL,
    backstory=BACKSTORY,
    llm=openai_client,
    tools=tools,
    verbose=True,
)

task = Task(
    description=DESCRIPTION,
    expected_output=EXPECTED_OUTPUT,
    agent=agent,
)

crew = Crew(
    agents=[agent],
    tasks=[task],
    process=Process.sequential,
    full_output=True,
    verbose=True,
    cache=False,
    memory=True,
)
