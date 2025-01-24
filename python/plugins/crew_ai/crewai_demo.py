"""
CrewAI demo.
"""

import os

import dotenv
from crewai import Agent, Crew, Task
from langchain_openai import ChatOpenAI

from composio_crewai import App, ComposioToolSet


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
    description=(
        "Star a repo composiohq/composio on GitHub, if the action is successful "
        "include Action executed successfully"
    ),
    agent=crewai_agent,
    expected_output="if the star happened",
)

my_crew = Crew(agents=[crewai_agent], tasks=[task])

result = my_crew.kickoff()
print(result)
