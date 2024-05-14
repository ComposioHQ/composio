import os
from datetime import datetime
from pprint import pprint

import dotenv
from composio_openai import Action, App, ComposioToolset
from openai import OpenAI


dotenv.load_dotenv()

client = OpenAI()
toolset = ComposioToolset()


# Create Entity
entity = toolset.client.sdk.get_entity(entity_id="default")  # get the entity


# Setup openai assistant
assistant_instruction = (
    "You are a super intelligent personal assistant."
    + "You have been given a set of tools that you are supposed to choose from."
    + "You decide the right tool and execute it."
)

actions = toolset.get_actions(
    actions=[
        # Action.GOOGLECALENDAR_FIND_EVENT,
        Action.NOTION_ADD_NOTION_PAGE_CHILDREN,
        # Action.NOTION_SEARCH_NOTION_PAGE,
        # Action.NOTION_CREATE_NOTION_PAGE,
        # Action.NOTION_FETCH_NOTION_BLOCK,
        # Action.NOTION_FETCH_NOTION_CHILD_BLOCK,
    ]
)

# print("Actions: ", actions)

assistant = client.beta.assistants.create(
    name="Personal Assistant",
    instructions=assistant_instruction,
    model="gpt-4-turbo-preview",
    tools=actions,
)

# Give a task to execute via Openai Assistants
my_task = f"""Can you copy all the events in coming week from google calendar to notion? Today's date is {datetime.now()} and day is {datetime.now().strftime('%A')}"""

# create a thread
thread = client.beta.threads.create()
print("Thread ID: ", thread.id)
print("Assistant ID: ", assistant.id)

# start the asssitant with my task
message = client.beta.threads.messages.create(
    thread_id=thread.id,
    role="user",
    content=my_task,
)

# Execute Agent with intergrations
# start the execution
run = client.beta.threads.runs.create(
    thread_id=thread.id,
    assistant_id=assistant.id,
)

run_after_tool_calls = toolset.wait_and_handle_assistant_tool_calls(
    client=client, run=run, thread=thread, verbose=True
)

print(run_after_tool_calls)
