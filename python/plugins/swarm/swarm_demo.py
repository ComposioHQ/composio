from composio_swarm import Action, ComposioToolSet
from dotenv import load_dotenv
from swarm import Agent
from swarm.repl import run_demo_loop


load_dotenv()


def main() -> None:
    composio_toolset = ComposioToolSet()

    # Get All the tools
    tools = composio_toolset.get_tools(
        actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER]
    )

    # Create a new agent
    agent = Agent(
        name="GitHub Star Agent",
        instructions="You are an agent that stars a repository on GitHub.",
        functions=tools,
    )

    run_demo_loop(agent, stream=True)


if __name__ == "__main__":
    main()
