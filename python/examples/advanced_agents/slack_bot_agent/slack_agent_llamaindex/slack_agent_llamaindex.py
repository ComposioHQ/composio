# Import necessary libraries
import os
from dotenv import load_dotenv
from composio_llamaindex import Action, App, ComposioToolSet
from composio.client.collections import TriggerEventData
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI

load_dotenv()


bot_id = os.getenv("SLACK_BOT_ID", "")
if bot_id == "":
    bot_id = input("Enter SLACK_BOT_ID:")
    os.environ["SLACK_BOT_ID"] = bot_id

llm = OpenAI(model="gpt-4o")

# Bot configuration constants
BOT_USER_ID = os.environ[
    "SLACK_BOT_ID"
]  # Bot ID for Composio. Replace with your own bot member ID, once bot joins the channel.
RESPOND_ONLY_IF_TAGGED = (
    True  # Set to True to have the bot respond only when tagged in a message
)

# Initialize the Composio toolset for integration with OpenAI Assistant Framework
composio_toolset = ComposioToolSet()
composio_tools = composio_toolset.get_tools(
    apps=[App.CODEINTERPRETER, App.EXA, App.FIRECRAWL, App.TAVILY]
)

# Create a listener to handle Slack events and triggers for Composio
listener = composio_toolset.create_trigger_listener()

# Define the Crew AI agent with specific role, goal, and backstory
prefix_messages = [
    ChatMessage(
        role="system",
        content=(
            "You are now a integration agent, and what  ever you are requested, you will try to execute utilizing your toools."
        ),
    )
]

agent = FunctionCallingAgentWorker(
    tools=composio_tools,
    llm=llm,
    prefix_messages=prefix_messages,
    max_function_calls=10,
    allow_parallel_tool_calls=False,
    verbose=True,
).as_agent()


# Callback function for handling new messages in a Slack channel
@listener.callback(filters={"trigger_name": "slackbot_receive_message"})
def callback_new_message(event: TriggerEventData) -> None:
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
    # Process the message and post the response in the same channel or thread
    result = agent.chat(message)
    print(result)
    composio_toolset.execute_action(
        action=Action.SLACKBOT_CHAT_POST_MESSAGE,
        params={
            "channel": channel_id,
            "text": result.response,
            "thread_ts": thread_ts,
        },
    )


listener.listen()
