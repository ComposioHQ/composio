from langchain_openai import ChatOpenAI
from langchain.agents import create_openai_functions_agent, AgentExecutor
from langchain import hub
from langchain_openai import ChatOpenAI
from composio_langchain import ComposioToolSet, App
from cdp_langchain.agent_toolkits import CdpToolkit
from cdp_langchain.utils import CdpAgentkitWrapper
import os
from dotenv import load_dotenv
from pathlib import Path
import time

load_dotenv()


llm = ChatOpenAI(model="gpt-4o")

toolset = ComposioToolSet()

tools = toolset.get_tools(apps=[
    App.COINBASE,
    App.EXA,
    App.FILETOOL
])


prompt = hub.pull("hwchase17/openai-functions-agent")
agent = create_openai_functions_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

agent_executor.invoke({"input": 'Find existing Wallet on Base Mainnet, Get its details including wallet_id, seed, and default_address_id, store it in the wallet_data.txt file in this format: {"wallet_id": "", "seed": "", "default_address_id": ""}'})

# Get the current file's directory and construct the correct path to wallet_data.txt
current_dir = Path(__file__).parent
wallet_data_file = current_dir / "wallet_data.txt"

try:
    with open(wallet_data_file) as f:
        wallet_data = f.read()
except FileNotFoundError:
    print(f"Could not find wallet data file at: {wallet_data_file}")
    wallet_data = None

os.environ['NETWORK_ID'] = 'base-mainnet'

# Configure CDP Agentkit Langchain Extension.
values = {}
if wallet_data is not None:
    # If there is a persisted agentic wallet, load it and pass to the CDP Agentkit Wrapper.
    values = {"cdp_wallet_data": wallet_data}
# Initialize CDP wrapper
cdp = CdpAgentkitWrapper()

# Create toolkit from wrapper
toolkit = CdpToolkit.from_cdp_agentkit_wrapper(cdp)
cdp_toolkit = toolkit.get_tools()

cdp_toolkit.extend(tools)

agent = create_openai_functions_agent(llm, cdp_toolkit, prompt)
agent_executor = AgentExecutor(agent=agent, tools=cdp_toolkit, verbose=True)

POLLING_INTERVAL = 60  # Poll every 60 seconds

print("Starting trading poll...")
while True:
    try:
        print(f"Executing trade at {time.strftime('%Y-%m-%d %H:%M:%S')}")
        agent_executor.invoke({"input": "Check the prices of USDC and ETH on Base Mainnet and perform a trade between 0.01 ETH and USDC or 0.01 USDC and ETH if the price is favorable on Base Mainnet"})
    except Exception as e:
        print(f"Error during trade execution: {e}")
    
    print(f"Waiting {POLLING_INTERVAL} seconds before next trade...")
    time.sleep(POLLING_INTERVAL)





