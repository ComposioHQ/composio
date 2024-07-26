import os
import dotenv
from crewai import Agent, Crew, Task
from langchain_openai import ChatOpenAI
from composio_langchain import App, ComposioToolSet


# Load environment variables
dotenv.load_dotenv()


# Initialize the language model with OpenAI API key and model name
llm = ChatOpenAI(model="gpt-4o")

# Setup tools using ComposioToolSet
composio_toolset = ComposioToolSet()
# Using .get_tools we are able to add various tools needed by the
# agents to execute its objective in this case its serpapi,
# giving the agent access to the internet
tools = composio_toolset.get_tools(apps=[App.SERPAPI])

# Define the Investment Researcher agent
researcher = Agent(
    role="Investment Researcher",
    goal=(
        "Use SERP to research the top 2 results based on the input "
        "given to you and provide a report"
    ),
    backstory=(
        "You are an expert Investment researcher. Using the information "
        "given to you, conduct comprehensive research using various sources "
        "and provide a detailed report. Don't pass in location as an "
        "argument to the tool."
    ),
    verbose=True,
    allow_delegation=True,
    llm=llm,
)

# Define the Investment Analyst agent
analyser = Agent(
    role="Investment Analyst",
    goal=(
        "Analyse the stock based on information available to it, use all " "the tools"
    ),
    backstory=(
        "You are an expert Investment Analyst. You research on the given "
        "topic and analyse your research for insights. Note: Do not use "
        "SERP when you're writing the report."
    ),
    verbose=True,
    llm=llm,
)

# Define the Investment Recommendation agent
recommend = Agent(
    role="Investment Recommendation",
    goal="Based on the analyst insights, you offer recommendations",
    backstory=(
        "You are an expert Investment Recommender. You understand "
        "the analyst insights and with your expertise suggest and offer "
        "advice on whether to invest or not. List the Pros and Cons as "
        "bullet points."
    ),
    verbose=True,
    llm=llm,
)

# Get user input for the research topic
user_input = input("Please provide a topic: ")

# Define the task for the analyst agent
analyst_task = Task(
    description=f"Research on {user_input}",
    agent=analyser,
    expected_output=(
        "When the input is well researched, thoroughly analysed, and "
        "recommendation is offered"
    ),
    tools=tools,
)

# Create the investment crew with the defined agents and task
investment_crew = Crew(
    agents=[researcher, analyser, recommend],
    tasks=[analyst_task],
    verbose=1,
    # process=Process.sequential,  # Uncomment if sequential processing needed
)

# Execute the investment crew workflow
res = investment_crew.kickoff()

# Print the result of the execution
print(res)
