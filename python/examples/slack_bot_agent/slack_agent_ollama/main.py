# Import necessary libraries
import os
from dotenv import load_dotenv
from composio_langchain import Action, App, ComposioToolSet
from langchain import hub
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_openai import ChatOpenAI
from composio.client.collections import TriggerEventData

load_dotenv()
# LangChain supports many other chat models. Here, we're using Ollama
from langchain.chat_models import ChatOllama

llm = ChatOllama(model="mistral")
bot_id = os.getenv("SLACK_BOT_ID", "")
if bot_id == "":
    bot_id = input("Enter SLACK_BOT_ID:")
    os.environ["SLACK_BOT_ID"] = bot_id

BOT_USER_ID = os.environ[
    "SLACK_BOT_ID"
]  # Bot ID for Composio. Replace with your own bot member ID, once bot joins the channel.
RESPOND_ONLY_IF_TAGGED = (
    True  # Set to True to have the bot respond only when tagged in a message
)
prompt = hub.pull("hwchase17/openai-functions-agent")


def main(inputs):
    # Initialize the Composio toolset for integration with OpenAI Assistant Framework
    composio_toolset = ComposioToolSet(api_key=os.environ["COMPOSIO_API_KEY"])
    entity = composio_toolset.client.get_entity(inputs["entityId"])
    composio_tools = composio_toolset.get_tools(
        apps=[App.CODEINTERPRETER, App.EXA, App.FIRECRAWL, App.TAVILY],
        entity_id=entity.id,
    )
    listener = composio_toolset.create_trigger_listener()

    query_agent = create_openai_functions_agent(llm, composio_tools, prompt)
    agent_executor = AgentExecutor(
        agent=query_agent, tools=composio_tools, verbose=True
    )

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
            return f"Bot not tagged, ignoring message - {json.dumps(payload)} - {BOT_USER_ID}"

        # Extract channel and timestamp information from the event payload
        channel_id = payload.get("channel", "")
        ts = payload.get("ts", "")
        thread_ts = payload.get("thread_ts", ts)
        # Process the message and post the response in the same channel or thread
        result = agent_executor.invoke({"input": message})
        print(result)
        composio_toolset.execute_action(
            action=Action.SLACKBOT_CHAT_POST_MESSAGE,
            params={
                "channel": channel_id,
                "text": result["output"],
                "thread_ts": thread_ts,
            },
        )
        print(
            "Listener has started listening, send a message in the following format on your slack channel: @testapp <MESSAGE>"
        )
        listener.listen()


if __name__ == "__main__":
    inputs = {
        "entityId": "hellll",
    }
    main(inputs)
