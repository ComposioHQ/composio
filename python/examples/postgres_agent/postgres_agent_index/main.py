import dotenv
from crewai import Agent, Crew, Process, Task
from langchain_openai import ChatOpenAI

from composio_langchain import App, ComposioToolSet

dotenv.load_dotenv()

# Initialize the LLM with the OpenAI GPT-4o model
llm = ChatOpenAI(model="gpt-4o")

# Initialize the Composio ToolSet
toolset = ComposioToolSet()

tools = toolset.get_tools(apps=[App.POSTGRESTOOL, App.FILETOOL])
file_tool = toolset.get_tools(apps=[App.FILETOOL])

index_creator_agent = Agent(
    role="Index Creator Agent",
    goal="Create indexes on appropriate columns to improve query performance.",
    verbose=True,
    memory=True,
    backstory="You are an expert in database optimization, skilled at identifying columns that would benefit from indexing.",
    llm=llm,
    allow_delegation=False,
    tools=tools,
)

query_executor_agent = Agent(
    role="Query Executor Agent",
    goal="Execute SQL queries to test the performance improvement after index creation.",
    verbose=True,
    memory=True,
    backstory="You are an expert in SQL and database management, skilled at executing queries and analyzing their performance.",
    llm=llm,
    allow_delegation=False,
    tools=tools,
)

# User-provided description of the database and input query
user_description = "The database name is exampledb, the postgres user is 'postgres' and the password is 'new_password'. There's a large table named 'orders' with columns: id, customer_id, order_date, total_amount."
user_input = "Create an index on the customer_id column of the orders table, DO NOT fetch ALL the results."

create_index_task = Task(
    description=(
        "Database description: " + user_description + "\n"
        "Task: " + user_input + "\n"
        "Create an index on the specified column using the PostgresIndex action. "
        "Then, execute a query to test the index's effectiveness."
    ),
    expected_output="Index created successfully and query executed with improved performance.",
    tools=tools,
    agent=index_creator_agent,
)

execute_query_task = Task(
    description=(
        "Execute the query to fetch some orders for customer_id = 10. "
        "Compare the query execution time with and without the index."
    ),
    expected_output="Query execution times compared, showing performance improvement.",
    tools=tools,
    agent=query_executor_agent,
)

file_writer_agent = Agent(
    role="File Writer Agent",
    goal="Document the index creation and query execution in a 'index_log.txt' file.",
    verbose=True,
    memory=True,
    backstory="You are an expert in logging and documenting database operations.",
    llm=llm,
    allow_delegation=False,
    tools=file_tool,
)

file_write_task = Task(
    description=(
        "Write the index creation details and query execution times to index_log.txt. "
        "Include the index name, indexed column, and performance improvement."
    ),
    expected_output="Index creation and query execution details logged in index_log.txt",
    tools=file_tool,
    agent=file_writer_agent,
)

crew = Crew(
    agents=[index_creator_agent, query_executor_agent, file_writer_agent],
    tasks=[create_index_task, execute_query_task, file_write_task],
    process=Process.sequential,
)

result = crew.kickoff()
print(result)