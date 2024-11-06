import os
from composio.client.collections import TriggerEventData
from composio_crewai import ComposioToolSet, Action
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
from typing import Any, Dict
from db.main import ChatDB
from chat.main import chatbot
import os

load_dotenv()
chat_id = os.getenv('CHAT_ID')


chat_db = ChatDB(db_path='./db/db.json')

load_dotenv()

llm = ChatOpenAI(model="gpt-4o")


# Trigger instance
composio_toolset = ComposioToolSet(api_key=os.environ.get("COMPOSIO_API_KEY"))
listener = composio_toolset.create_trigger_listener()

@listener.callback(filters={"trigger_name": "SLACKBOT_RECEIVE_MESSAGE"})
def callback_new_message(event: TriggerEventData) -> None:
    print("Received new message")
    payload = event.payload
    print(f"\n\npayload :: {payload}")
    try:
        # if its bot message, ignore
        bot_id = payload['bot_id']
        if(bot_id):
            return None
        
        # get user message & channel id
        message_text = payload['text']
        channel_id = payload['channel']

        # add message to db
        chat_db.add_message(chat_id, message_text, "user")
        messages = chat_db.get_chat(chat_id)['messages']
        response = chatbot(messages)


        composio_toolset.execute_action(
            action=Action.SLACKBOT_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL,
            params={"channel": channel_id, "text": response},
        )
    except Exception as e:
        print(f"Error accessing payload data: {e}")
    
    return "result"


print("Slack trigger listener activated!")
listener.listen()