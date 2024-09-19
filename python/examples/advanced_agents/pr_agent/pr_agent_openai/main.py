import os
from composio_openai import Action, ComposioToolSet
from openai import OpenAI
from dotenv import load_dotenv

from composio.client.collections import TriggerEventData
load_dotenv()

channel_id = os.getenv("CHANNEL_ID", "general")
if channel_id == "":
    channel_id = input("Enter Channel id:")

openai_client = OpenAI()

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

composio_toolset = ComposioToolSet()
pr_agent_tools = composio_toolset.get_actions(
    actions=[
        Action.GITHUB_GET_CODE_CHANGES_IN_PR,  # For a given PR it get's all the changes
        Action.GITHUB_PULLS_CREATE_REVIEW_COMMENT,  # For a given PR it creates a comment
        Action.GITHUB_ISSUES_CREATE,  # If required, allows you to create issues on github
        Action.SLACKBOT_CHAT_POST_MESSAGE,  # Send a message to slack using app
    ]
)

# Give openai access to all the tools
assistant = openai_client.beta.assistants.create(
    name="PR Review Assistant",
    description="An assistant to help you with reviewing PRs",
    instructions=code_review_assistant_prompt,
    model="gpt-4o",
    tools=pr_agent_tools,
)
print("Assistant is ready")

## Create a trigger listener
listener = composio_toolset.create_trigger_listener()


## Triggers when a new PR is opened
@listener.callback(filters={"trigger_name": "github_pull_request_event"})
def review_new_pr(event: TriggerEventData) -> None:
    # Using the information from Trigger, execute the agent
    code_to_review = str(event.payload)
    thread = openai_client.beta.threads.create()
    openai_client.beta.threads.messages.create(
        thread_id=thread.id, role="user", content=code_to_review
    )

    ## Let's print our thread
    url = f"https://platform.openai.com/playground/assistants?assistant={assistant.id}&thread={thread.id}"
    print("Visit this URL to view the thread: ", url)

    # Execute Agent with integrations
    # start the execution
    run = openai_client.beta.threads.runs.create(
        thread_id=thread.id, assistant_id=assistant.id
    )

    composio_toolset.wait_and_handle_assistant_tool_calls(
        client=openai_client,
        run=run,
        thread=thread,
    )

    
print("Listener started!")
print("Create a pr to get the review")
listener.listen()
