# Step 1: Import necessary libraries
import os
from dotenv import load_dotenv
from typing import Dict

from composio_openai import Action, App, ComposioToolSet
from openai import OpenAI

from composio.client.collections import TriggerEventData

load_dotenv()


bot_id = os.getenv("SLACK_BOT_ID", "")
if bot_id == "":
    bot_id = input("Enter SLACK_BOT_ID:")
    os.environ["SLACK_BOT_ID"] = bot_id

# Configuration constants
BOT_USER_ID = os.environ[
    "SLACK_BOT_ID"
]  # This is the bot ID of Composio. You can create your own bot by using slack developer platform.
RESPOND_ONLY_IF_TAGGED = (
    True  # IF you want the bot to respond only when tagged, set this to True
)

# Step 2: Initialize clients and toolsets
# Initialize OpenAI client
openai_client = OpenAI()

# Initialize Composio OpenAI toolset
# This toolset provides integration between Composio and OpenAI Assistant Framework
composio_toolset = ComposioToolSet()
codeinterpreter_tools = composio_toolset.get_tools(
    apps=[App.CODEINTERPRETER, App.EXA, App.FIRECRAWL, App.TAVILY]
)

# Step 3: Create Composio listener
# This listener will handle incoming Slack events or any triggers for Composio
listener = composio_toolset.create_trigger_listener()


# Step 4: Define a callback for new messages in a channel
@listener.callback(
    filters={"trigger_name": "slackbot_receive_message"}
)  # "SLACKBOT_RECEIVE_MESSAGE" is the trigger name for new messages in a channel.
def callback_new_message(event: TriggerEventData) -> None:
    """
    Callback function for new messages in a channel.

    Args:
        event (TriggerEventData): The event data from Slack.
    """
    print("Received new message event")
    # printing trigger name
    print(event.metadata.triggerName)
    process_message(event, is_new_message=True)


# Step 5: Define a callback for messages in a thread
@listener.callback(
    filters={
        "trigger_name": "slackbot_receive_thread_reply",  # "SLACKBOT_RECEIVE_THREAD_REPLY" is the trigger name for messages in a thread,
    }  # i.e. replies to a message.
)
def callback_thread_message(event: TriggerEventData) -> None:
    """
    Callback function for messages in a thread, i.e. replies to a message.

    Args:
        event (TriggerEventData): The event data from Slack.
    """
    print("Received thread message event")
    process_message(event, is_new_message=False)


# Step 5: Define message processing function
def process_message(event: TriggerEventData, is_new_message: bool) -> None:
    """
    Process incoming Slack messages.

    Args:
        event (TriggerEventData): The event data from Slack.
        is_new_message (bool): Whether this is a new message or part of a thread.
    """
    # Extract message details from the event payload
    print("Recieved new messsage")
    payload = event.payload
    user_id = payload.get("user", "")

    # Ignore messages from the bot itself to prevent self-responses
    if user_id == BOT_USER_ID:
        return "Bot ignored"

    message = payload.get("text", "")

    # Respond only if the bot is tagged in the message, if configured to do so
    if RESPOND_ONLY_IF_TAGGED and f"<@{BOT_USER_ID}>" not in message:
        print(f"Bot not tagged, ignoring message - {message} - {BOT_USER_ID}")
        return (
            f"Bot not tagged, ignoring message - {json.dumps(payload)} - {BOT_USER_ID}"
        )

    # Extract channel and timestamp information from the event payload
    channel_id = payload.get("channel", "")
    ts = payload.get("ts", "")
    thread_ts = payload.get("thread_ts", ts)
    # Handle OpenAI thread creation or retrieval
    if is_new_message:
        thread = openai_client.beta.threads.create()
        active_threads[ts] = thread.id
    else:
        thread_id = active_threads.get(thread_ts)
        if not thread_id:
            print("No active thread found for this message")
            return
        thread = openai_client.beta.threads.retrieve(thread_id=thread_id)

    # Process message with OpenAI
    response = run_openai_thread(thread.id, message)

    # Send response using Composio
    # This is a simple action execution, you can also use composio_client.execute_action()
    composio_toolset.execute_action(
        action=Action.SLACKBOT_CHAT_POST_MESSAGE,
        params={
            "channel": channel_id,
            "text": response,
            "thread_ts": thread_ts,
        },
    )


# Step 6: Set up OpenAI components
# Dictionary to keep track of active threads
active_threads: Dict[str, str] = {}

# Create OpenAI assistant
assistant = openai_client.beta.assistants.create(
    name="Github Assistant",
    description="An assistant to help you with your github",
    instructions="You are an assistant that can help you with your github",
    model="gpt-4o",
    tools=codeinterpreter_tools,
)


# Step 7: Define OpenAI thread processing function
def run_openai_thread(thread_id: str, message: str) -> str:
    """
    Process a message using OpenAI's thread and assistant.

    Args:
        thread_id (str): The ID of the OpenAI thread.
        message (str): The user's message to process.

    Returns:
        str: The assistant's response.
    """
    print(f"Running OpenAI thread with ID: {thread_id} and message: {message}")

    # Create a message in the thread
    openai_client.beta.threads.messages.create(
        thread_id=thread_id, role="user", content=message
    )

    # Create a run in the thread
    run = openai_client.beta.threads.runs.create(
        thread_id=thread_id, assistant_id=assistant.id
    )

    thread = openai_client.beta.threads.retrieve(thread_id=thread_id)

    # Wait for the assistant to respond and handle any tool calls
    composio_toolset.wait_and_handle_assistant_tool_calls(
        client=openai_client, run=run, thread=thread
    )

    # Get the messages from the thread
    messages = openai_client.beta.threads.messages.list(
        thread_id=thread_id, limit=5, run_id=run.id
    )

    # Extract the assistant's response
    openai_response = "No response generated"
    if messages.data:
        for message_response in messages.data:
            for content in message_response.content:
                openai_response = content.text.value
                break
            if openai_response != "No response generated":
                break

    # Generate a URL for viewing the thread in OpenAI's playground
    url = f"https://platform.openai.com/playground/assistants?assistant={assistant.id}&thread={thread_id}"
    print("Visit this URL to view the thread: ", url)
    return openai_response


# Step 8: Start the Composio listener
print("Listener started!")
listener.listen()
