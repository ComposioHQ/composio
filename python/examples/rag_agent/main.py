import os
import dotenv
from textwrap import dedent
from composio_langchain import Action, App, ComposioToolSet
from crewai import Agent, Crew, Process, Task
from langchain_openai import ChatOpenAI
from composio.tools.local import ragtool

# Load environment variables from .env file
dotenv.load_dotenv()


# Initialize the ComposioToolSet
toolset = ComposioToolSet()

# Get the RAG tool from the Composio ToolSet
tools = toolset.get_tools(apps=[App.RAGTOOL])

# Initialize the ChatOpenAI model with GPT-4 and API key from environment variables
llm = ChatOpenAI(model="gpt-4o")

# User-provided description of the data to be added and the query
additional_content_list = [
    "Paris is the capital of France. It is known for its art, fashion, and culture.",
    "Berlin is the capital of Germany. It is famous for its history and vibrant culture.",
    "Tokyo is the capital of Japan. It is known for its technology and cuisine.",
    "Canberra is the capital of Australia. It is known for its modern architecture and museums.",
    # Add more data as needed
]

user_query = "What is the capital of France?"  # Edit the query for the action you want it to perform

# Define the RAG Agent
rag_agent = Agent(
    role="RAG Agent",
    goal=dedent(
        """\
        Add relevant content to the RAG tool to enrich its knowledge base.
        Formulate a query to retrieve information from the RAG tool based on user input.
        After retrieval and addition of content, evaluate whether the goal given by the user input is achieved. If yes, stop execution."""
    ),
    verbose=True,
    memory=True,
    backstory=dedent(
        """\
        You are an expert in understanding user requirements, forming accurate queries,
        and enriching the knowledge base with relevant content."""
    ),
    llm=llm,
    allow_delegation=False,
    # tools=tools,
)

# Define the task for adding content to the RAG tool


total_content = ""
for content in additional_content_list:
    total_content += content

add_content_tasks = Task(
    description=dedent(
        f"""\
            Add the following content to the RAG tool to enrich its knowledge base: {total_content}"""
    ),
    expected_output="Content was added to the RAG tool",
    tools=tools,
    agent=rag_agent,
    allow_delegation=False,
)
# Define the task for executing the RAG tool query
query_task = Task(
    description=dedent(
        f"""\
        Formulate a query based on this input: {user_query}.
        Retrieve relevant information using the RAG tool and return the results."""
    ),
    expected_output="Results of the RAG tool query were returned. Stop once the goal is achieved.",
    tools=tools,
    agent=rag_agent,
    allow_delegation=False,
)

# Define the crew with the agent and tasks
crew = Crew(
    agents=[rag_agent],
    tasks=[add_content_tasks, query_task],
    process=Process.sequential,
)

# Kickoff the process and print the result
result = crew.kickoff()
print(result)
