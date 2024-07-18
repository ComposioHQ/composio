import os  # For accessing environment variables
import dotenv  # For loading environment variables from a .env file
# Import modules from Composio and LlamaIndex
import re
from composio_llamaindex import App, ComposioToolSet, Action
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI
from datetime import datetime
from composio.client.collections import TriggerEventData

# Load environment variables from a .env file
dotenv.load_dotenv()

api_key = os.getenv("OPENAI_API_KEY","")
if(api_key==""):
    api_key=input("Enter OpenAI api key:")
    os.environ["OPENAI_API_KEY"] = api_key

api_key = os.getenv("COMPOSIO_API_KEY","")
if(api_key==""):
    api_key=input("Enter Composio api key:")
    os.environ["COMPOSIO_API_KEY"] = api_key

# Initialize a ComposioToolSet with the API key from environment variables
composio_toolset = ComposioToolSet()
openai_api_key = os.getenv("OPENAI_API_KEY","")
if(openai_api_key==""):
    print("OpenAI key not found in env")

llm = OpenAI(model="gpt-4o")
schedule_tool = composio_toolset.get_actions(
    actions=[
        Action.GOOGLECALENDAR_FIND_FREE_SLOTS,
        Action.GOOGLECALENDAR_CREATE_EVENT,
        Action.GMAIL_CREATE_EMAIL_DRAFT
    ]
)

date_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
timezone = datetime.now().astimezone().tzinfo

# Define the system message for the agent
prefix_messages = [
    ChatMessage(
        role="system",
        content=(
                f"""Analyze email, and create event on calendar depending on the email content. 
                You should also draft an email in response to the sender of the previous email
                Current DateTime: {date_time}. All the conversations happen in IST timezone.
                Pass empty config ("config": {{}}) for the function calls, if you get an error about not passing config."""
        ),
    )
]
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

agent = FunctionCallingAgentWorker(
    tools=schedule_tool,  # Tools available for the agent to use
    llm=llm,  # Language model for processing requests
    prefix_messages=prefix_messages,  # Initial system messages for context
    max_function_calls=10,  # Maximum number of function calls allowed
    allow_parallel_tool_calls=False,  # Disallow parallel tool calls
    verbose=True,  # Enable verbose output
).as_agent()



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
    response = agent.chat(query_task)
    print(response)


print("Subscription created!")
listener.listen()