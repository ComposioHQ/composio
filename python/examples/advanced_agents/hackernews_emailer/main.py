from dotenv import load_dotenv
from openai import OpenAI
from composio_openai import ComposioToolSet, Action

load_dotenv()

openai_client = OpenAI()
composio_toolset = ComposioToolSet()

tools = composio_toolset.get_tools(actions=[Action.HACKERNEWS_GET_FRONTPAGE, Action.GMAIL_SEND_EMAIL])

receiver = input("Enter receiver's email: ")
task = "You are a Search Agent for Hackernews. Get the frontpage posts from hackernews and then send an email about it to " + receiver

assistant_instruction = "You are a super intelligent assistant"

assistant = openai_client.beta.assistants.create(
  name="Assistant",
  instructions=assistant_instruction,
  model="gpt-4o",
  tools=tools,
)

thread = openai_client.beta.threads.create()
message = openai_client.beta.threads.messages.create(thread_id=thread.id,role="user",content=task)

run = openai_client.beta.threads.runs.create(thread_id=thread.id,assistant_id=assistant.id)

response_after_tool_calls = composio_toolset.wait_and_handle_assistant_tool_calls(
    client=openai_client,
    run=run,
    thread=thread,
)

print("Executed functions:")
for tool in response_after_tool_calls.tools:
    print(tool.function.name)

messages = openai_client.beta.threads.messages.list(thread_id=thread.id)
for msg in messages:
    print(msg.content)
    break
