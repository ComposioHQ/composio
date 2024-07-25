import os
import json
from dotenv import load_dotenv
from composio_langchain import Action, App, ComposioToolSet
from langchain import hub
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_openai import ChatOpenAI
from composio.client.collections import TriggerEventData
from langchain_openai import ChatOpenAI

load_dotenv()


llm = ChatOpenAI(model="gpt-4o")

# Bot configuration constants
BOT_USER_ID = os.getenv(
    "BOT_USER_ID", ""
)  # Bot ID for Composio. Replace with your own bot member ID, once bot joins the channel.
if BOT_USER_ID == "":
    print("BOT USER ID NOT SET")
    bot_user_id = input("Enter Bot user id:")
    os.environ["BOT_USER_ID"] = bot_user_id

RESPOND_ONLY_IF_TAGGED = (
    True  # Set to True to have the bot respond only when tagged in a message
)

# Initialize the Composio toolset for integration with OpenAI Assistant Framework
composio_toolset = ComposioToolSet()
composio_tools = composio_toolset.get_tools(
    apps=[App.CODEINTERPRETER, App.EXA, App.FIRECRAWL, App.TAVILY]
)
prompt = hub.pull("hwchase17/openai-functions-agent")
# Create a listener to handle Slack events and triggers for Composio
listener = composio_toolset.create_trigger_listener()

query_agent = create_openai_functions_agent(llm, composio_tools, prompt)
agent_executor = AgentExecutor(agent=query_agent, tools=composio_tools, verbose=True)


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

    # return f"Bot not tagged, ignoring message - {json.dumps(payload)} - {BOT_USER_ID} - {channel_id} - {ts} - {thread_ts}"

    # Process the message and post the response in the same channel or thread
    result = agent_executor.invoke({"input": message})

    from composio_langchain import Action, App, ComposioToolSet

    composio_toolset = ComposioToolSet()
    composio_toolset.execute_action(
        action=Action.SLACKBOT_CHAT_POST_MESSAGE,
        entity_id="default",
        params={
            "channel": channel_id,
            "text": result["output"],
            "thread_ts": thread_ts,
        },
    )
    return result["output"]


listener.listen()
