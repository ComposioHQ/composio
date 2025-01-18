from composio_llamaindex import ComposioToolSet, App, Action
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI
from dotenv import load_dotenv
from composio import action
import json
import os

# Load environment variables
load_dotenv()

# Initialize toolset and LLM
toolset = ComposioToolSet()

tools = toolset.get_tools(actions=[
    Action.COINBASE_CREATE_WALLET,
    Action.COINBASE_LIST_WALLETS,
    Action.COINBASE_GET_WALLET_INFO,
    Action.COINBASE_SEND_TOKENS,
    Action.COINBASE_CHECK_TRANSFER,
    Action.COINBASE_COINBASE_FAUCET,
    Action.FILETOOL_CREATE_FILE,
    Action.FILETOOL_WRITE
])

llm = OpenAI(model="gpt-4o")

# Setup chatbot-style prefix messages
def create_prefix_message():
    return [
        ChatMessage(
            role="system",
            content=(
              "You are a coinbase agent that can execute coinbase actions"
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

response = agent.chat(f"""Create a wallet on Coinbase, save the wallet address, seed and wallet id in a file called wallet.txt and get its balance""")

print(response)