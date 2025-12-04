from crewai import Agent, Task, Crew
from composio import Composio
from crewai.mcp import MCPServerHTTP
import os


composio = Composio()
session = composio.experimental.create(
    user_id="user_123",
)

agent = Agent(
    role="Gmail agent",
    goal="helps with gmail related queries",
    backstory="You are a helpful assistant that can use the tools provided to you.",
    mcps=[
        MCPServerHTTP(
            url=session.mcp.url,
            headers={
                "x-api-key": os.getenv("COMPOSIO_API_KEY"),
            },
        )
    ],
)

# Define task
task = Task(
    description=("Find the last email and summarize it."),
    expected_output="A summary of the last email including sender, subject, and key points.",
    agent=agent,
)

my_crew = Crew(agents=[agent], tasks=[task])
result = my_crew.kickoff()
print(result)
