import os
from dotenv import load_dotenv
from composio_crewai import Action, ComposioToolSet, App
from composio.client.exceptions import NoItemsFound
from crewai import Agent, Crew, Task, Process
from langchain_openai import ChatOpenAI
load_dotenv()

openai_api_key = os.getenv('OPENAI_API_KEY')
composio_api_key = os.getenv('COMPOSIO_API_KEY')

llm = ChatOpenAI(model="gpt-4o")

def index_code(dir_path: str, embedding_type: str, force_index: bool) -> str:
    composio_toolset = ComposioToolSet(
        api_key=composio_api_key,
        metadata={
        App.CODE_ANALYSIS_TOOL: {
            "dir_to_index_path" : dir_path,
        },  
    })
    tools = composio_toolset.get_tools(actions=[Action.CODE_ANALYSIS_TOOL_CREATE_CODE_MAP])
    indexing_agent = Agent(
        role="Indexing Agent",
        goal="Index the code in the given directory",
        backstory="You're an AI assistant that indexes code for easy retrieval and search.",
        verbose=True,
        llm=llm,
        tools=tools,
        allow_delegation=False,
    )

    task_description = f"""
    1. Index the code in the following directory:
       "{dir_path}"
    2. Use the embedding type: "{embedding_type}"
    3. Force index: {"Yes" if force_index else "No"}
    4. Return the index ID of the indexed code.
    """

    process_indexing_request = Task(
        description=task_description,
        agent=indexing_agent,
        expected_output="The index ID of the indexed code.",
    )

    indexing_processing_crew = Crew(
        agents=[indexing_agent],
        tasks=[process_indexing_request],
        verbose=1,
        process=Process.sequential,
    )
    
    result = indexing_processing_crew.kickoff()
    return result

def find_code_snippet(dir_path: str, query: str) -> str:
    composio_toolset = ComposioToolSet(
    api_key=composio_api_key,
    metadata={
    App.CODE_ANALYSIS_TOOL:{
            "dir_to_index_path" : dir_path,
        }
    })
    tools = composio_toolset.get_tools(actions=[Action.CODE_ANALYSIS_TOOL_GET_RELEVANT_CODE])
    search_agent = Agent(
        role="Search Agent",
        goal="Search the code in the given directory for the provided query",
        backstory="You're an AI assistant that searches code for relevant snippets based on a query.",
        verbose=False,
        llm=llm,
        tools=tools,
        allow_delegation=False,
    )

    task_description = f"""
    1. Search the code in the following directory:
       "{dir_path}"
    2. Search for the following query: "{query}"
    3. Return the relevant code snippet.
    """

    process_search_request = Task(
        description=task_description,
        agent=search_agent,
        expected_output="The relevant code snippet.",
    )

    search_processing_crew = Crew(
        agents=[search_agent],
        tasks=[process_search_request],
        verbose=0,
        process=Process.sequential,
    )
    
    result = search_processing_crew.kickoff()
    return result

