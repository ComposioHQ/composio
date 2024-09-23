from composio_llamaindex import App, ComposioToolSet, Action
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI
from datetime import datetime


from composio.client.collections import TriggerEventData
import os
from dotenv import load_dotenv
load_dotenv()
# add OPENAI_API_KEY to env variables.
llm = OpenAI(model="gpt-4o")

date_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
timezone = datetime.now().astimezone().tzinfo

#example google sheet link
#https://docs.google.com/spreadsheets/d/1s9tLhV7eBP96F0kf8NNkAU6XCVEMg1caHTdLkch7YDw/edit?usp=sharing
GOOGLE_SHEET_ID = '1s9tLhV7eBP96F0kf8NNkAU6XCVEMg1caHTdLkch7YDw' #To connect to your google sheet, paste the id here
# Get All the tools
composio_toolset = ComposioToolSet()
tools = composio_toolset.get_tools(apps=[App.GOOGLESHEETS, App.GMAIL])

listener = composio_toolset.create_trigger_listener()

@listener.callback(filters = {"trigger_name":"GMAIL_NEW_GMAIL_MESSAGE"})
def edit_job_board(event: TriggerEventData)-> None:
    print("Trigger detected")
    payload = event.payload
    thread_id = payload.get("threadId")
    message = payload.get("messageText")
    sender_mail = payload.get("sender")

    prefix_messages = [
        ChatMessage(
            role="system",
            content=(
                f"""
                You are an AI assistant that handles a job board.
                Your job is to make sure the Google Sheet is updated with the latest job requirements.
                Ensure that you send email to the Google Groups if there is a change in Google sheets and only if there s a change.
                Google sheet id is {GOOGLE_SHEET_ID}. Edit or Read this sheet only.
                """
            )
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
    task = f"""
    1. Analyse the email content and decide if it is a job requirement. Take action only if it 
    is definitely a job requirement email.
    2. The email was received from {sender_mail}, content is {message} and thread id is {thread_id}
    3. Read the Google Sheets first and determine the columns, then based on the column names add the email content that is relevant to the columns.
    You can also create additional columns if you deem it necessary, but dont change the existing column names.
    4. Once the Google Sheets has been edited, send an email to the members of the jobboard through the google groups email.
    5. The google groups email id is jobboard_3194@googlegroups.com
    6. The email sent to the google groups should be of the format
        Job role and compensation

        Job description
        Job requirements

        Text to contact this email to apply or ask any queries related to the process

    """
    response = agent.chat(task)

print(f"Link to the connected Google Sheet:{GOOGLE_SHEET_ID}")
print("Listener listening")
listener.listen()