import os

import dotenv
from autogen import AssistantAgent, UserProxyAgent
from composio_autogen import Action, App, ComposioToolSet

from composio.client.collections import TriggerEventData


llm_config = {
    "config_list": [{"model": "gpt-4o", "api_key": os.environ["OPENAI_API_KEY"]}]
}
chatbot = AssistantAgent(
    "chatbot",
    system_message="""
        You are an experienced code reviewer.
        Your task is to review the provided file diff and give constructive feedback.

        Follow these steps:
        1. Identify if the file contains significant logic changes.
        2. Summarize the changes in the diff in clear and concise English, within 100 words.
        3. Provide actionable suggestions if there are any issues in the code.

        Once you have decided on the changes, for any TODOs, create a Github issue.
        And send the summary of the PR review to #ram channel on slack. Slack doesn't have markdown and so send a plain text message.
        Also add the comprehensive review to the PR as a comment.
        """,
    llm_config=llm_config,
)

user_proxy = UserProxyAgent(
    "user_proxy",
    is_termination_msg=lambda x: x.get("content", "")
    and "TERMINATE" in x.get("content", ""),
    human_input_mode="NEVER",
    code_execution_config={"use_docker": False},
)

composio_toolset = ComposioToolSet(api_key=os.environ["COMPOSIO_API_KEY"])
composio_toolset.register_tools(
    actions=[
        Action.GITHUB_GET_CODE_CHANGES_IN_PR,
        Action.GITHUB_PULLS_CREATE_REVIEW_COMMENT,
        Action.GITHUB_ISSUES_CREATE,
        Action.SLACKBOT_CHAT_POST_MESSAGE,
    ],
    caller=chatbot,
    executor=user_proxy,
)

listener = composio_toolset.create_trigger_listener()


@listener.callback(filters={"trigger_name": "github_pull_request_event"})
def review_new_pr(event: TriggerEventData) -> None:
    # Using the information from Trigger, execute the agent
    code_to_review = str(event.payload)
    query_task = f"Review the following code changes: {code_to_review}"
    # Execute the agent
    response = user_proxy.initiate_chat(chatbot, message=query_task)
    return response


print("Listener started!")
listener.listen()

task = "Query the table MOCK_DATA for all rows and plot a graph between first names and salary by using code interpretor"
