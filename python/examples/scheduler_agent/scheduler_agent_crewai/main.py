import os
import re
from datetime import datetime
from composio.client.collections import TriggerEventData
from composio_crewai import Action, ComposioToolSet
from crewai import Agent, Crew, Task, Process
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4-turbo")
# llm = ChatGroq(model='llama3-70b-8192', api_key=os.environ['GROQ_API_KEY'])

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

email_assistant = Agent(
    role="Email/Calendar Assistant",
    goal="""Analyze email, and create event on calendar depending on the email content. 
    You should also draft an email in response to the sender of the previous email""",
    backstory=f"""You are an AI assistant specialized in creating calendar events based on email information. 
    Current DateTime: {date_time}. All the conversations happen in IST timezone.
    Pass empty config ("config": {{}}) for the function calls, if you get an error about not passing config.""",
    verbose=True,
    llm=llm,
    tools=[schedule_tool],
    allow_delegation=False,
)


def extract_sender_email(payload):
    delivered_to_header_found = False
    for header in payload["headers"]:
        if header.get("name", "") == "Delivered-To" and header.get("value", "") != "":
            delivered_to_header_found = True
    print("delivered_to_header_found: ", delivered_to_header_found)
    if not delivered_to_header_found:
        return None
    for header in payload["headers"]:
        if header["name"] == "From":
            # Regular expression to extract email from the 'From' header value
            match = re.search(r"[\w\.-]+@[\w\.-]+", header["value"])
            if match:
                return match.group(0)
    return None


listener = composio_toolset.create_trigger_listener()


@listener.callback(filters={"trigger_name": "gmail_new_gmail_message"})
def callback_new_message(event: TriggerEventData) -> None:
    print("here in the function")
    payload = event.payload
    thread_id = payload.get("threadId")
    message = payload.get("snippet")
    sender_mail = extract_sender_email(payload["payload"])
    if sender_mail is None:
        print("No sender email found")
        return
    print(sender_mail)
    # Correct the description by concatenating strings
    analyze_email_task = Task(
        description=f"""
            1. Analyze the email content and decide if an event should be created. 
                a. The email was received from {sender_mail} 
                b. The content of the email is: {message} 
                c. The thread id is: {thread_id}.
            2. If you decide to create an event, try to find a free slot 
            using Google Calendar Find Free Slots action.
            3. Once you find a free slot, use Google Calendar Create Event 
            action to create the event at a free slot and send the invite to {sender_mail}.
            """,
        agent=email_assistant,
        expected_output="Email was analysed and event was created if needed",
    )

    draft_email_task = Task(
        description=f"""If an event was created, draft a confirmation email for the created event. 
        The receiver of the mail is: {sender_mail}, the subject should be meeting scheduled and body
        should describe what the meeting is about""",
        expected_output="emails was drafted",
        agent=email_assistant,
        tools=[email_tool],
        context=[analyze_email_task],
    )

    email_processing_crew = Crew(
        agents=[email_assistant],
        tasks=[analyze_email_task, draft_email_task],
        verbose=1,
        process=Process.sequential,
    )
    result = email_processing_crew.kickoff()
    return result


print("Subscription created!")
listener.listen()
