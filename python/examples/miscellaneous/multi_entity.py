import os
import time
from composio_langchain import Action, App, ComposioToolSet
from langchain import hub  # type: ignore
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_openai import ChatOpenAI
import json
import typing as t
from langchain_core.tools import StructuredTool

# Initialize tools.
openai_client = ChatOpenAI(model="gpt-4-turbo")

# Pull relevant agent model.
prompt = hub.pull("hwchase17/openai-functions-agent")

def initialize_listennotes(entity_id: str, toolset: ComposioToolSet, listennotes_api_key: str) -> t.Optional[t.Sequence[StructuredTool]]:
    try:
        entity = toolset.get_entity(id=entity_id)
        try:
            entity.get_connection(app=App.LISTENNOTES)
        except Exception as e:
            print("Exception in getting connection", e)
            auth_config = {"api_key": listennotes_api_key}

            connection_request = entity.initiate_connection(
                app_name=App.LISTENNOTES,
                auth_mode="API_KEY",
                auth_config=auth_config,
            )
            print("Connection request initiated")

            connected_account = connection_request.wait_until_active(
                client=toolset.client,
            )

            if not connected_account:
                print("Failed to establish a connection with ListenNotes tool")
                return None

        listennotes_tool = toolset.get_tools(
            actions=[Action.LISTENNOTES_FETCH_A_LIST_OF_SUPPORTED_LANGUAGES_FOR_PODCASTS],
        )
        return listennotes_tool

    except Exception as e:
        print("Exception in initializing serpapi tool", e)
        try:
            error_data = json.loads(str(e))

            status = error_data.get("status")
            message = error_data.get("message")

            print(f"Error initializing SerpApi tool\n\nStatus: {status}\n\nMessage: {message}")
            return None
        except json.JSONDecodeError:
            print(f"Error initializing SerpApi tool\n\n{e}")
            return None
        
if __name__ == "__main__":
    toolset = ComposioToolSet()
    listennotes_api_key = os.environ.get("LISTENNOTES_API_KEY")
    if not listennotes_api_key:
        raise ValueError("LISTENNOTES_API_KEY is not set")
    
    # Generate a timestamp-based entity ID
    timestamp_entity_id = f"entity_{int(time.time())}"
    
    listennotes_tools = initialize_listennotes(entity_id=timestamp_entity_id, toolset=toolset, listennotes_api_key=listennotes_api_key)
    # Define task
    task = "Fetch a list of supported languages for podcasts"

    # Define agent
    agent = create_openai_functions_agent(openai_client, listennotes_tools or [], prompt)
    agent_executor = AgentExecutor(agent=agent, tools=listennotes_tools or [], verbose=True)

    # Execute using agent_executor
    agent_executor.invoke({"input": task})
    