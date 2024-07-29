"""
Langchain demo.
"""

# isort: skip_file

import dotenv
from composio_langchain import Action, ComposioToolSet
from langchain import hub  # type: ignore
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_openai import ChatOpenAI


# Load environment variables from .env
dotenv.load_dotenv()

# Pull relevant agent model.
prompt = hub.pull("hwchase17/openai-functions-agent")

# Initialize tools.
openai_client = ChatOpenAI(model="gpt-4-turbo")


def main():
    composio_toolset = ComposioToolSet()

    # Get All the tools
    tools = composio_toolset.get_actions(
        actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER]
    )

    # Define task
    task = "Star a repo composiohq/composio on GitHub"

    # Define agent
    agent = create_openai_functions_agent(openai_client, tools, prompt)
    agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

    # Execute using agent_executor
    agent_executor.invoke({"input": task})


if __name__ == "__main__":
    main()
