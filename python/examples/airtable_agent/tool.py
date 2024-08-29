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
airtable_toolset = toolset.get_tools([App.AIRTABLETOOL])

# Define the Airtable Reader Agent
airtable_read_record_agent = Agent(
    role="Airtable Reader Agent",
    goal="Read data from an Airtable base and provide insights",
    backstory="You know everything about retrieving and analyzing data from Airtable.",
    verbose=True,
    tools=airtable_toolset,
    llm=llm,
)

# Define the Airtable Writer Agent
airtable_list_agent = Agent(
    role="Airtable List Agent",
    goal="List data of an Airtable base based on tablename",
    backstory="You  know everything about listing data from Airtable.",
    verbose=True,
    tools=airtable_toolset,
    llm=llm,
)

# User input for Airtable operations
base_id = "Base ID for endpoint is appCnyjfT8C76Nazl"
table_name = "Airtable Table ID for endpoint is tbl7GfN6D2nxOEESk"
record_id = 'rec0CQeTBMJ5RcTjq'

# Define the task for reading a specific record from Airtable
read_rcdecord_task = Task(
    description=f"Read a specific record with ID '{record_id}' from the '{table_name}' table in the Airtable base '{base_id}' and provide details of the record.",
    agent=airtable_read_record_agent,
    expected_output="Details of the record with ID '{record_id}' from the Airtable table"
)

# Define the task for listing records from Airtable
list_task = Task(
    description=f"Retrieve records from the '{table_name}' table in the Airtable base '{base_id}' and summarize the findings.",
    agent=airtable_list_agent,
    expected_output="List of records from the Airtable table with details of each record"
)

# Create the crew with the agents and tasks
crew = Crew(
    agents=[airtable_read_record_agent, airtable_list_agent],
    tasks=[airtable_list_agent, read_record_task],
)

# Kickoff the process and print the result
result = crew.kickoff()
print(result)