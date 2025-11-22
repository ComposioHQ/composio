from composio import Composio
from composio_langchain import LangchainProvider
from langchain.agents import create_agent
from langchain_openai import ChatOpenAI

# Initialize tools.
openai_client = ChatOpenAI(model="gpt-4o")

composio = Composio(provider=LangchainProvider())

# Get All the tools
tools = composio.tools.get(user_id="default", toolkits=["GITHUB"])

# Define task
task = "Star a repo composiohq/composio on GitHub"

# Define agent
agent = create_agent(
    model=openai_client,
    tools=tools,
    system_prompt="You are a helpful assistant.",
    name="GitHub Agent"
)

# Execute using agent
result = agent.invoke(
    {"messages": [{"role": "user", "content": task}]}
)
