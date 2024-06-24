from autogen import AssistantAgent, UserProxyAgent
from composio_autogen import ComposioToolSet, App, Action
import os
import dotenv

llm_config = {"config_list":[{"model":"gpt-4o", "api_key":os.environ["OPENAI_API_KEY"]}]}

chatbot = AssistantAgent(
    "chatbot",
    system_message="Reply TERMINATE when the task is done or user's content is empty",
    llm_config=llm_config,
)

user_proxy = UserProxyAgent(
    "user_proxy",
    is_termination_msg=lambda x: x.get("content", "") and "TERMINATE" in x.get("content", ""),
    human_input_mode="NEVER",
    code_execution_config={"use_docker":False}
)

composio_toolset = ComposioToolSet(api_key=os.environ["COMPOSIO_API_KEY"])
composio_toolset.register_tools(tools=[App.SQLTOOL,App.FILETOOL, App.CODEINTERPRETER], caller = chatbot, executor=user_proxy)

task = "Query the table MOCK_DATA for all rows and plot a graph between first names and salary by using code interpretor"


response = user_proxy.initiate_chat(chatbot,message=task)

print(response.chat_history)