"""
Langchain demo.
"""

# isort: skip_file

import dotenv
from composio_langchain import Action, ComposioToolSet
from letta import create_client, LLMConfig
from letta.schemas.tool import Tool


# Load environment variables from .env
dotenv.load_dotenv()


# Initialize tools.
client = create_client()


def main():
    composio_toolset = ComposioToolSet()

    # Get All the tools
    langchain_tools = composio_toolset.get_tools(
        actions=[Action.CODEINTERPRETER_EXECUTE_CODE]
    )
    tools = [Tool.from_langchain(tool) for tool in langchain_tools]
    
    tool_names = []
    for tool in tools:
        print(tool)
        tool = client.add_tool(tool) # type: ignore
        tool_names.append(tool.name)
        
        
    agent_state = client.create_agent(llm_config=LLMConfig.default_config("gpt-4"), tools=tool_names)
    response = client.send_message(agent_id=agent_state.id, role="user", message="Execute the code `print('Hello, world!')`")
    print("Usage", response.usage)
    print("Agent messages", response.messages)


if __name__ == "__main__":
    main()
