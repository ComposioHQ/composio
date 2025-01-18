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

tools = toolset.get_tools(actions=[get_balance, send_sol, get_transaction_status, request_airdrop])

llm = OpenAI(model="gpt-4o")

# Setup chatbot-style prefix messages
def create_prefix_message():
    return [
        ChatMessage(
            role="system",
            content=(
              "You are a solana agent"
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

my_wallet_address = os.getenv('SOLANA_WALLET_ADDRESS')
response = agent.chat(f"""Get the balance of my wallet {my_wallet_address}""")

print(response)