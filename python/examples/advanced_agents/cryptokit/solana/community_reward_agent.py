from composio_llamaindex import ComposioToolSet, App, Action
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI
from solana_kit import get_balance, send_sol, get_transaction_status, request_airdrop
from dotenv import load_dotenv
import json
import os
import datetime

date = datetime.datetime.now().strftime("%Y-%m-%d")

# Load environment variables
load_dotenv()

# Initialize toolset and LLM
toolset = ComposioToolSet()

tools = toolset.get_tools(actions=[get_balance, send_sol, get_transaction_status, request_airdrop, Action.SLACK_FETCH_CONVERSATION_HISTORY, Action.SLACK_LIST_ALL_SLACK_TEAM_CHANNELS_WITH_VARIOUS_FILTERS, Action.SLACK_LIST_ALL_SLACK_TEAM_USERS_WITH_PAGINATION, Action.SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL])

llm = OpenAI(model="gpt-4o")

# Setup chatbot-style prefix messages
def create_prefix_message():
    return [
        ChatMessage(
            role="system",
            content=(
              "You are a solana agent that can execute actions with Solana Kit"
              "You also have access to Slack and can fetch conversation history and get channel id based on the channel name. You can also get username based on the user id by fetching all users in the slack team. Your job is to find out the most active community member and reward them with 1 SOL"
            ),
        )
    ]

prefix_messages = create_prefix_message()

# Initialize the agent
agent = FunctionCallingAgentWorker(
    tools=tools, # type: ignore
    llm=llm,
    prefix_messages=prefix_messages,
    max_function_calls=20,
    allow_parallel_tool_calls=False,
    verbose=True,
).as_agent()

community_channel_name = input("Enter the name of the slack channel: ")
response = agent.chat(f"""Find only the most active community member this week from the slack channel {community_channel_name} and then print their slack name. The date today is {date}""")
print(response)
wallet_address = input("Enter the wallet address of the most active community member: ")
private_key = os.getenv('SOLANA_PRIVATE_KEY')
my_wallet_address = os.getenv('SOLANA_WALLET_ADDRESS')
agent.chat(f"""send 1 SOL from my wallet {my_wallet_address}, my private key is {private_key} to {wallet_address} on devnet using send sol action and then check transaction status twice/thrice after 5 seconds of the transaction using get transaction status action. After the the transaction is confirmed, send a message to the slack channel {community_channel_name} with the username of the most active community member announcing that they are the most active community member this week and congratulate them and tell them they have been rewarded with 1 SOL""")