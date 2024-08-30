# Import necessary libraries
import os  # For accessing environment variables
import dotenv  # For loading environment variables from a .env file
# Import modules from Composio and LlamaIndex
import re
from datetime import datetime
from composio_llamaindex import App, ComposioToolSet, Action
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI
from llama_index.llms.cerebras import Cerebras
from composio.client.collections import TriggerEventData


# Load environment variables from a .env file
dotenv.load_dotenv()

BOT_USER_ID=os.environ["BOT_USER_ID"]
RESPOND_ONLY_IF_TAGGED = (
    True  # Set to True to have the bot respond only when tagged in a message
)


# Initialize a ComposioToolSet with the API key from environment variables
composio_toolset = ComposioToolSet(api_key=os.environ["COMPOSIO_API_KEY"])

# Retrieve tools from Composio, specifically the EMBEDTOOL app
# Define the tools
schedule_tool = composio_toolset.get_actions(
    actions=[
        Action.GOOGLECALENDAR_FIND_FREE_SLOTS,
        Action.GOOGLECALENDAR_CREATE_EVENT,
        Action.GMAIL_CREATE_EMAIL_DRAFT
    ]
)

# Initialize an OpenAI instance with the GPT-4o model
#llm = OpenAI(model="gpt-4o")
llm = Cerebras(model="llama3.1-70b", api_key=os.environ['CEREBRAS_API_KEY'])


date_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
timezone = datetime.now().astimezone().tzinfo

# Define the tools
slack_tools = composio_toolset.get_actions(
        actions=[
        Action.SLACKBOT_CHAT_POST_MESSAGE,
        ]
)

gmail_listener = composio_toolset.create_trigger_listener()
slack_listener = composio_toolset.create_trigger_listener()





def proc():
    print("listener")
    composio_toolset.execute_action(
        action=Action.SLACKBOT_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL,
        params={
            "channel": "general",
            "text": f"Are you sure you want to add message:{mail_message} from sender email:{sender_mail} to your Calendar? If yes, tag test_app and tell it YES",
        },
    )
    slack_listener.listen()


@slack_listener.callback(filters={"trigger_name": "slackbot_receive_message"})
def review_new_pr(event: TriggerEventData) -> None:
    # Using the information from Trigger, execute the agent
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

    prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            f"""
                You are an AI assistant specialized in creating calendar events based on email information. 
                Current DateTime: {date_time}. All the conversations happen in IST timezone.
                Pass empty config ("config": {{}}) for the function calls, if you get an error about not passing config.
                Analyze email, and create event on calendar depending on the email content. 
                You should also draft an email in response to the sender of the previous email  
            """

        ),
        )
    ]
    agent = FunctionCallingAgentWorker(
    tools=tools,  # Tools available for the agent to use
    llm=llm,  # Language model for processing requests
    prefix_messages=prefix_messages,  # Initial system messages for context
    max_function_calls=10,  # Maximum number of function calls allowed
    allow_parallel_tool_calls=False,  # Disallow parallel tool calls
    verbose=True,  # Enable verbose output
    ).as_agent()
    analyze_email_task = f"""
        1. Analyze the email content and decide if an event should be created. 
                a. The email was received from {sender_mail} 
                b. The content of the email is: {message} 
        2. If you decide to create an event, try to find a free slot 
            using Google Calendar Find Free Slots action.
        3. Once you find a free slot, use Google Calendar Create Event 
            action to create the event at a free slot and send the invite to {sender_mail}.

        If an event was created, draft a confirmation email for the created event. 
        The receiver of the mail is: {sender_mail}, the subject should be meeting scheduled and body
        should describe what the meeting is about
        """
    response = agent.chat(analyze_email_task)
    print(response)

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
            Action.SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL: proc()
            },
        }
    )


print("GMAIL LISTENING")

gmail_listener.listen()


