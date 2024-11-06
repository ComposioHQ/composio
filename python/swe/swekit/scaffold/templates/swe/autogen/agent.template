"""AutoGen SWE Agent"""

import os
import dotenv
from autogen import AssistantAgent, UserProxyAgent, config_list_from_json
from composio_autogen import App, ComposioToolSet, WorkspaceType
from prompts import ROLE, GOAL, BACKSTORY, DESCRIPTION, EXPECTED_OUTPUT

# Load environment variables from .env
dotenv.load_dotenv()

# Initialize Composio toolset
composio_toolset = ComposioToolSet(workspace_config=WorkspaceType.Docker())

# Define assistant agent
assistant = AssistantAgent(
    name="SWE_Assistant",
    system_message=f"""
    Role: {ROLE}
    Goal: {GOAL}
    Backstory: {BACKSTORY}
    Description: {DESCRIPTION}
    Expected Output: {EXPECTED_OUTPUT}
    
    When the task is complete, reply with TERMINATE.
    """,
    llm_config={
        "config_list": [
            {"model": "gpt-4-turbo", "api_key": os.environ["OPENAI_API_KEY"]},
        ]
    },
)

# Define user proxy agent
user_proxy = UserProxyAgent(
    name="user_proxy",
    human_input_mode="NEVER",
    max_consecutive_auto_reply=10,
    is_termination_msg=lambda x: x is not None and isinstance(x.get("content"), str) and "TERMINATE" in x.get("content", ""),
    code_execution_config={"use_docker": False},
)

# Register tools
composio_toolset.register_tools(
    apps=[App.FILETOOL, App.SHELLTOOL],
    caller=assistant,
    executor=user_proxy
)
