from datetime import datetime

from composio_openai import OpenAIProvider
from openai import OpenAI

from composio import Composio

# Initialize tools.
openai_client = OpenAI()
composio = Composio(provider=OpenAIProvider())

# Retrieve actions
actions = composio.tools.get(
    user_id="default",
    tools=["NOTION_ADD_PAGE_CONTENT"],
)

# Setup openai assistant
assistant_instruction = (
    "You are a super intelligent personal assistant."
    + "You have been given a set of tools that you are supposed to choose from."
    + "You decide the right tool and execute it."
)
# Prepare assistant
assistant = openai_client.beta.assistants.create(
    name="Personal Assistant",
    instructions=assistant_instruction,
    model="gpt-5",
    tools=actions,  # type: ignore
)

# Give a task to execute via Openai Assistants
my_task = (
    f"Can you copy all the events in coming week from google calendar to notion? "
    f"Today's date is {datetime.now()} and day is {datetime.now().strftime('%A')}"
)

# create a thread
thread = openai_client.beta.threads.create()
print("Thread ID: ", thread.id)
print("Assistant ID: ", assistant.id)

# start the asssitant with my task
message = openai_client.beta.threads.messages.create(
    thread_id=thread.id,
    role="user",
    content=my_task,
)

# Execute Agent with integrations
run = openai_client.beta.threads.runs.create(
    thread_id=thread.id,
    assistant_id=assistant.id,
)

# Execute function calls
run_after_tool_calls = composio.provider.wait_and_handle_assistant_tool_calls(
    user_id="default",
    client=openai_client,
    run=run,
    thread=thread,
)

print(run_after_tool_calls)
