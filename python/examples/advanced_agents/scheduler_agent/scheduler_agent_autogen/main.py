# Importing necessary modules
import os
import re
from dotenv import load_dotenv
from autogen.agentchat import AssistantAgent, UserProxyAgent
from composio_autogen import Action, App, ComposioToolSet, Trigger
from composio.client.collections import TriggerEventData
from datetime import datetime
from typing import Optional, Any
load_dotenv()

DATE_TIME: str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
TIMEZONE: Optional[Any] = datetime.now().astimezone().tzinfo

# Configuration for the language model
llm_config = {
    "config_list": [{"model": "gpt-4o", "api_key": os.environ["OPENAI_API_KEY"]}]
}

scheduler_assistant_prompt = f"""
You are an AI assistant specialized in creating calendar events based on email information. 
Current DateTime: {DATE_TIME} and timezone is {TIMEZONE}. All the conversations happen in IST timezone.
Pass empty config ("config": {{}}) for the function calls, if you get an error about not passing config.
Analyze email, and create event on calendar depending on the email content. 
You should also draft an email in response to the sender of the previous email    
"""
# Creating an AssistantAgent instance for the chatbot
chatbot = AssistantAgent(
    "chatbot",
    system_message=scheduler_assistant_prompt,
    llm_config=llm_config,
)

# Creating a UserProxyAgent instance for user interactions
user_proxy = UserProxyAgent(
    "user_proxy",
    is_termination_msg=lambda x: x.get("content", "") and "TERMINATE" in x.get("content", ""),
    human_input_mode="NEVER",
    code_execution_config={"use_docker": False},
)
# Creating a ComposioToolSet instance for handling actions
composio_toolset = ComposioToolSet()
schedule_tool = composio_toolset.register_tools(
    caller=chatbot,
    executor=user_proxy,
    actions=[
        Action.GOOGLECALENDAR_FIND_FREE_SLOTS,
        Action.GOOGLECALENDAR_CREATE_EVENT,
        Action.GMAIL_CREATE_EMAIL_DRAFT
    ]
)
date_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
timezone = datetime.now().astimezone().tzinfo


listener = composio_toolset.create_trigger_listener()


@listener.callback(filters={"trigger_name": Trigger.GMAIL_NEW_GMAIL_MESSAGE})
def callback_new_message(event: TriggerEventData) -> None:
    print("here in the function")
    payload = event.payload
    thread_id = payload.get("threadId")
    message = payload.get("messageText")
    sender_mail = payload.get("sender")
    if sender_mail is None:
        print("No sender email found")
        return
    print(sender_mail)
    # Correct the description by concatenating strings
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
    response = user_proxy.initiate_chat(chatbot, message=analyze_email_task)
    print(response.summary)


print("Subscription created!")
listener.wait_forever()