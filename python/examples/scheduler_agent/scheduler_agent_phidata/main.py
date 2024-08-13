import os
import re
from datetime import datetime
from composio.client.collections import TriggerEventData
from composio_phidata import Action, ComposioToolSet
from phi.assistant.assistant import Assistant
from phi.workflow.workflow import Workflow

# Initialize Composio tools
composio_toolset = ComposioToolSet()

schedule_tool = composio_toolset.get_actions(
    actions=[
        Action.GOOGLECALENDAR_FIND_FREE_SLOTS,
        Action.GOOGLECALENDAR_CREATE_EVENT,
    ]
)
email_tool = composio_toolset.get_actions(actions=[Action.GMAIL_CREATE_EMAIL_DRAFT])

date_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
timezone = datetime.now().astimezone().tzinfo

team = []
# Create a Phi Data HQ assistant
email_assistant = Assistant(
    name="Email/Calendar Assistant",
    description=f"""Analyze email, and create event on calendar depending on the email content. 
    You should also draft an email in response to the sender of the previous email.
    Current DateTime: {date_time}. All the conversations happen in {timezone} timezone.
    Pass empty config ("config": {{}}) for the function calls, if you get an error about not passing config.""",
    run_id="",
    tools=schedule_tool
)

def extract_sender_email(payload):
    for header in payload["payload"]["headers"]:
        if header["name"] == "From":
            match = re.search(r"[\w\.-]+@[\w\.-]+", header["value"])
            if match:
                return match.group(0)
    return None


listener = composio_toolset.create_trigger_listener()

@listener.callback(filters={"trigger_name": "gmail_new_gmail_message"})
def callback_new_message(event: TriggerEventData) -> None:
    print("New message received")
    payload = event.payload
    thread_id = payload.get("threadId")
    message = payload.get("snippet")
    sender_mail = extract_sender_email(payload)
    if sender_mail is None:
        print("No sender email found")
        return

    result = email_assistant.print_response(f"""
    1. Analyze the email content and decide if an event should be created. 
        a. The email was received from {sender_mail} 
        b. The content of the email is: {message} 
        c. The thread id is: {thread_id}.
    2. If you decide to create an event, try to find a free slot using Google Calendar Find Free Slots action.
    3. Once you find a free slot, use Google Calendar Create Event action to create the event at a free slot and send the invite to {sender_mail}.
    Use the Composio tools for these actions.
    4. If an event was created, draft a confirmation email for the created event.The receiver of the mail is: {sender_mail}, the subject should be "Meeting scheduled" and body
    should describe what the meeting is about.
    5. Use the Composio Gmail Create Email Draft action to create the draft.
    """)




if __name__ == "__main__":
    print("Subscription created!")
    listener.listen()