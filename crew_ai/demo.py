import os

import dotenv
from composio_crewai import App, ComposioToolset
from crewai import Agent, Task
from langchain_openai import ChatOpenAI

# Loading the variables from .env file
dotenv.load_dotenv()

llm = ChatOpenAI(openai_api_key=os.environ["OPENAI_API_KEY"])


# Get All the tools
tools = ComposioToolset(apps=[App.GITHUB])


crewai_agent = Agent(
    role="Github Agent",
    goal="""You take action on Github using Github APIs""",
    backstory=(
        "You are AI agent that is responsible for taking actions on Github on users behalf."
        "You need to take action on Github using Github APIs"
    ),
    verbose=True,
    tools=tools,
    llm=llm,
)

task = Task(
    description="Star a repo SamparkAI/docs on GitHub", agent=crewai_agent, expected_output="if the star happened"
)

task.execute()
