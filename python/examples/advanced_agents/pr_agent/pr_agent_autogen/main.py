# Importing necessary modules
import os
from dotenv import load_dotenv
from autogen.agentchat import AssistantAgent, UserProxyAgent
from composio_autogen import Action, App, ComposioToolSet
from composio.client.collections import TriggerEventData

load_dotenv()

api_key = os.getenv("OPENAI_API_KEY", "")
if api_key == "":
    api_key = input("Enter openai api key:")
# Configuration for the language model
llm_config = {"config_list": [{"model": "gpt-4o", "api_key": api_key}]}

channel_id = os.getenv("CHANNEL_ID", "")
if channel_id == "":
    channel_id = input("Enter Channel id:")
code_review_assistant_prompt = (
    """
        You are an experienced code reviewer.
        Your task is to review the provided file diff and give constructive feedback.

        Follow these steps:
        1. Identify if the file contains significant logic changes.
        2. Summarize the changes in the diff in clear and concise English, within 100 words.
        3. Provide actionable suggestions if there are any issues in the code.

        Once you have decided on the changes, for any TODOs, create a Github issue.
        And send the summary of the PR review to """
    + channel_id
    + """ channel on slack. Slack doesn't have markdown and so send a plain text message.
        Also add the comprehensive review to the PR as a comment.
"""
)
# Creating an AssistantAgent instance for the chatbot
chatbot = AssistantAgent(
    "chatbot",
    system_message=code_review_assistant_prompt,
    llm_config=llm_config,
)

# Creating a UserProxyAgent instance for user interactions
user_proxy = UserProxyAgent(
    "user_proxy",
    is_termination_msg=lambda x: x.get("content", "")
    and "TERMINATE" in x.get("content", ""),
    human_input_mode="NEVER",
    code_execution_config={"use_docker": False},
)

# Creating a ComposioToolSet instance for handling actions
composio_toolset = ComposioToolSet()
composio_toolset.register_actions(
    actions=[
        Action.GITHUB_GET_CODE_CHANGES_IN_PR,
        Action.GITHUB_PULLS_CREATE_REVIEW_COMMENT,
        Action.GITHUB_ISSUES_CREATE,
        Action.SLACKBOT_CHAT_POST_MESSAGE,
    ],
    caller=chatbot,
    executor=user_proxy,
)

# Creating a trigger listener
listener = composio_toolset.create_trigger_listener()


# Callback function for reviewing new pull requests
@listener.callback(filters={"trigger_name": "github_pull_request_event"})
def review_new_pr(event: TriggerEventData) -> None:
    # Using the information from Trigger, execute the agent
    code_to_review = str(event.payload)
    query_task = f"Review the following code changes: {code_to_review}"
    # Execute the agent
    response = user_proxy.initiate_chat(chatbot, message=query_task)
    print(response.summary)


# Starting the listener
print("Listener started!")
print("Create a pr to get the review")
listener.listen()
