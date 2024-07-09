# Import necessary libraries
import os  # For accessing environment variables

import dotenv  # For loading environment variables from a .env file

# Import modules from Autogen and ComposioAutogen
from autogen import AssistantAgent, UserProxyAgent
from composio_autogen import Action, App, ComposioToolSet


# Load environment variables from a .env file
dotenv.load_dotenv()

# Define the LLM configuration with the model and API key
llm_config = {
    "config_list": [{"model": "gpt-4o", "api_key": os.environ["OPENAI_API_KEY"]}]
}

# Initialize a Chatbot AssistantAgent
chatbot = AssistantAgent(
    "chatbot",
    system_message="Reply TERMINATE when the task is done or user's content is empty",  # System message for termination
    llm_config=llm_config,  # Language model configuration
)

# Initialize a UserProxyAgent
user_proxy = UserProxyAgent(
    "user_proxy",
    is_termination_msg=lambda x: x.get("content", "")
    and "TERMINATE"
    in x.get("content", ""),  # Lambda function to check for termination message
    human_input_mode="NEVER",  # No human input mode
    code_execution_config={
        "use_docker": False
    },  # Configuration for code execution without Docker
)

# Initialize a ComposioToolSet with the API key from environment variables
composio_toolset = ComposioToolSet(api_key=os.environ["COMPOSIO_API_KEY"])

# Register tools with the ComposioToolSet, specifying the caller (chatbot) and executor (user_proxy)
composio_toolset.register_tools(
    tools=[App.SQLTOOL, App.FILETOOL, App.CODEINTERPRETER],  # Tools to be registered
    caller=chatbot,  # The chatbot that calls the tools
    executor=user_proxy,  # The user proxy that executes the tools
)

# Define the task to be executed
task = "Create a vectorstore called animals with the images in the path ./images/ and return the image that looks like a horse."

# Initiate chat between the user proxy and the chatbot with the given task
response = user_proxy.initiate_chat(chatbot, message=task)

# Print the chat history
print(response.chat_history)
