import os
import time
from composio_langchain import Action, App, ComposioToolSet
from fastapi import params
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

def initialize_peopledatalabs(entity_id: str, toolset: ComposioToolSet, peopledatalabs_api_key: str) -> t.Optional[t.Sequence[StructuredTool]]:
    try:
        entity = toolset.get_entity(id=entity_id)
        try:
            entity.get_connection(app=App.PEOPLEDATALABS)
        except Exception as e:
            print("Exception in getting connection", e)
            auth_config = {"api_key": peopledatalabs_api_key}
            connection_request = entity.initiate_connection(
                app_name=App.PEOPLEDATALABS,
                auth_mode="API_KEY",
                auth_config=auth_config,
            )
            print("Connection request initiated")

            connected_account = connection_request.wait_until_active(
                client=toolset.client,
            )

            if not connected_account:
                print("Failed to establish a connection with PeopleDataLabs tool")
                return None

        peopledatalabs_tool = toolset.get_tools(
            actions=[Action.PEOPLEDATALABS_CLEAN_LOCATION_DATA],
            entity_id=entity_id,
        )
        return peopledatalabs_tool

    except Exception as e:
        print("Exception in initializing peopledatalabs tool", e)
        try:
            error_data = json.loads(str(e))

            status = error_data.get("status")
            message = error_data.get("message")

            print(f"Error initializing PeopleDataLabs tool\n\nStatus: {status}\n\nMessage: {message}")
            raise ValueError(f"Error initializing PeopleDataLabs tool\n\nStatus: {status}\n\nMessage: {message}")
        except json.JSONDecodeError:
            print(f"Error initializing PeopleDataLabs tool\n\n{e}")
            raise ValueError(f"Error initializing PeopleDataLabs tool\n\n{e}")
        
if __name__ == "__main__":
    toolset = ComposioToolSet()
    peopledatalabs_api_key = os.environ.get("PDL_API_KEY")
    if not peopledatalabs_api_key:
        raise ValueError("PDL_API_KEY is not set")
    
    # Generate a timestamp-based entity ID
    timestamp_entity_id = f"entity_{int(time.time())}"
    
    peopledatalabs_tools = initialize_peopledatalabs(entity_id=timestamp_entity_id, toolset=toolset, peopledatalabs_api_key=peopledatalabs_api_key)
    # Define task
    task = "Clean the location data for the following: sf"

    # Define agent
    agent = create_openai_functions_agent(openai_client, peopledatalabs_tools or [], prompt)
    agent_executor = AgentExecutor(agent=agent, tools=peopledatalabs_tools or [], verbose=True)

    # Execute using agent_executor
    agent_executor.invoke({"input": task})
    