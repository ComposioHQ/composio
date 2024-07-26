# Import necessary libraries
import os  # For accessing environment variables

import dotenv  # For loading environment variables from a .env file

# Import modules from Autogen and ComposioAutogen
from autogen.agentchat import AssistantAgent, UserProxyAgent
from composio_autogen import Action, App, ComposioToolSet
from composio.tools.local import embedtool

# Load environment variables from a .env file
dotenv.load_dotenv()

api_key = os.getenv("OPENAI_API_KEY", "")
if api_key == "":
    api_key = input("Enter OpenAI API Key:")
    os.environ["OPENAI_API_KEY"] = api_key


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
composio_toolset = ComposioToolSet()

# Register tools with the ComposioToolSet, specifying the caller (chatbot) and executor (user_proxy)
composio_toolset.register_tools(
    tools=[App.EMBEDTOOL],  # Tools to be registered
    caller=chatbot,  # The chatbot that calls the tools
    executor=user_proxy,  # The user proxy that executes the tools
)

images_path = input("Enter the path to the images folder:")
search_prompt = input("Enter the image description for the image you want to search:")
top_no_of_images = int(
    input(
        "What number of images that are closest to the description that should be returned:"
    )
)  # returns n closest images to the search

task_description = f"""
    Check if a Vector Store exists for the image directory
    If it doesn't create a vector store.
    If it already exists, query the vector store
    The images path and indexed directory is {images_path}
    the prompt for the image to search is {search_prompt}
    return the top {top_no_of_images} results.

"""
# Initiate chat between the user proxy and the chatbot with the given task
response = user_proxy.initiate_chat(chatbot, message=task_description)

# Print the chat history
print(response.chat_history)
