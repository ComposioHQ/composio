import os
from datetime import datetime

from composio.client.enums import Action

# Import from composio_llamaindex
from composio_llamaindex import ComposioToolSet
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.groq import Groq

llm = Groq(model="mixtral-8x7b-32768",
             api_key=os.environ["GROQ_API_KEY"])
# llm = MistralAI(model="open-mixtral-8x22b" ,api_key=os.environ["MISTRAL_API_KEY"])
# Get the SLack integration
composio_toolset = ComposioToolSet()
# tools = composio_toolset.get_tools(apps=[App.GOOGLECALENDAR])
tools = composio_toolset.get_actions(actions=[Action.GOOGLECALENDAR_CREATE_EVENT,
Action.GOOGLECALENDAR_DELETE_EVENT, Action.GOOGLECALENDAR_REMOVE_ATTENDEE])

# Retrieve the current date and time
date = datetime.today().strftime("%Y-%m-%d")
timezone = datetime.now().astimezone().tzinfo

prefix_messages = [
  ChatMessage(
      role="system",
      content=(
          f"You are now a calendar integration agent. You will try to execute the given task utilizing Google Calendar toools.\
           Today's date is {date} (it's in YYYY-MM-DD format). Write start and end time in appropriate format for\
            example 12pm as 'YYYY-MM-DDT12:00:00'. Infer date of event from the message. Fill the date part accordingly. Please remember the current date to be {date}. Always add Google Meet event.\
            Always send the mail to attendees.\
            Always write correct time mentioned in the request. Always return the html link of the meeting after execution. Remember the time-zone is {timezone}."
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
