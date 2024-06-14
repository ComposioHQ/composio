
from composio_langchain import Action, App, ComposioToolSet
from composio.local_tools import sqltool,filetool
import sqlite3
from crewai import Agent, Task, Crew, Process
from langchain_openai import ChatOpenAI
import os
import dotenv

# Load environment variables from .env file
dotenv.load_dotenv()

# Initialize the ComposioToolSet
toolset = ComposioToolSet()

# Get the SQL and file tools from the ComposioToolSet
tools = toolset.get_tools(apps = [App.SQLTOOL,App.FILETOOL])
file_tool = toolset.get_tools(apps=[App.FILETOOL])

# Initialize the ChatOpenAI model with GPT-4 and API key from environment variables
llm=ChatOpenAI(model="gpt-4o", openai_api_key = os.environ["OPENAI_API_KEY"])

# Define the Query Writer Agent
query_writer_agent = Agent(
    role='Query Writer Agent',
    goal="""Form a SQL query based on user input and based on the information about the database.
    After execution of a query evaluate whether the goal given by the user input is achieved. If yes, stop execution""",
    verbose=True,
    memory=True,
    backstory=(
        "You are an expert in understanding user requirements and forming accurate SQL queries."
    ),
    llm=llm,
    allow_delegation=True,
    tools=[],
)

# Define the Query Executor Agent
query_executor_agent = Agent(
    role='Query Executor Agent',
    goal="""Execute the SQL query and return the results.
    After execution of a query evaluate whether the goal given by the user input is achieved. If yes, stop execution
    """,
    verbose=True,
    memory=True,
    backstory=(
        "You are an expert in SQL and database management, "
        "skilled at executing SQL queries and providing results efficiently."
    ),
    llm=llm,
    allow_delegation=False,
    tools=tools
)

# Define the File Writer Agent
file_writer_agent = Agent(
    role="File Writer Agent",
    goal = """Document every SQL query executed by the Query Executor Agent in a 'log.txt' file.
    Perform a write operation in the format '<executed_query>\n'
    The log should have the record of every sql query executed """,
    verbose = True,
    memory= True,
    backstory=(
        "You are an expert in logging and documenting changes to SQL databases."
    ),
    llm=llm,
    allow_delegation=False,
    tools = file_tool,
)

# User-provided description of the database and input query
user_description = "The database name is company.db" #Edit the description for your database and tables
user_input = "fetch the rows in the products table"  #Edit the input for the action you want it to perform


# Define the task for executing the SQL query
execute_query_task = Task(
    description=(
        "This is the database description="+user_description+"form a sql query based on this input="+user_input+
        "Execute the SQL query formed by the Query Writer Agent, "
        "and return the results. Pass the query and connection string parameter."
        "The connection string parameter should just be of the format <database_name_given>.db"
    ),
    expected_output='Results of the SQL query were returned. Stop once the goal is achieved',
    tools=tools, 
    agent=query_executor_agent,
)

# Define the task for writing the executed SQL query to a log file
file_write_task = Task(
    description=(
        "the executed query has to be written in a log.txt file to record history, "
        "overwrite parameter should be set to false"
    ),
    expected_output = 'Executed query was written in the log.txt file',
    tools = file_tool,
    agent = file_writer_agent,
    allow_delegation=False,
)

# Define the crew with the agents and tasks
crew = Crew(
    agents=[query_writer_agent, file_writer_agent],
    tasks=[execute_query_task, file_write_task],
    process=Process.sequential
)

# Kickoff the process and print the result
result = crew.kickoff()
print(result)