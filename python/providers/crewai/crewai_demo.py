"""
CrewAI demo.
"""

import os

from crewai import Agent, Crew, Task
from langchain_openai import ChatOpenAI

from composio import Composio
from composio_crewai import CrewAIProvider


# Initialize tools.
openai_client = ChatOpenAI()
composio = Composio(provider=CrewAIProvider())

# Get All the tools
tools = composio.tools.get(user_id="default", toolkits=["GITHUB"])

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
