import os

from crewai import Agent, Crew, Task
from crewai.mcp import MCPServerHTTP

from composio import Composio

composio = Composio()
session = composio.create(
    # A user with a connected Gmail account (raises KeyError when unset)
    user_id=os.environ["COMPOSIO_EXAMPLES_USER_ID"],
    # mcp=True surfaces session.mcp on the returned type
    mcp=True,
)

agent = Agent(
    role="Gmail agent",
    goal="helps with gmail related queries",
    backstory="You are a helpful assistant that can use the tools provided to you.",
    mcps=[
        MCPServerHTTP(
            url=session.mcp.url,
            headers=session.mcp.headers,  # type: ignore[arg-type]  # headers is typed Dict[str, Optional[str]]; the SDK always populates it with str values
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
