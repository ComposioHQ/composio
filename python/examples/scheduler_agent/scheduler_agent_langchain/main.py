import os
import re
from datetime import datetime
from dotenv import load_dotenv
from composio_langchain import Action, ComposioToolSet
from composio_langchain import ComposioToolSet, Action, App
from langchain_openai import ChatOpenAI
from langchain import hub
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_openai import ChatOpenAI

from composio.client.collections import TriggerEventData

llm = ChatOpenAI(model="gpt-4-turbo")
# llm = ChatGroq(model='llama3-70b-8192', api_key=os.environ['GROQ_API_KEY'])

composio_toolset = ComposioToolSet()

schedule_tool = composio_toolset.get_actions(
    actions=[
        Action.GOOGLECALENDAR_FIND_FREE_SLOTS,
        Action.GOOGLECALENDAR_CREATE_EVENT,
        Action.GMAIL_CREATE_EMAIL_DRAFT,
    ]
)
email_tool = composio_toolset.get_actions(actions=[Action.GMAIL_CREATE_EMAIL_DRAFT])
date_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
timezone = datetime.now().astimezone().tzinfo

prompt = hub.pull("hwchase17/openai-functions-agent")
query_agent = create_openai_functions_agent(llm, schedule_tool, prompt)
agent_executor = AgentExecutor(agent=query_agent, tools=schedule_tool, verbose=True)

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

    query_task = f"""
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
    # Execute the agent
    res = agent_executor.invoke({"input": query_task})
    print(res)


print("Subscription created!")
listener.listen()
