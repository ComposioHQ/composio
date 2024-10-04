# Import necessary libraries
import os
import dotenv  # For loading environment variables from a .env file
# Import modules from Composio and LlamaIndex
import re
from datetime import datetime
from composio_llamaindex import App, ComposioToolSet, Action
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI
from composio.client.collections import TriggerEventData
from composio_llamaindex import Action, App, ComposioToolSet
import json
# Load environment variables from a .env file
dotenv.load_dotenv()

BOT_USER_ID = os.environ[
    "BOT_USER_ID"
]  # Bot ID for Composio. Replace with your own bot member ID, once bot joins the channel.
RESPOND_ONLY_IF_TAGGED = (
    True  # Set to True to have the bot respond only when tagged in a message
)
import agentops
agentops.init(os.environ["AGENTOPS_API_KEY"])

llm = OpenAI(model="gpt-4o")

composio_toolset = ComposioToolSet()
composio_tools = composio_toolset.get_tools(
    actions=[Action.LINEAR_CREATE_LINEAR_ISSUE,
             Action.LINEAR_LIST_LINEAR_PROJECTS,
             Action.LINEAR_LIST_LINEAR_TEAMS,
             Action.GMAIL_SEND_EMAIL]
)
slack_listener = composio_toolset.create_trigger_listener()
gmail_listener = composio_toolset.create_trigger_listener()

def proc():
    print("listener")
    composio_toolset.execute_action(
        action=Action.SLACKBOT_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL,
        params={
            "channel": "general",
            "text": f"Are you sure you want to post message:{mail_message} from sender email:{sender_mail}. If yes, tag test_app and tell it the project id and team id.",
        },
    )
    slack_listener.listen()





prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            "You are an agent that creates issues in Linear based on customer feedback emails"
        ),
    )
]

agent = FunctionCallingAgentWorker(
    tools=composio_tools,
    llm=llm,
    prefix_messages=prefix_messages,
    max_function_calls=10,
    allow_parallel_tool_calls=False,
    verbose=True,
).as_agent()


# Callback function for handling new messages in a Slack channel
@slack_listener.callback(filters={"trigger_name": "slackbot_receive_message"})
def callback_new_message(event: TriggerEventData) -> None:
    print("Recieved new messsage")
    payload = event.payload
    user_id = payload.get("user", "")

    # Ignore messages from the bot itself to prevent self-responses
    if user_id == BOT_USER_ID:
        return "Bot ignored"

    message = payload.get("text", "")

    # Respond only if the bot is tagged in the message, if configured to do so
    if RESPOND_ONLY_IF_TAGGED and f"<@{BOT_USER_ID}>" not in message:
        print(f"Bot not tagged, ignoring message - {message} - {BOT_USER_ID}")
        return (
            f"Bot not tagged, ignoring message - {json.dumps(payload)} - {BOT_USER_ID}"
        )

    # Extract channel and timestamp information from the event payload
    channel_id = payload.get("channel", "")
    ts = payload.get("ts", "")
    thread_ts = payload.get("thread_ts", ts)

    

    YES_OR_NO_prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            "Find team id and project id and create an issue on Linear. Ask the user once, if he says find it out. Stop asking"
            "Once the issue is created, say the issue is created and end the workflow. EXIT"
        ),
    )
]
    tools = composio_toolset.get_tools(apps=[App.LINEAR])
    # Process the message and post the response in the same channel or thread
    check_agent = FunctionCallingAgentWorker(
    tools=tools,
    llm=llm,
    prefix_messages=YES_OR_NO_prefix_messages,
    max_function_calls=10,
    allow_parallel_tool_calls=False,
    verbose=True,
    ).as_agent()
    query_task = f"""
            2. If you decide to create an issue, Create it on Linear.
            3. If you decide to create an issue it should be a summary of the email content.
            4. The email content is {mail_message} and sender email is {sender_mail}
            4. The format should be <id>:<content>
            5. If you decide NO, then dont call any agent and end operation.
            message:{message}
            6. If the user does not give project_id or team_id find them out by using Linear Tool's actions.
            """
    result = check_agent.chat(query_task)
    print(result)
    composio_toolset.execute_action(
        action=Action.SLACKBOT_CHAT_POST_MESSAGE,
        params={
            "channel": channel_id,
            "text": result.response,
            "thread_ts": thread_ts,
        },
    )
        

@gmail_listener.callback(filters={"trigger_name": "gmail_new_gmail_message"})
def callback_new_message(event: TriggerEventData) -> None:
    print("MESSAGE RECEIVED")
    print("here in the function")
    payload = event.payload
    global mail_message
    global sender_mail
    thread_id = payload.get("threadId")
    mail_message = payload.get("messageText")
    print(payload)
    sender_mail = payload.get("sender")
    if sender_mail is None:
        print("No sender email found")
        return
    print(sender_mail)
    print("WAITING FOR SLACK CONFIRMATION")
    composio_toolset_1 = ComposioToolSet(
        processors={
        "pre": {
            Action.LINEAR_CREATE_LINEAR_ISSUE: proc()
            },
        }
    )


print("GMAIL LISTENING")

gmail_listener.listen()

