import os

import dotenv
from composio_langchain import App, ComposioToolSet
from crewai import Agent, Crew, Process, Task
from langchain_openai import ChatOpenAI


# Load environment variables
dotenv.load_dotenv()

# Initialize the language model with OpenAI API key and model name
llm = ChatOpenAI(
    api_key=os.environ["OPENAI_API_KEY"],
    model="gpt-4o"
)

# Setup tools using ComposioToolSet
composio_toolset = ComposioToolSet()
# Using .get_tools we are able to add various tools needed by the agents to execute its objective
# in this case its serpapi, giving the agent access to the internet
tools = composio_toolset.get_tools(apps=[App.SERPAPI])

# Define the Researcher agent with its role, goal, and backstory
researcher = Agent(
    role="Researcher",
    goal="Search the internet for the information requested",
    backstory="""
    You are a researcher. Using the information in the task, you find out some of the most popular facts about the topic along with some of the trending aspects.
    You provide a lot of information thereby allowing a choice in the content selected for the final blog.
    """,
    verbose=True,  # Enable verbose logging for the agent
    allow_delegation=False,  # Disable delegation
    tools=tools,  # Assign the tools to the agent
    llm=llm,  # Assign the language model to the agent
)

# Define the research task with its description and expected output
task = Task(
    description="""
    Research about open source LLMs vs closed source LLMs.
    Your final answer MUST be a full analysis report
    """,  # you can add your own topic after "Research about {your topic}"
    expected_output="When the research report is ready",  # Define the expected output
    agent=researcher,  # Assign the task to the researcher agent
)

# Execute the task
crew = Crew(agents=[researcher], tasks=[task])
result = crew.kickoff()

# Print the result of the task execution
print(task.output)
