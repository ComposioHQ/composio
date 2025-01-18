"""
Pydantic-AI demo.
"""

from composio_pydanticai import ComposioToolSet
from dotenv import load_dotenv  # type: ignore
from pydantic_ai import Agent

from composio import Action


# Load environment variables from .env
load_dotenv(".env")
# Initialize tools
composio_toolset: ComposioToolSet = ComposioToolSet()

# Get GitHub tools that are pre-configured
tools = composio_toolset.get_tools(
    actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER]
)

# Create an agent with the tools
agent = Agent(
    model="openai:gpt-4o",  # Using a known model name
    tools=tools,
    system_prompt="""You are an AI agent that helps users interact with GitHub.
    You can perform various GitHub operations using the available tools.
    When given a task, analyze it and use the appropriate tool to complete it.""",
)


def main():
    # Define task
    task = "Star a repo wjayesh/mahilo on GitHub"

    # Run the agent
    result = agent.run_sync(task)
    print("Result: ", result.data)
    print("Trace:\n\n", result.all_messages())


if __name__ == "__main__":
    main()
