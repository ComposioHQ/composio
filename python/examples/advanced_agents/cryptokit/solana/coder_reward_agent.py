from composio_llamaindex import ComposioToolSet, App, Action
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI
from solana_kit import get_balance, send_sol, get_transaction_status, request_airdrop
from dotenv import load_dotenv
import json
import os

# Load environment variables
load_dotenv()

# Initialize toolset and LLM
toolset = ComposioToolSet()

tools = toolset.get_tools(actions=[get_balance, send_sol, get_transaction_status, request_airdrop, Action.GITHUB_LIST_REPOSITORY_CONTRIBUTORS])

llm = OpenAI(model="gpt-4o")

# Setup chatbot-style prefix messages
def create_prefix_message():
    return [
        ChatMessage(
            role="system",
            content=(
              "You are a solana agent that can execute actions with Solana Kit"
              "You have access to Github and can list repository contributors"
              "You can also get the github username of the contributor based on the github user id"
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

agent.chat("Find the most active contributor to the composiohq/composio repository and print their username.")
wallet_address = input("Enter the wallet address of the most active contributor: ")
private_key = os.getenv('SOLANA_PRIVATE_KEY')
my_wallet_address = os.getenv('SOLANA_WALLET_ADDRESS')
agent.chat(f"""send 1 SOL from my wallet {my_wallet_address}, my private key is {private_key} to {wallet_address} on devnet using send sol action""")