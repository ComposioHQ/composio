"""
CrewAI demo.
"""

import os

import dotenv
from composio_crewai import Action, ComposioToolSet
from crewai import Agent, Task
from langchain_openai import ChatOpenAI


# Load environment variables from .env
dotenv.load_dotenv()

# Initialize tools.
openai_client = ChatOpenAI(api_key=os.environ["OPENAI_API_KEY"])
composio_toolset = ComposioToolSet()

# Get All the tools
# tools = composio_toolset.get_tools(apps=[App.GITHUB])
tools = composio_toolset.get_actions(actions=[Action.GMAIL_SEND_EMAIL])

# Define agent
crewai_agent = Agent(
    role="AI Agent",
    goal="""You take action on behalf of the user using given tools""",
    backstory=(
        "You are AI agent that is responsible for taking actions "
        "on users behalf. You need to take action using your given tools"
    ),
    verbose=True,
    tools=tools,
    llm=openai_client,
)

# Define task
task = Task(
    description="Send a mail to sawradip0@gmail.com, with `Test Composio Attachment Crew` in subject, and `defghijklm` in body, and `/Users/sawradip/Desktop/practice_code/practice_composio/composio/docs/media/intro.jpg` as attachment.",
    agent=crewai_agent,
    expected_output="if the action successfully executed.",
)

# Execute task
task.execute()
