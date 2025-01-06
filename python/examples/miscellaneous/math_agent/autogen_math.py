import os

import dotenv
from autogen.agentchat import AssistantAgent, UserProxyAgent
from composio_autogen import App, ComposioToolSet


# Load environment variables from .env
dotenv.load_dotenv()

# Validate required environment variables
required_env_vars = ["OPENAI_API_KEY", "COMPOSIO_API_KEY"]
missing_vars = [var for var in required_env_vars if not os.getenv(var)]
if missing_vars:
    raise ValueError(f"Missing required environment variables: {', '.join(missing_vars)}")


# Initialize tools.
chatbot = AssistantAgent(
    "chatbot",
    system_message="""You are a math assistant that helps with calculations.
    Always round your final numerical answers to the nearest integer.
    Reply TERMINATE when the task is done or when user's content is empty""",
    llm_config={
        "config_list": [
            {"model": "gpt-4o", "api_key": os.environ["OPENAI_API_KEY"]},
        ]
    },
)
composio_toolset = ComposioToolSet()


def is_termination_msg(content: dict) -> bool:
    """Check if a message contains termination message."""
    return "TERMINATE" in (content.get("content", "") or "")


# Create a user proxy agent
user_proxy = UserProxyAgent(
    "user_proxy",
    is_termination_msg=is_termination_msg,
    human_input_mode="NEVER",
    code_execution_config={"use_docker": False},
)

# Register the preferred Applications, with right executor.
composio_toolset.register_tools(
    apps=[App.MATHEMATICAL], caller=chatbot, executor=user_proxy
)

# Define task.
task = "What is 230 multiplied by 52 and added with 233 divided by 91?"

# Execute task.
response = user_proxy.initiate_chat(chatbot, message=task)

# Extract and print the final rounded result
def extract_final_number(chat_history):
    """Extract and round the final number from the chat history."""
    import re
    last_message = chat_history[-1].get("content", "")
    # Find all numbers (including decimals) in the text
    numbers = re.findall(r'\d+\.?\d*', last_message)
    if numbers:
        # Get the last number and round it
        return str(round(float(numbers[-1])))
    return None

final_result = extract_final_number(response.chat_history)
if final_result:
    print(final_result)  # Print only the rounded final number
else:
    print("Error: Could not extract final number from response")
