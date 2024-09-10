"""
CrewAI Send Email with Attachment demo.
"""

import os

import dotenv
from crewai import Agent, Crew, Task
from langchain_openai import ChatOpenAI

from composio_crewai import App, ComposioToolSet, Action


# Load environment variables from .env
dotenv.load_dotenv()

# Initialize tools.
openai_client = ChatOpenAI(api_key=os.environ["OPENAI_API_KEY"], model="gpt-4-turbo")
composio_toolset = ComposioToolSet()

# Get All the tools
tools = composio_toolset.get_tools(apps=[App.GMAIL])
print(composio_toolset.get_action_schemas(actions=[Action.GMAIL_SEND_EMAIL]))

# Define agent
crewai_agent = Agent(
    role="Gmail Agent",
    goal="""You take action on Gmail using Gmail APIs""",
    backstory=(
        "You are AI agent that is responsible for taking actions on Gmail "
        "on users behalf. You need to take action on Gmail using Gmail APIs"
    ),
    verbose=True,
    tools=tools,
    llm=openai_client,
)

# Define task
task = Task(
    description="Send an email to testcomposio@gmail.com with attachment as ./examples/attachment/send_attachment.py",
    agent=crewai_agent,
    expected_output="if the email was sent",
)

my_crew = Crew(agents=[crewai_agent], tasks=[task])

result = my_crew.kickoff()
print(result)
