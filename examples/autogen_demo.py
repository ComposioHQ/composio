import os

import dotenv
from autogen import AssistantAgent, UserProxyAgent
from plugins.autogen.composio_autogen import App, ComposioToolset


# Loading the variables from .env file
dotenv.load_dotenv()

llm_config = {
    "config_list": [{"model": "gpt-4", "api_key": os.environ["OPENAI_API_KEY"]}]
}

chatbot = AssistantAgent(
    "chatbot",
    system_message="Reply TERMINATE when the task is done or when user's content is empty",
    llm_config=llm_config,
)

# create a UserProxyAgent instance named "user_proxy"
user_proxy = UserProxyAgent(
    "user_proxy",
    is_termination_msg=lambda x: x.get("content", "")
    and "TERMINATE" in x.get("content", ""),
    human_input_mode="NEVER",  # Don't take input from User
    code_execution_config={"use_docker": False},
)


# Initialise the Composio Tool Set
composio_tools = ComposioToolset()

# Register the preferred Applications, with right executor.
composio_tools.register_tools(tools=[App.GITHUB], caller=chatbot, executor=user_proxy)


task = "Star a repo SamparkAI/docs on GitHub"

response = user_proxy.initiate_chat(chatbot, message=task)

print(response.chat_history)
