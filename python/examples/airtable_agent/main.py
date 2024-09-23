import dotenv
from composio_langchain import ComposioToolSet
from crewai import Agent, Crew, Task
from langchain_openai import ChatOpenAI

from composio import App

# Load environment variables
dotenv.load_dotenv()

# Initialize the LLM
llm = ChatOpenAI(model="gpt-4o")

# Initialize the ComposioToolSet
toolset = ComposioToolSet()

# Get the Airtable tools
airtable_tools = toolset.get_tools([App.AIRTABLETOOL])

# Define the Airtable Reader Agent
airtable_reader_agent = Agent(
    role="Airtable Reader Agent",
    goal="Read data from an Airtable base and provide insights",
    backstory="You are an expert in retrieving and analyzing data from Airtable.",
    verbose=True,
    tools=airtable_tools,
    llm=llm,
)

# Define the Airtable Schema Agent
airtable_schema_agent = Agent(
    role="Airtable Schema Agent",
    goal="See/edit the structure of a base, like table names or field types",
    backstory="You are an expert in retrieving and editing Schema from Airtable.",
    verbose=True,
    tools=airtable_tools,
    llm=llm,
)

# Define the Airtable Writer Agent
airtable_writer_agent = Agent(
    role="Airtable Writer Agent",
    goal="Write data to an Airtable base based on analysis or user input",
    backstory="You are an expert in organizing and writing data to Airtable.",
    verbose=True,
    tools=airtable_tools,
    llm=llm,
)

# User input for Airtable operations
base_id = "The Airtable Base ID is appVemtCBhN3nTykZ" # Replace with your base ID
table_name = "The Airtable Table name is: 'my_table'" # Replace with your table name

# Define the task for reading from Airtable
read_task = Task(
    description=f"Read all records from the '{table_name}' table in the Airtable base '{base_id}' and provide a summary of the data.",
    agent=airtable_reader_agent,
    expected_output="A summary of the data read from the Airtable table"
)

# Define the task for getting te Airtable schema
schema_task = Task(
    description=f"Get the schema of the table '{table_name}' in the Airtable base '{base_id}'. This schema will be used later when writing data to Airtable.",
    agent=airtable_schema_agent,
    expected_output="The schema of the Airtable."
)

# Define the task for writing to Airtable
write_task = Task(
    description=f"Based on the data read, create a new record in the '{table_name}' table in the Airtable base '{base_id}' with a summary of the findings.",
    agent=airtable_writer_agent,
    expected_output="Confirmation of a new record created in the Airtable table with a summary of findings"
)

# Create the crew with the agents and tasks
crew = Crew(
    agents=[airtable_reader_agent, airtable_schema_agent, airtable_writer_agent],
    tasks=[read_task, schema_task, write_task],
)

# Kickoff the process and print the result
result = crew.kickoff()
print(result)