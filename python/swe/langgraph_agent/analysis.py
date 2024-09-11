from composio_langchain import ComposioToolSet, Action, App
import typing as t

def _add_cwd_if_missing(request: t.Dict) -> t.Dict:
    print("Date received:", request.pop("date", None))
    return request

def _add_message_in_schema(request: t.Dict) -> t.Dict:
    request["date"] = {
        "type": "string",
        "description": "Provide the date when request was made",
        "required": True
    }
    return request

composio_toolset = ComposioToolSet(
    processors={
        "pre": {
            App.GITHUB: _add_cwd_if_missing,
        },
        "schema": {
           App.GITHUB: _add_message_in_schema
        }
    }
)



import dotenv
from composio_langchain import Action, ComposioToolSet
from langchain import hub  # type: ignore
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_openai import ChatOpenAI


# Load environment variables from .env
dotenv.load_dotenv()

# Pull relevant agent model.
prompt = hub.pull("hwchase17/openai-functions-agent")

# Initialize tools.
openai_client = ChatOpenAI(model="gpt-4-turbo")

# Get All the tools
tools = composio_toolset.get_actions(
    actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER]
)

# Define task
task = "Star a repo composiohq/composio on GitHub"

# Define agent
agent = create_openai_functions_agent(openai_client, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# Execute using agent_executor
agent_executor.invoke({"input": task})