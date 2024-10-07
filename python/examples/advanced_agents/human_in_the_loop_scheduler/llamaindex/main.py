import os  # For accessing environment variables
import dotenv  # For loading environment variables from a .env file
import re
import json
from datetime import datetime
from typing import Optional, Dict, Any, List

from composio_llamaindex import App, ComposioToolSet, Action
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage, MessageRole
from llama_index.llms.openai import OpenAI
from composio.client.collections import TriggerEventData
from llama_index.llms.cerebras import Cerebras
# Load environment variables from a .env file
dotenv.load_dotenv()

# Constants
BOT_USER_ID: str = os.environ["BOT_USER_ID"]
RESPOND_ONLY_IF_TAGGED: bool = True
COMPOSIO_API_KEY: str = os.environ["COMPOSIO_API_KEY"]
DATE_TIME: str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
TIMEZONE: Optional[Any] = datetime.now().astimezone().tzinfo

# Initialize ComposioToolSet and OpenAI
composio_toolset: ComposioToolSet = ComposioToolSet(api_key=COMPOSIO_API_KEY)
llm: OpenAI = OpenAI(model="gpt-4o")
#llm = Cerebras(model="llama3.1-70b", api_key=os.environ["CEREBRAS_API_KEY"])

# Define tools
schedule_tool = composio_toolset.get_tools(
    actions=[
        Action.GOOGLECALENDAR_FIND_FREE_SLOTS,
        Action.GOOGLECALENDAR_CREATE_EVENT,
        Action.GMAIL_CREATE_EMAIL_DRAFT
    ]
)

slack_tools = composio_toolset.get_tools(
    actions=[
        Action.SLACKBOT_CHAT_POST_MESSAGE,
    ]
)

# Create listeners
slack_listener = composio_toolset.create_trigger_listener()
gmail_listener = composio_toolset.create_trigger_listener()

# Preprocessor function that listens to the Slack messages
def proc() -> None:
    print("Preprocessing: Waiting for user confirmation on Slack...")
    composio_toolset.execute_action(
        action=Action.SLACKBOT_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL,
        params={
            "channel": "general",
            "text": f"Are you sure you want to add message: '{mail_message}' from sender email: '{sender_mail}' to your Calendar? If yes, tag test_app and tell it YES",
        },
    )
    print("Message sent to Slack channel. Waiting for user response...")
    slack_listener.listen()

# Listens to user response on Slack
@slack_listener.callback(filters={"trigger_name": "slackbot_receive_message"})
def callback_new_message(event: TriggerEventData) -> None:
    print("Received a new message from Slack.")
    payload: Dict[str, Any] = event.payload
    user_id: str = payload.get("user", "")

    # Ignore messages from the bot itself to prevent self-responses
    if user_id == BOT_USER_ID:
        print("Bot ignored: Message from itself.")
        return

    message: str = payload.get("text", "")
    print(f"Message content: {message}")

    # Respond only if the bot is tagged in the message, if configured to do so
    if RESPOND_ONLY_IF_TAGGED and f"<@{BOT_USER_ID}>" not in message:
        print(f"Bot not tagged, ignoring message - {message} - {BOT_USER_ID}")
        print(f"Payload ignored: {json.dumps(payload)} - {BOT_USER_ID}")
        return

    # Extract channel and timestamp information from the event payload
    channel_id: str = payload.get("channel", "")
    ts: str = payload.get("ts", "")
    thread_ts: str = payload.get("thread_ts", ts)

    print(f"Channel ID: {channel_id}, Timestamp: {ts}, Thread Timestamp: {thread_ts}")
    prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            f"""
                    You are an AI assistant specialized in creating calendar events based on email information. 
                    Current DateTime: {DATE_TIME}. All the conversations happen in IST timezone.
                    Analyze email, and create event on calendar depending on the email content. 
                    You should also draft an email in response to the sender of the previous email  
                """
            ),
        )
    ]

    print("Creating agent for analyzing email...")
    agent = FunctionCallingAgentWorker(
        tools=schedule_tool,  # Tools available for the agent to use
        llm=llm,  # Language model for processing requests
        prefix_messages=prefix_messages,  # Initial system messages for context
        max_function_calls=10,  # Maximum number of function calls allowed
        allow_parallel_tool_calls=False,  # Disallow parallel tool calls
        verbose=True,  # Enable verbose output
    ).as_agent()
    
    analyze_email_task: str = f"""
        1. Analyze the email content and decide if an event should be created. 
            a. The email was received from {sender_mail} 
            b. The content of the email is: {mail_message} 
        2. If you decide to create an event, try to find a free slot 
            using Google Calendar Find Free Slots action.
        3. Once you find a free slot, use Google Calendar Create Event 
            action to create the event at a free slot and send the invite to {sender_mail}.
        4. While creating the event note the following things: Timezone should be Asia/Kolkata
        event duration should be of the format similar to 1h or 2h30m.
        If an event was created, draft a confirmation email for the created event. 
        The receiver of the mail is: {mail_message}, the subject should be meeting scheduled and body
        should describe what the meeting is about
    """
    
    print("Analyzing email content...")
    response = agent.chat(analyze_email_task)
    print("Response from agent received:")
    print(response)

    # Check if the response indicates a failure
    if not response.get('successfull', True):
        print(f"Error: {response.get('error', 'Unknown error')}")
    else:
        print("Event created successfully.")

# Gmail listener Function
# We initialize mail content variable mail_message and sender mail here
@gmail_listener.callback(filters={"trigger_name": "GMAIL_NEW_GMAIL_MESSAGE"})
def callback_gmail_message(event: TriggerEventData) -> None:
    try:
        print("New Gmail message received.")
        payload: Dict[str, Any] = event.payload
        global mail_message
        global sender_mail
        thread_id: Optional[str] = payload.get("threadId")
        
        mail_message = payload.get("messageText")
        sender_mail = payload.get("sender")
        
        if sender_mail is None:
            print("No sender email found. Exiting...")
            return
        
        print(f"Sender Email: {sender_mail}")
        print("Waiting for Slack confirmation...")
        proc()
    except Exception as e:
        print(f"Error in callback_gmail_message: {e}")

print("GMAIL LISTENING... Waiting for new messages.")
gmail_listener.listen()