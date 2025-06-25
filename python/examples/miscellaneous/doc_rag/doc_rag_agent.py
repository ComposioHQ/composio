import os
from dotenv import load_dotenv
from crewai import Agent, Task, Crew
from langchain_openai import ChatOpenAI
from composio_crewai import ComposioToolSet
from composio import Action, App

# Load environment variables
load_dotenv()

os.environ["COMPOSIO_NO_REMOTE_ENUM_FETCHING"] = "true"


def get_path():
    """
    Prompt the user for a valid dir/file path.

    Returns:
        str: A valid dir/file path.
    """
    while True:
        path = input("Enter the path to the dir/file: ").strip()
        if os.path.isdir(path) or os.path.isfile(path):
            return path
        print("Invalid path. Please enter a valid dir/file path.")


def create_composio_toolset(path):
    """
    Create a ComposioToolSet instance with the given dir/file path.

    Args:
        path (str): Path to the file/dir to RAG.

    Returns:
        ComposioToolSet: Configured ComposioToolSet instance.
    """
    return ComposioToolSet(
        metadata={
            App.DOC_RAG_TOOL: {
                "dir_to_index_path": path,
            }
        }
    )


def create_agent(tools, llm):
    """
    Create a Doc RAG Agent with the given tools and language model.

    Args:
        tools (list): List of tools for the agent to use.
        llm (ChatOpenAI): Language model instance.

    Returns:
        Agent: Configured Doc RAG Agent.
    """
    return Agent(
        role="Doc Agent",
        goal="Analyze files and provide insights using Doc RAG Tool",
        backstory=(
            "You are an AI agent specialized in question/answering related to files. "
            "Your task is to use the Doc RAG Tool to extract "
            "valuable information from the given files and provide "
            "insightful answers to user queries."
        ),
        verbose=True,
        tools=tools,
        llm=llm,
    )


def main():
    # Get repository path
    path = get_path() # try it out with ./assets/llms.txt or ./assets/script

    # Initialize ComposioToolSet
    composio_toolset = create_composio_toolset(path)

    # Get tools for Code Analysis
    tools = composio_toolset.get_tools(apps=[App.DOC_RAG_TOOL])

    # Initialize language model
    llm = ChatOpenAI(model="gpt-4o", temperature=0.7)

    # Create agent
    agent = create_agent(tools, llm)

    # Get user question
    question = input("Enter your question about the path: ")

    # Create task
    task = Task(
        description=f"Analyze the files and answer the following question:\n{question}",
        agent=agent,
        expected_output="Provide a clear, concise, and informative answer to the user's question.",
    )

    # Create and execute crew
    crew = Crew(agents=[agent], tasks=[task])
    result = crew.kickoff()

    # Display analysis result
    print(f"Question: {question}\n")
    print(f"Answer: {result}")


if __name__ == "__main__":
    main()
