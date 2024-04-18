# Initialise imports
from composio import App
from composio_langchain import ComposioSDK, ComposioToolset
from langchain_openai import ChatOpenAI

from langchain import hub
from langchain.agents import AgentExecutor, create_openai_functions_agent

llm = ChatOpenAI()

prompt = hub.pull("hwchase17/openai-functions-agent")

# Import from composio_langchain

entity_id = "soham"
entity = ComposioSDK.get_entity(entity_id)
if not entity.is_app_authenticated(App.GITHUB):
    request = entity.initiate_connection(App.GITHUB, redirect_url="https://google.com")
    print(f"Please authenticate {App.GITHUB} in the browser and come back here. URL: {request.redirectUrl}")
    request.wait_until_active()
else:
    print(f"Entity {entity_id} is already authenticated with GitHub")
# Get All the tools
tools = ComposioToolset(apps=[App.GITHUB], entity_id=entity_id)


task = "Star a repo SamparkAI/docs on GitHub"

agent = create_openai_functions_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# Execute using agent_executor
agent_executor.invoke({"input": task})
