from crewai import Agent, Task, Crew, Process
from composio_langchain import ComposioToolSet, Action, App
from langchain_google_genai import ChatGoogleGenerativeAI
import os

# Environment Setup
os.environ["SERPAPI_API_KEY"] = os.getenv("SERPAPI_API_KEY")

# Initialize the language model
llm = ChatGoogleGenerativeAI(
    model="gemini-pro", verbose=True, temperature=0.9, google_api_key=os.getenv("GOOGLE_API_KEY")
)

# Define tools for the agents
composiotoolset = ComposioToolSet()
tools = composiotoolset.get_actions(actions=[Action.SERPAPI_SEARCH])

# Define the Investment Researcher agent
researcher = Agent(
    role='Investment Researcher',
    goal='Use SERP to research the top 2 results based on the input given to you and provide a report',
    backstory="""
    You are an expert Investment researcher. Using the information given to you, conduct comprehensive research using
    various sources and provide a detailed report. Don't pass in location as an argument to the tool
    """,
    verbose=True,
    allow_delegation=True,
    tools=tools,
    llm=llm
)

# Define the Investment Analyst agent
analyser = Agent(
    role='Investment Analyst',
    goal='Analyse the stock based on information available to it, use all the tools',
    backstory="""
    You are an expert Investment Analyst. You research on the given topic and analyse your research for insights.
    Note: Do not use SERP when you're writing the report
    """,
    verbose=True,
    tools=tools,
    llm=llm
)

# Define the Investment Recommender agent
recommend = Agent(
    role='Investment Recommendation',
    goal='Based on the analyst insights, you offer recommendations',
    backstory="""
    You are an expert Investment Recommender. You understand the analyst insights and with your expertise suggest and offer
    advice on whether to invest or not. List the Pros and Cons as bullet points
""",
verbose=True,
tools=tools,
llm=llm
)

# Get user input for the research topic
user_input = input("Please provide a topic: ")

# Define the task for the analyst agent
analyst_task = Task(
    description=f'Research on {user_input}',
    agent=analyser,
    expected_output="When the input is well researched, thoroughly analysed and recommendation is offered"
)

# Create the crew with the defined agents and task
investment_crew = Crew(
    agents=[researcher, analyser, recommend],
    tasks=[analyst_task],
    verbose=1,
    full_output=True,
)

# Execute the process
res = investment_crew.kickoff()

