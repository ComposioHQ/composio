import os
from dotenv import load_dotenv
from composio_openai import Action, ComposioToolSet
from crewai import Agent, Crew, Process, Task
from langchain_openai import ChatOpenAI

from composio.client.collections import TriggerEventData
load_dotenv()


# Initialize the ComposioToolSet
composio_toolset = ComposioToolSet()


# Define the tools
pr_agent_tools = composio_toolset.get_actions(
    actions=[
        Action.GITHUB_GET_CODE_CHANGES_IN_PR,
        Action.GITHUB_PULLS_CREATE_REVIEW_COMMENT,
        Action.GITHUB_ISSUES_CREATE,
        Action.SLACKBOT_CHAT_POST_MESSAGE,
    ]
)

# Initialize the language model
llm = ChatOpenAI(model="gpt-4")

# Create CrewAI agent
code_reviewer = Agent(
    role="Code Reviewer",
    goal="Review code changes and provide constructive feedback",
    backstory="You are an experienced software engineer with a keen eye for code quality and best practices.",
    verbose=True,
    allow_delegation=False,
    tools=pr_agent_tools,
    llm=llm,
)

# Create a task for the agent
def review_code_task(code_to_review):
    return Task(
        description=f"Review the following code changes and provide feedback: {code_to_review}",
        agent=code_reviewer,
    )


# Create the crew
code_review_crew = Crew(
    agents=[code_reviewer], tasks=[], verbose=2, process=Process.sequential
)

print("Assistant is ready")

# Create a trigger listener
listener = composio_toolset.create_trigger_listener()


@listener.callback(filters={"trigger_name": "github_pull_request_event"})
def review_new_pr(event: TriggerEventData) -> None:
    # Using the information from Trigger, execute the agent
    code_to_review = str(event.payload)

    # Create a new task for this specific code review
    task = review_code_task(code_to_review)

    # Add the task to the crew and execute
    code_review_crew.tasks = [task]
    result = code_review_crew.kickoff()

    print("Review result:", result)


print("Listener started!")
listener.listen()
