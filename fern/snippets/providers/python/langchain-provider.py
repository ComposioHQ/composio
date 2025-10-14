from composio import Composio
from composio_langchain import LangchainProvider
from langchain import hub  # type: ignore
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_openai import ChatOpenAI

# Pull relevant agent model.
prompt = hub.pull("hwchase17/openai-functions-agent")

# Initialize tools.
openai_client = ChatOpenAI(model="gpt-5")

composio = Composio(provider=LangchainProvider())

# Get All the tools
tools = composio.tools.get(user_id="default", toolkits=["GITHUB"])

# Define task
task = "Star a repo composiohq/composio on GitHub"

# Define agent
agent = create_openai_functions_agent(openai_client, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# Execute using agent_executor
agent_executor.invoke({"input": task})
