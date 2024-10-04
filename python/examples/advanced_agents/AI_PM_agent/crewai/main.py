# Import necessary libraries
from json import tool
import os
import dotenv  # For loading environment variables from a .env file
# Import modules from Composio and LlamaIndex
import re
from datetime import datetime
from composio_crewai import ComposioToolSet, App, Action
from crewai import Agent, Task, Crew, Process
from langchain_openai import ChatOpenAI
from composio.client.collections import TriggerEventData
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

#from langchain_cerebras import ChatCerebras

#llm = ChatCerebras(model="llama3.1-70b")
llm = ChatOpenAI(model="gpt-4o")

composio_toolset = ComposioToolSet()
composio_tools = composio_toolset.get_tools(
    actions=[Action.LINEAR_CREATE_LINEAR_ISSUE,
             Action.LINEAR_LIST_LINEAR_PROJECTS,
             Action.LINEAR_LIST_LINEAR_TEAMS,
             Action.GMAIL_SEND_EMAIL]
)
slack_listener = composio_toolset.create_trigger_listener()
gmail_listener = composio_toolset.create_trigger_listener()

def proc(mail_message, sender_mail):
    print("listener")
    composio_toolset.execute_action(
        action=Action.SLACKBOT_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL,
        params={
            "channel": "general",
            "text": f"Are you sure you want to post message:{mail_message} from sender email:{sender_mail}. If yes, tag test_app and tell it the project id and team id.",
        },
    )
    slack_listener.listen()



issue_creator_agent = Agent(
    role="Linear Expert",
    goal="You are an agent that creates issues in Linear based on customer feedback emails",
    backstory="You are an expert in using Linear and creating issues on it.",
    llm=llm,
    tools=composio_tools,
)


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

    
    issue_task = Task(
        description=(
            f"""
            2. If you decide to create an issue, Create it on Linear.
            3. If you decide to create an issue it should be a summary of the email content.
            4. The email content is {mail_message} and sender email is {sender_mail}
            4. The format should be <id>:<content>
            5. If you decide NO, then dont call any agent and end operation.
            message:{message}
            6. If the user does not give project_id or team_id find them out by using Linear Tool's actions.
            """
        ),
        expected_output="issue was created",
        agent=issue_creator_agent,
        tools=composio_tools
    )
    
    crew = Crew(
        agents=[issue_creator_agent],
        tasks=[issue_task],
        process=Process.sequential,
        tools = composio_tools
    )

    result = crew.kickoff()
    print(result)
    composio_toolset.execute_action(
        action=Action.SLACKBOT_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL,
        params={
            "channel": channel_id,
            "text": result.raw,
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
            Action.LINEAR_CREATE_LINEAR_ISSUE: proc(mail_message, sender_mail)
            },
        }
    )


print("GMAIL LISTENING")

gmail_listener.listen()


