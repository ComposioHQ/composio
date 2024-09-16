import os
from dotenv import load_dotenv
from crewai import Agent, Task, Crew
from langchain_openai import ChatOpenAI
from composio_crewai import ComposioToolSet, Action, App

# Load environment variables
load_dotenv()


def get_repo_path():
    """
    Prompt the user for a valid repository path.

    Returns:
        str: A valid directory path.
    """
    while True:
        path = input("Enter the path to the repo: ").strip()
        if os.path.isdir(path):
            return path
        print("Invalid path. Please enter a valid directory path.")


def create_composio_toolset(repo_path):
    """
    Create a ComposioToolSet instance with the given repository path.

    Args:
        repo_path (str): Path to the repository to analyze.

    Returns:
        ComposioToolSet: Configured ComposioToolSet instance.
    """
    return ComposioToolSet(
        metadata={
            App.CODE_ANALYSIS_TOOL: {
                "dir_to_index_path": repo_path,
            }
        }
    )


def create_agent(tools, llm):
    """
    Create a Code Analysis Agent with the given tools and language model.

    Args:
        tools (list): List of tools for the agent to use.
        llm (ChatOpenAI): Language model instance.

    Returns:
        Agent: Configured Code Analysis Agent.
    """
    return Agent(
        role="Code Analysis Agent",
        goal="Analyze codebase and provide insights using Code Analysis Tool",
        backstory=(
            "You are an AI agent specialized in code analysis. "
            "Your task is to use the Code Analysis Tool to extract "
            "valuable information from the given codebase and provide "
            "insightful answers to user queries."
        ),
        verbose=True,
        tools=tools,
        llm=llm,
    )


def main():
    # Get repository path
    repo_path = get_repo_path()

    # Initialize ComposioToolSet
    composio_toolset = create_composio_toolset(repo_path)

    # create code index for the repo.
    print(
        "Generating FQDN for codebase, Indexing the codebase, this might take a while..."
    )
    resp = composio_toolset.execute_action(
        action=Action.CODE_ANALYSIS_TOOL_CREATE_CODE_MAP,
        params={},
    )

    print("Indexing Result:")
    print(resp)
    print("Codebase indexed successfully.")

    # Get tools for Code Analysis
    tools = composio_toolset.get_tools(apps=[App.CODE_ANALYSIS_TOOL])

    # Initialize language model
    llm = ChatOpenAI(model="gpt-4o", temperature=0.7)

    # Create agent
    agent = create_agent(tools, llm)

    # Get user question
    question = input("Enter your question about the codebase: ")

    # Create task
    task = Task(
        description=f"Analyze the codebase and answer the following question:\n{question}",
        agent=agent,
        expected_output="Provide a clear, concise, and informative answer to the user's question.",
    )

    # Create and execute crew
    crew = Crew(agents=[agent], tasks=[task])
    result = crew.kickoff()

    # Display analysis result
    print("\nAnalysis Result:")
    print(result)


if __name__ == "__main__":
    main()
