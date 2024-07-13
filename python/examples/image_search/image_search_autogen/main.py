# Import necessary libraries
import os  # For accessing environment variables

import dotenv  # For loading environment variables from a .env file

# Import modules from Autogen and ComposioAutogen
from autogen import AssistantAgent, UserProxyAgent
from composio_autogen import Action, App, ComposioToolSet
from composio.tools.local import embedtool

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
    tools=[App.EMBEDTOOL],  # Tools to be registered
    caller=chatbot,  # The chatbot that calls the tools
    executor=user_proxy,  # The user proxy that executes the tools
)

# Define the images path and query string
images_path = "/path/to/the/images/folder"
search_prompt = "image_description"
top_no_of_images = 1 #returns n closest images to the search 


#Create a vector store prompt template
create_task_description = "Create a vector store of the images in the "+images_path

#Query the vector store prompt template
query_task_description = "Only Query the vector store for the top"+str(top_no_of_images)+",image of:"+search_prompt+"at the indexed directory:"+images_path

# Initiate chat between the user proxy and the chatbot with the given task
response = user_proxy.initiate_chat(chatbot, message=create_task_description)

# Print the chat history
print(response.chat_history)
