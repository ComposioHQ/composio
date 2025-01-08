from crewai import Agent, Task, Crew
from composio_crewai import ComposioToolSet, App, Action
from dotenv import load_dotenv
from get_balance import get_balance, search
load_dotenv()

toolset = ComposioToolSet()
get_balance_tool = toolset.get_tools(actions=[get_balance])
tools = toolset.get_tools(actions=[search, Action.SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL])

# Create an agent with code execution enabled
sol_agent = Agent(
    role="SOL Balance and Price Notifier",
    goal="Retrieve SOL balance using get_balance and internet search to get price, then send it to Slack General channel.",
    backstory="You are an agent specialized in monitoring SOL balance and price.",
)

# Create a task that requires code execution
sol_task = Task(
    description="Retrieve the SOL balance and wallet address is {wallet_address}",
    expected_output='SOL balance retrieved with get Balance and price retrieved using Tavily and sent on Slack Channel',
    agent=sol_agent,
    tools=get_balance_tool # type: ignore
)

# Create a task to get real-time price information of Solana
price_analysis_task = Task(
    description="Use Internet Search to get real-time price information of Solana and analyze it.",
    expected_output='Real-time price of Solana retrieved and analyzed.',
    agent=sol_agent,
    tools=tools # type: ignore
)

# Create a task to send the analyzed price information to Slack
send_price_info_task = Task(
    description="Send the analyzed real-time price information of Solana to the Slack General channel.",
    expected_output='Analyzed price information sent to Slack General channel.',
    agent=sol_agent,
    tools=tools # type: ignore
)

# Create a crew and add the task
analysis_crew = Crew(
    agents=[sol_agent],
    tasks=[sol_task, price_analysis_task],
    verbose=True
)

# Execute the crew
result = analysis_crew.kickoff(inputs={'wallet_address':'BHiAM94bZB9KKZhcVvx8mEVqdnaEANVmZ2XykZMSG8iB'})

print(result)
