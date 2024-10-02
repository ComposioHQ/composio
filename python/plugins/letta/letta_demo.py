"""
Langchain demo.
"""

# isort: skip_file

import dotenv
from composio_letta import Action, ComposioToolSet
from letta import create_client, LLMConfig


# Load environment variables from .env
dotenv.load_dotenv()


# Initialize tools.
client = create_client()


def main():
    composio_toolset = ComposioToolSet()

    # Get All the tools
    tools = composio_toolset.get_tools(
        actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER]
    )
    tool_names = []
    for tool in tools:
        tool = client.add_tool(tool) # type: ignore
        tool_names.append(tool.name)
        
        
    agent_state = client.create_agent(llm_config=LLMConfig.default_config("gpt-4"), tools=tool_names)
    response = client.send_message(agent_id=agent_state.id, role="user", message="Star a repo composiohq/composio on GitHub")
    print("Usage", response.usage)
    print("Agent messages", response.messages)


if __name__ == "__main__":
    main()
