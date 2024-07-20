# Import necessary libraries
import os
from dotenv import load_dotenv
from autogen.agentchat import AssistantAgent, UserProxyAgent
from composio_autogen import Action, App, ComposioToolSet
from composio.client.collections import TriggerEventData

load_dotenv()

api_key = os.getenv("OPENAI_API_KEY", "")
if api_key == "":
    api_key = input("Enter OpenAI api key:")
    os.environ["OPENAI_API_KEY"] = api_key

bot_id = os.getenv("SLACK_BOT_ID", "")
if bot_id == "":
    bot_id = input(
        "Enter Slack Bot id on your slack, check the readme to know how to find the bot id:"
    )
    os.environ["SLACK_BOT_ID"] = bot_id


llm_config = {
    "config_list": [{"model": "gpt-4o", "api_key": os.environ["OPENAI_API_KEY"]}]
}

chatbot = AssistantAgent(
    "chatbot",
    system_message="Reply TERMINATE when the task is done or when user's content is empty",
    llm_config=llm_config,
)

user_proxy = UserProxyAgent(
    "user_proxy",
    is_termination_msg=lambda x: x.get("content", "")
    and "TERMINATE" in x.get("content", ""),
    human_input_mode="NEVER",
    code_execution_config={"use_docker": False},
)
# Bot configuration constants
# Bot ID changes for each slack user, check the bot id @test_app on slack and change it accordingly
BOT_USER_ID = os.environ[
    "SLACK_BOT_ID"
]  # Bot ID for Composio. Replace with your own bot member ID, once bot joins the channel.
RESPOND_ONLY_IF_TAGGED = (
    True  # Set to True to have the bot respond only when tagged in a message
)

# Initialize the Composio toolset for integration with OpenAI Assistant Framework
composio_toolset = ComposioToolSet()

composio_toolset.register_tools(
    tools=[App.CODEINTERPRETER, App.EXA, App.FIRECRAWL, App.TAVILY],
    caller=chatbot,
    executor=user_proxy,
)

# Create a listener to handle Slack events and triggers for Composio
listener = composio_toolset.create_trigger_listener()


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
    task = message
    result = user_proxy.initiate_chat(chatbot, message=task)

    print(result)
    composio_toolset.execute_action(
        action=Action.SLACKBOT_CHAT_POST_MESSAGE,
        params={
            "channel": channel_id,
            "text": result.summary,
            "thread_ts": thread_ts,
        },
    )


listener.listen()
