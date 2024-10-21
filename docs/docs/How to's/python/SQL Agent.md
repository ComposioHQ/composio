# SQL Agent

### This guide provides detailed steps to create an agent that leverages Composio to perform SQL queries and file operations to perform sql queries and File operations and plot insightful graphs on the data in the db.

#### This project involves setting up and running a system of agents to conduct SQL queries, write the output to a file, and plot graphs based on the data. We use Composio to set up the tools and OpenAI GPT-4o to power the agents. Follow this guide to set up and run the project.

#### Note: This is a Python only example. JS version coming soon!

<div style="border: 1px solid #ddd; border-radius: 8px; padding: 16px; width: fit-content; background-color: #f5f5f5;">
  <img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" alt="GitHub Logo" width="50" style="vertical-align: middle; margin-right: 10px;">
  <strong style="font-size: 1.2em;"><a href="https://github.com/ComposioHQ/composio/tree/master/python/examples/sql_agent">SQL Agent GitHub Repository</a></strong>
  <p style="margin-top: 8px; font-size: 1em;">Explore the complete source code for the SQL Agent project. This repository contains all the necessary files and scripts to set up and run the SQL Agent system using Langchain and Composio.</p>
</div>



+ ## 1. Imports and Environment Setup
  In your Python script, import the necessary libraries and set up your environment variables.
  ### Import required dependencies
  ```python
  import os
  import dotenv
  from composio_langchain import App, ComposioToolSet
  from langchain import hub
  from langchain.agents import AgentExecutor, create_openai_functions_agent
  from langchain_openai import ChatOpenAI

  # Load environment variables
  dotenv.load_dotenv()
  ```


+ ## 2. Initialize Language Model and Define Tools
  Initialize the language model with OpenAI API key and model name, and set up the necessary tools for the agents.
  ### Setup your llm
  ```python
  llm = ChatOpenAI(model="gpt-4o")

  # Initialize the Composio ToolSet
  composio_toolset = ComposioToolSet()

  # Get tools for SQL and File operations
  sql_file_tool = composio_toolset.get_tools(apps=[App.SQLTOOL, App.FILETOOL])

  # Get tools for SQL, File, and Code Interpreter operations
  tools = composio_toolset.get_tools(apps=[App.SQLTOOL, App.FILETOOL, App.CODEINTERPRETER])
  ```



+ ## 3. Define the Task and Execute SQL Query
  Define the task to execute a SQL query and write the output to a file.
  ### Define the task
  ```python
  # Pull the prompt template for the agent
  prompt = hub.pull("hwchase17/openai-functions-agent")

  # Define the task to execute
  query_task = (
      "Write sqlite query to get top 10 rows from the only table MOCK_DATA "
      "and database companydb using sqltool, write the output in a file called log.txt and return the output"
  )

  # Create the agent for SQL and File operations and execute the task
  query_agent = create_openai_functions_agent(llm, sql_file_tool, prompt)
  agent_executor = AgentExecutor(agent=query_agent, tools=sql_file_tool, verbose=True)
  res = agent_executor.invoke({"input": query_task})
  ```



+ ## 4. Define and Execute Code Interpreter Task
  Create and execute the agent for Code Interpreter operations to plot a graph based on the extracted data.
  ### Execute the agent
  ```python 
  # Create the agent for Code Interpreter operations
  code_tool = composio_toolset.get_tools(apps=[App.CODEINTERPRETER])
  code_agent = create_openai_functions_agent(llm, code_tool, prompt)
  agent_executor = AgentExecutor(agent=code_agent, tools=code_tool, verbose=True)

  # Define the task for plotting graphs
  plot_task = (
      "Using the following extracted information, plot the graph between first name and salary: "
      + res["output"]
  )

  # Execute the plotting task
  final_res = agent_executor.invoke({"input": plot_task})
  ```




# Putting it All Together
### Final Code
```python
import os
import dotenv
from composio_langchain import App, ComposioToolSet
from langchain import hub
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_openai import ChatOpenAI

# Load environment variables
dotenv.load_dotenv()

# Initialize the LLM with the OpenAI GPT-4o model and API key
llm = ChatOpenAI(model="gpt-4o")

# Initialize the Composio ToolSet
composio_toolset = ComposioToolSet()

# Get tools for SQL and File operations
sql_file_tool = composio_toolset.get_tools(apps=[App.SQLTOOL, App.FILETOOL])

# Get tools for SQL, File, and Code Interpreter operations
tools = composio_toolset.get_tools(apps=[App.SQLTOOL, App.FILETOOL, App.CODEINTERPRETER])

# Pull the prompt template for the agent
prompt = hub.pull("hwchase17/openai-functions-agent")

# Define the task to execute
query_task = (
    "Write sqlite query to get top 10 rows from the only table MOCK_DATA "
    "and database companydb using sqltool, write the output in a file called log.txt and return the output"
)

# Create the agent for SQL and File operations and execute the task
query_agent = create_openai_functions_agent(llm, sql_file_tool, prompt)
agent_executor = AgentExecutor(agent=query_agent, tools=sql_file_tool, verbose=True)
res = agent_executor.invoke({"input": query_task})

# Create the agent for Code Interpreter operations
code_tool = composio_toolset.get_tools(apps=[App.CODEINTERPRETER])
code_agent = create_openai_functions_agent(llm, code_tool, prompt)
agent_executor = AgentExecutor(agent=code_agent, tools=code_tool, verbose=True)

# Define the task for plotting graphs
plot_task = (
    "Using the following extracted information, plot the graph between first name and salary: "
    + res["output"]
)

# Execute the plotting task
final_res = agent_executor.invoke({"input": plot_task})

# Print the final result
print(final_res)
```