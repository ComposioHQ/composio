from dotenv import load_dotenv
from composio_crewai import ComposioToolSet
from composio import App
from crewai import Agent, Crew, Process, Task
from langchain_google_genai import ChatGoogleGenerativeAI


# Load the environment variables
load_dotenv()

# Initialize the language model
llm = ChatGoogleGenerativeAI(model="gemini-pro", temperature=0.1)

# Define tools for the agents
# We are using Reddit tool from composio.
composio_toolset = ComposioToolSet()
tools = composio_toolset.get_tools(apps=[App.REDDIT])


# Create and Execute Agent.
def run_crew():
    reddit_agent = Agent(
        role="Reddit Agent",
        goal="""You take action on Reddit using Reddit APIs""",
        backstory="""You are an AI agent responsible for taking actions on Reddit on users' behalf. 
        You need to take action on Reddit using Reddit APIs. Use correct tools to run APIs from the given tool-set.""",
        verbose=True,
        tools=tools,
        llm=llm,
    )

    filter_task = Task(
        description="Fetch newest 1 post from python on fastapi",
        agent=reddit_agent,
        expected_output="1 post from python on fastapi",
    )

    comment_task = Task(
        description="Comment on the post fetched from python on fastapi",
        agent=reddit_agent,
        expected_output="Success",
    )

    my_crew = Crew(
        agents=[reddit_agent],
        tasks=[filter_task, comment_task],
        process=Process.sequential,
        full_output=True,
        verbose=True,
    )

    my_crew.kickoff()


if __name__ == "__main__":
    run_crew()
