import os
from datetime import datetime
import dotenv

from composio.client.enums import Action

# Import from composio_llamaindex
from composio_llamaindex import ComposioToolSet
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.groq import Groq

dotenv.load_dotenv()

llm = Groq(model="mixtral-8x7b-32768",
           api_key=os.environ["GROQ_API_KEY"])
# llm = MistralAI(model="open-mixtral-8x22b" ,api_key=os.environ["MISTRAL_API_KEY"])
# Get the SLack integration
composio_toolset = ComposioToolSet()
# tools = composio_toolset.get_tools(apps=[App.GOOGLECALENDAR])
tools = composio_toolset.get_actions(actions=[Action.GOOGLECALENDAR_CREATE_EVENT,
                                              Action.GOOGLECALENDAR_DELETE_EVENT, Action.GOOGLECALENDAR_REMOVE_ATTENDEE])

# Retreive the current date and time
date = datetime.today().strftime("%Y-%m-%d")
timezone = datetime.now().astimezone().tzinfo

prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            f"""You are now a calendar integration agent. You will try to execute the given task utilizing Google Calendar tools.
            Today's date is {date} (it's in YYYY-MM-DD format).
            You need to write start and end time in the correct format for creating Google Calendar events.
            Please follow these rules for datetime formatting:
            - If the start date is not mentioned, assume the start date is within the next 24 hours and use the format `UTC-5.5, 6:50 PM`.
            - If the meeting start date is within the next year, use the format `UTC+1, 11:59 PM, 31 Dec`.
            - If the meeting is set for a specific future date with the year mentioned, use the format `UTC-3.75, 7:15 AM, 22 Aug 2020`.
            - If no UTC offset is to be mentioned, simply use the format `11:15 PM, 12 May 2019`.
            Infer the date of the event from the message content and format it accordingly.
            Always add a Google Meet event link and send the invitation email to attendees.
            Always return the HTML link of the meeting after execution. Remember, the current date is {date} and the time zone is {timezone}."""
        ),
    )
]

agent = FunctionCallingAgentWorker(
    tools=tools,
    llm=llm,
    prefix_messages=prefix_messages,
    max_function_calls=10,
    allow_parallel_tool_calls=False,
    verbose=True,
).as_agent()
