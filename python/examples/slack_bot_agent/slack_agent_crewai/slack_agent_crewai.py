# Import necessary libraries
import os
from dotenv import load_dotenv
from composio_crewai import Action, App, ComposioToolSet
from crewai import Agent, Crew, Task
from composio.client.collections import TriggerEventData
from langchain_openai import ChatOpenAI

load_dotenv()

llm = ChatOpenAI(model="gpt-4-turbo")

# Bot configuration constants
BOT_USER_ID = "U06P2JKQN5B"  # Bot ID for Composio. Replace with your own bot member ID, once bot joins the channel.
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
crewai_agent = Agent(
    role="Assistant Agent",
    goal="Assist users by answering questions and performing tasks using integrated tools",
    backstory=("As an AI assistant, I am equipped with a suite of tools to help users"),
    verbose=True,
    tools=composio_tools,
    llm=llm,
)

task = Task(
    description="Respond to user queries and perform actions as requested. The question is: {message}",
    agent=crewai_agent,
    expected_output="Confirmation of the completed action or a well-informed response",
)

crew = Crew(agents=[crewai_agent], tasks=[task], verbose=2)


# Callback function for handling new messages in a Slack channel
@listener.callback(filters={"trigger_name": "slackbot_receive_message"})
def callback_new_message(event: TriggerEventData) -> None:
    payload = event.payload
    user_id = payload.get("event", {}).get("user", "")

    # Ignore messages from the bot itself to prevent self-responses
    if user_id == BOT_USER_ID:
        return

    message = payload.get("event", {}).get("text", "")

    # Respond only if the bot is tagged in the message, if configured to do so
    if RESPOND_ONLY_IF_TAGGED and f"<@{BOT_USER_ID}>" not in message:
        print("Bot not tagged, ignoring message")
        return

    # Extract channel and timestamp information from the event payload
    channel_id = payload.get("event", {}).get("channel", "")
    ts = payload.get("event", {}).get("ts", "")
    thread_ts = payload.get("event", {}).get("thread_ts", ts)

    # Process the message and post the response in the same channel or thread
    result = crew.kickoff(inputs={"message": message})
    print(result)
    composio_toolset.execute_action(
        action=Action.SLACKBOT_CHAT_POST_MESSAGE,
        params={
            "channel": channel_id,
            "text": result,
            "thread_ts": thread_ts,
        },
    )


listener.listen()
