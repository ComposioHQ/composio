import os
import typing as t
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from crewai import Agent, Task, Crew
from composio_crewai import ComposioToolSet, Action

# Load environment variables
load_dotenv()

# Constants
REPO_OWNER = os.getenv("REPO_OWNER") or input("Enter the repository owner: ")
REPO_NAME = os.getenv("REPO_NAME") or input("Enter the repository name: ")

# Initialize services
llm = ChatOpenAI(model="gpt-4-turbo-preview")
composio_toolset = ComposioToolSet()

def fetch_pull_requests() -> t.List[dict]:
    """Fetch all pull requests for the given repository."""
    response = composio_toolset.execute_action(
        action=Action.GITHUB_LIST_PULL_REQUESTS,
        params={"owner": REPO_OWNER, "repo": REPO_NAME},
    )
    # We execute a Composio action directly to fetch the pull requests
    
    if not response["successfull"]:
        raise Exception(f"Error fetching pull requests: {response['error']}")

    # We return the pull requests
    return response["data"]["details"]

def create_summarizer_agent() -> Agent:
    """Create and return a Github Pull Request Summarizer Agent."""
    tools = composio_toolset.get_tools(actions=[Action.GITHUB_GET_A_PULL_REQUEST])
    return Agent(
        role="Github Pull Request Summarizer",
        goal="Provide a comprehensive summary of pull requests, including code changes and all relevant details.",
        backstory="You are an AI agent specialized in analyzing and summarizing GitHub pull requests with precision and clarity.",
        verbose=True,
        llm=llm,
        tools=tools,
    )

def create_summary_task(pr: dict, summarizer_agent: Agent) -> Task:
    """Create a summary task for a given pull request."""
    
    return Task(
        description=f"""Analyze and summarize the following pull request:
        Title: {pr['title']}
        Assignees: {', '.join(pr['assignees']) if pr['assignees'] else 'None'}
        Labels: {', '.join(pr['labels']) if pr['labels'] else 'None'}
        Author: {pr['user']['login']}
        Created at: {pr['created_at']}
        Patch: {get_patch(pr['patch_url'])}
        Updated at: {pr['updated_at']}""",
        
        agent=summarizer_agent,
        expected_output="A detailed summary of the pull request including code changes, files modified, author information, assignees, labels, and any other relevant details.",
        async_execution=True,
    )

def get_patch(patch_url: str) -> str:
    # get 

def main():
    summarizer_agent = create_summarizer_agent()
    
    try:
        pr_list = fetch_pull_requests()
        if not pr_list:
            print("No pull requests found.")
            return

        tasks = [create_summary_task(pr, summarizer_agent) for pr in pr_list]

        crew = Crew(
            agents=[summarizer_agent],
            tasks=tasks,
            verbose=True,
        )

        results = crew.kickoff()
        for i, result in enumerate(results, 1):
            print(f"\nSummary for Pull Request #{i}:")
            print(result)

    except Exception as e:
        print(f"An error occurred: {str(e)}")

if __name__ == "__main__":
    main()
