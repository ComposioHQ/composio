import os
import re
from datetime import datetime
from composio import tools,Composio,App
from composio.client.collections import TriggerEventData
from composio_crewai import Action, ComposioToolSet
from crewai import Agent, Crew,Task, Process
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

load_dotenv()
llm = ChatOpenAI(model='gpt-4o', openai_api_key=os.environ['OPENAI_API_KEY'])
#llm = ChatGroq(model='llama3-70b-8192', api_key=os.environ['GROQ_API_KEY'])

composio_toolset = ComposioToolSet(api_key=os.getenv('COMPOSIO_API_KEY'))
email_tool = composio_toolset.get_tools(
    actions=[Action.GMAIL_CREATE_EMAIL_DRAFT])

schedule_tool = composio_toolset.get_tools(actions=[
    Action.GOOGLECALENDAR_FIND_FREE_SLOTS, Action.GOOGLECALENDAR_CREATE_EVENT
])
date_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
timezone = datetime.now().astimezone().tzinfo

EMAIL_ANALYZER_PROMPT = """
You are an AI assistant specialized in analyzing email content to determine if an event should be created. Your task is to carefully read the email and extract relevant information about potential events.

Your responsibilities:
1. Identify if the email contains information about an event that should be scheduled.
2. Extract key details such as the event type, date, time, duration, and participants.
3. Determine the urgency and importance of the event.
4. Decide if the event warrants creation in a calendar.

Guidelines:
- Look for specific time-related phrases or date mentions.
- Consider the context and tone of the email to gauge its importance.
- Be cautious about creating events for tentative or hypothetical meetings.
- If unsure, err on the side of not creating an event.

Output:
- A boolean indicating whether an event should be created.
- If yes, provide a structured summary of the event details.
- If no, provide a brief explanation of why an event is not necessary. and Exit.

Remember, your goal is to accurately identify genuine event requests and filter out non-event-related content. Do not reply if it is not a genuine event requests.
"""

# Event Creator Agent System Prompt
EVENT_CREATOR_PROMPT = f"""
You are an AI assistant specialized in creating calendar events based on email information. Your task is to take the analyzed email data and transform it into a properly structured calendar event.

Your responsibilities:
1. Interpret the event information provided by the Email Analyzer.
2. Create a clear and concise event summary.
3. Set the correct date, start time, and end time for the event.
4. Add relevant details to the event description.
5. Determine if any additional attendees should be invited.

Guidelines:
- Ensure the event summary is brief but descriptive.
- Use a consistent date and time format.
- Include important details from the email in the event description.
- If the email suggests a recurring event, set up the appropriate recurrence pattern.
- If the time zone is unclear, default to the user's primary time zone.

Output:
- A structured event object ready to be created in Google Calendar.
- Any additional notes or suggestions for the event creation process.

Current DateTime {date_time} and timezone is {timezone}
Remember, your goal is to create accurate and useful calendar events that reflect the information provided in the original email.
"""

# Email Drafter Agent System Prompt
EMAIL_DRAFTER_PROMPT = """
You are an AI assistant specialized in drafting professional and concise emails to confirm event creation. Your task is to compose a well-structured email that informs the recipient about the newly created calendar event.

Your responsibilities:
1. Draft a clear and concise email confirming the event creation.
2. Include all relevant event details in the email body.
3. Maintain a professional and friendly tone.
4. Provide any necessary instructions or next steps for the recipient.

Guidelines:
- Start with a brief greeting and context for the email.
- Clearly state that an event has been created based on their previous communication.
- Include the event title, date, time, and any other crucial details.
- If applicable, mention any action items or preparation needed for the event.
- Close with a professional sign-off and offer assistance if they have any questions.

Output:
- A complete draft email including the subject line and body.
Have any additional notes or suggestions for personalizing the email?

Remember, your goal is to craft informative and professional emails that effectively communicate the creation of a new calendar event while maintaining a positive and helpful tone.
"""

email_analyzer = Agent(
    role="Email Analyzer",
    goal="Analyze emails and determine if an event should be created",
    backstory=
    "You are an AI assistant specialized in analyzing email content and determining if it contains information about an event that should be scheduled. Exit when the email is not about any event scheduling",
    verbose=True,
    prompt=EMAIL_ANALYZER_PROMPT,
    llm=llm,
    allow_delegation = False
)

event_creator = Agent(
    role=" Event Creator",
    goal="Create events on Google Calendar based on email content",
    backstory=
    f"You are an AI assistant specialized in creating calendar events based on email information. Current DateTime: {date_time}",
    verbose=True,
    prompt=EVENT_CREATOR_PROMPT,
    llm=llm,
    tools=schedule_tool,
    allow_delegation = False
)

email_drafter = Agent(
    role="Email Drafter",
    goal="Draft confirmation emails for created events",
    backstory=
    "You are an AI assistant specialized in drafting professional and concise emails to confirm event creation.",
    verbose=True,
    prompt=EMAIL_DRAFTER_PROMPT,
    llm=llm,
    tools=email_tool,
    allow_delegation = False
)

listener = composio_toolset.create_trigger_listener()


@listener.callback(filters={"trigger_name": "gmail_new_gmail_message"})
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
    analyze_email_task = Task(
        description=
            "Analyze the email content and decide if an event should be created. The email content is: "+ message + " the thread id is: " + thread_id
        ,
        agent=email_analyzer,
        expected_output='Email was analysed'
    )
    create_event_task = Task(
        description=f"Create an event on Google Calendar based on the email information and add the attendee: {sender_mail}",
        expected_output=' Event was created ',
        agent=event_creator,
        tools=schedule_tool
    )

    draft_email_task = Task(
        description="Draft a confirmation email for the created event. The receiver of the mail is: {sender_mail}, the subject should be meeting scheduled and body should describe what the meeting is about",
        expected_output="emails was drafted",
        agent=email_drafter,
        tools=email_tool
    )

    email_processing_crew = Crew(
        agents=[email_analyzer, event_creator, email_drafter],
        tasks=[analyze_email_task, create_event_task, draft_email_task],
        verbose=1,
    )
    result = email_processing_crew.kickoff()
    return result

print("Subscription created!")
listener.listen()