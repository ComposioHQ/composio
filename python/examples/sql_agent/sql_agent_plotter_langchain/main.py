import os

# Load environment variables
import dotenv
from composio_langchain import App, ComposioToolSet
from langchain import hub
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_openai import ChatOpenAI




dotenv.load_dotenv()

# Initialize the LLM with the OpenAI GPT-4o model and API key
llm = ChatOpenAI(model="gpt-4o")

# Pull the prompt template for the agent
prompt = hub.pull("hwchase17/openai-functions-agent")

# Initialize the Composio ToolSet with the API key
toolset = ComposioToolSet()

# Get tools for SQL and File operations
sql_file_tool = toolset.get_tools(apps=[App.SQLTOOL, App.FILETOOL])

# Get tools for SQL, File, and Code Interpreter operations
tools = toolset.get_tools(apps=[App.SQLTOOL, App.FILETOOL, App.CODEINTERPRETER])

# Define the task to execute
# We have a dummy database called company.db which contains a table called MOCK_DATA
# modify this task as per your own requirements
query_task = "Write sqlite query to get top 10 rows from the only table MOCK_DATA and database companydb using sqltool, write the output in a file called log.txt and return the output"

# Create the agent for SQL and File operations and execute the task
query_agent = create_openai_functions_agent(llm, sql_file_tool, prompt)
agent_executor = AgentExecutor(agent=query_agent, tools=sql_file_tool, verbose=True)
res = agent_executor.invoke({"input": query_task})

# Create the agent for Code Interpreter operations
code_tool = toolset.get_tools(apps=[App.CODEINTERPRETER])
code_agent = create_openai_functions_agent(llm, code_tool, prompt)
agent_executor = AgentExecutor(agent=code_agent, tools=code_tool, verbose=True)

# This is an example plot between two columns in the MOCK_TABLE table in the company.db file
# modify this task for plotting graphs as per your own requirements
plot_task = (
    "Using the following extracted information, plot the graph between first name and salary: "
    + res["output"]
)

# Execute the plotting task
final_res = agent_executor.invoke({"input": plot_task})
