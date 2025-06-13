import os
import dotenv
from composio_crewai import App, ComposioToolSet
from crewai import Agent, Task, Crew, LLM

dotenv.load_dotenv()
# Initialize the ComposioToolSet
toolset = ComposioToolSet()

# Get the RAG tool from the Composio ToolSet
tools = toolset.get_tools(apps=[App.SERPAPI])

llm = LLM(
    model="sambanova/Meta-Llama-3.1-405B-Instruct", 
    api_key=os.getenv("SAMBANOVA_API_KEY")
    )

# Create and Execute Agent.
def run_crew():
    web_search_agent = Agent(
        role="Web Search Agent",
        goal="""You take action on web search using SERPAPI API""",
        backstory="""You are an AI agent responsible for taking actions on SERPAPI web search. 
        You need to take action on SERPAPI. Use correct tools to answer the user question from the given tool-set.""",
        verbose=True,
        tools=tools,
        llm=llm,
        cache=False,
    )
    task = Task(
        description="Use web search to find information about SambaNova and its new chip called the RDU",
        agent=web_search_agent,
        expected_output="If answer is found",
    )
    crew = Crew(agents=[web_search_agent], tasks=[task])
    result = crew.kickoff()
    print(result)
    return "Crew run initiated", 200


run_crew()
