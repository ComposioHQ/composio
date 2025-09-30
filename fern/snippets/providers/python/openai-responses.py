from openai import OpenAI
from composio import Composio
from composio_openai import OpenAIProvider

# Initialize Composio with OpenAI Provider
composio = Composio(provider=OpenAIProvider())
openai_client = OpenAI()

# Use a unique external ID for each of your users
user_id = "user-dev-178"

# Fetch tools for the assistant
tools = composio.tools.get(
    user_id=user_id,
    toolkits=["GITHUB", "SLACK"]
)

# Create an OpenAI assistant with Composio tools
assistant = openai_client.beta.assistants.create(
    name="Developer Assistant",
    instructions="You are a helpful assistant that can interact with GitHub and Slack.",
    model="gpt-4-turbo",
    tools=tools  # Composio tools are directly compatible
)

# Create a thread
thread = openai_client.beta.threads.create()

# Add a message to the thread
message = openai_client.beta.threads.messages.create(
    thread_id=thread.id,
    role="user",
    content="Create a GitHub issue about the new feature we discussed"
)

# Run the assistant
run = openai_client.beta.threads.runs.create(
    thread_id=thread.id,
    assistant_id=assistant.id
)

# Handle tool calls and wait for completion
run_after_tool_calls = composio.provider.wait_and_handle_assistant_tool_calls(
    user_id=user_id,
    client=openai_client,
    run=run,
    thread=thread
)

# Get the assistant's response
messages = openai_client.beta.threads.messages.list(thread_id=thread.id)
print(messages.data[0].content[0].text.value)