
from openai import OpenAI
import os
from dotenv import load_dotenv
from composio_openai import ComposioToolSet, App, Action

load_dotenv()

openai_client = OpenAI(
api_key=os.getenv("OPENAI_API_KEY")
)

# Initialise the Composio Tool Set

composio_tool_set = ComposioToolSet()

# Get GitHub tools that are pre-configured
actions = composio_tool_set.get_actions(
actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER]
)

my_task = "Star a repo composiodev/composio on GitHub"

# Setup openai assistant
assistant_instruction = "You are a super intelligent personal assistant"

assistant = openai_client.beta.assistants.create(
name="Personal Assistant",
instructions=assistant_instruction,
model="gpt-4-turbo",
tools=actions,
)

# create a thread
thread = openai_client.beta.threads.create()

message = openai_client.beta.threads.messages.create(
thread_id=thread.id,
role="user",
content=my_task
)

# Execute Agent with integrations
run = openai_client.beta.threads.runs.create(
thread_id=thread.id,
assistant_id=assistant.id
)


# Execute Function calls
response_after_tool_calls = composio_tool_set.wait_and_handle_assistant_tool_calls(
client=openai_client,
run=run,
thread=thread,
)

print(response_after_tool_calls)