# Import necessary libraries
import os
import time  # For accessing environment variables
import dotenv  # For loading environment variables from a .env file
# Import modules from Composio and LlamaIndex
import re
from datetime import datetime
from composio_llamaindex import App, ComposioToolSet, Action, Trigger
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI

from composio.client.collections import TriggerEventData

# Load environment variables from a .env file
dotenv.load_dotenv()

# Initialize a ComposioToolSet with the API key from environment variables
composio_toolset = ComposioToolSet()

# Retrieve tools from Composio, specifically the EMBEDTOOL app
# Define the tools
schedule_tool = composio_toolset.get_tools(
    actions=[
        Action.GOOGLECALENDAR_FIND_FREE_SLOTS,
        Action.GOOGLECALENDAR_CREATE_EVENT,
        Action.GMAIL_CREATE_EMAIL_DRAFT
    ]
)

# Initialize an OpenAI instance with the GPT-4o model
llm = OpenAI(model="gpt-4o")

date_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
timezone = datetime.now().astimezone().tzinfo

# Create a trigger listener
listener = composio_toolset.create_trigger_listener()
@listener.callback(filters={"trigger_name": Trigger.GMAIL_NEW_GMAIL_MESSAGE})
def callback_new_message(event: TriggerEventData) -> None:
    # Using the information from Trigger, execute the agent
    print("here in the function")
    payload = event.payload
    thread_id = payload.get("threadId")
    message = payload.get("messageText")
    sender_mail = payload.get("sender")
    if sender_mail is None:
        print("No sender email found")
        return
    print(sender_mail)

    prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            f"""
                You are an AI assistant specialized in creating calendar events based on email information. 
                Current DateTime: {date_time} and timezone {timezone}. All the conversations happen in IST timezone.
                Pass empty config ("config": {{}}) for the function calls, if you get an error about not passing config.
                Analyze email, and create event on calendar depending on the email content. 
                You should also draft an email in response to the sender of the previous email  
            """

        ),
        )
    ]
    agent = FunctionCallingAgentWorker(
    tools=schedule_tool,  # Tools available for the agent to use # type: ignore
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
                c. The thread id is: {thread_id}.
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

print("Listener started!")
print("Waiting for email")
listener.wait_forever()
