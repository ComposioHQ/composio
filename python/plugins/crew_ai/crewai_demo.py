"""
CrewAI demo.
"""

import os

import dotenv
from composio_crewai import App, ComposioToolSet
from crewai import Agent, Task
from langchain_openai import ChatOpenAI


# Load environment variables from .env
dotenv.load_dotenv()

# Initialize tools.
openai_client = ChatOpenAI(api_key=os.environ["OPENAI_API_KEY"])
composio_toolset = ComposioToolSet()

# Get All the tools
tools = composio_toolset.get_tools(apps=[App.GITHUB])

# Define agent
crewai_agent = Agent(
    role="Github Agent",
    goal="""You take action on Github using Github APIs""",
    backstory=(
        "You are AI agent that is responsible for taking actions on Github "
        "on users behalf. You need to take action on Github using Github APIs"
    ),
    verbose=True,
    tools=tools,
    llm=openai_client,
)

# Define task
task = Task(
    description="Star a repo SamparkAI/docs on GitHub",
    agent=crewai_agent,
    expected_output="if the star happened",
)

# Execute task
task.execute()
