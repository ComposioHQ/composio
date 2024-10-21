# Code Execution Agent

The project generates and executes code based on user-defined problems. It utilizes the Composio and connects your AI Agent to E2B’s Code Interpreter to facilitate code execution, allowing users to input a problem statement and receive executable code as output. The agent is designed to operate in a sandbox environment, ensuring safe execution and accurate results. Key functionalities include code generation, execution, and result interpretation, making it an invaluable resource for developers and data scientists alike.

<div style="border: 1px solid #ddd; border-radius: 8px; padding: 16px; width: fit-content; background-color: #f5f5f5;">
  <img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" alt="GitHub Logo" width="50" style="vertical-align: middle; margin-right: 10px;">
  <strong style="font-size: 1.2em;"><a href="https://github.com/ComposioHQ/composio/blob/master/python/examples/quickstarters/code_execution_agent/main.py">Code Execution Agent GitHub Repository</a></strong>
  <p style="margin-top: 8px; font-size: 1em;">Explore the complete source code for the RAG Agent project. This repository contains all the necessary files and scripts to set up and run the RAG system using CrewAI and Composio.</p>
</div>



+ ## 1. Import Required Packages
  Import necessary packages for the Code Execution Agent:
  ### Import libraries
  ```python
  import os
  from composio_langchain import Action, App, ComposioToolSet
  from crewai import Agent, Crew, Process, Task
  ```


+ ## 2. Initialize Composio Toolset
  Set up the Composio toolset and get the required tools:
  ### Connect to CodeInterpreter
  ```python
  composio_toolset = ComposioToolSet()
  tools = composio_toolset.get_tools(apps=[App.CODEINTERPRETER])
  ```



+ ## 3. Set up the AI Model
  Initialize the OpenAI ChatGPT model:
  ### Initialise Model
  ```python

  from langchain_openai import ChatOpenAI

  llm = ChatOpenAI(model="gpt-4o")
  ```



+ ## 4. Create the AI Agent
  Set up the agent’s prompt and create the OpenAI Functions Agent:
  ### Set up the Agent
  ```python 
  python_executor_agent = Agent(
  role="Python Code Executor",
  goal="Execute Python code in a Jupyter notebook cell and return the results.",
  verbose=True,
  memory=True,
  backstory="You are an expert in executing Python code and interpreting results in a sandbox environment.",
  allow_delegation=False,
  tools=tools,
  )
  ```



+ ## 5. Set up the Agent Executor
  Create the AgentExecutor to run the agent:
  ### Defining Task
  ```python
  python_code = """
    def calculate_sum(a, b):
        return a + b

    result = calculate_sum(5, 3)
    print(result)
  """

  execute_code_task = Task(
      description="Execute the following Python code and return the results:\n\n"
      + python_code,
      expected_output="Execution of Python code returned the results.",
      tools=tools,
      agent=python_executor_agent,
      allow_delegation=False,
  )
  ```



+ ## 6. Define the Code Execution Function
  Create the main function to generate and execute code:
  ### Creating a Crew
  ```python
  crew = Crew(
    agents=[python_executor_agent],
    tasks=[execute_code_task],
    process=Process.sequential,
  )
  ```




+ ## 7. Run the Code Execution Agent
  Execute the agent with a sample problem:
  ### Python - Run
  ```python
  result = crew.kickoff()
  print(result)
  ```



# Complete Code
Here’s the complete Python Code:
### Python Final Code
```python

import os
from composio_langchain import Action, App, ComposioToolSet
from crewai import Agent, Crew, Process, Task

toolset = ComposioToolSet()
tools = toolset.get_tools(apps=[App.CODEINTERPRETER])

python_executor_agent = Agent(
    role="Python Code Executor",
    goal="Execute Python code in a Jupyter notebook cell and return the results.",
    verbose=True,
    memory=True,
    backstory="You are an expert in executing Python code and interpreting results in a sandbox environment.",
    allow_delegation=False,
    tools=tools,
)

python_code = """
def calculate_sum(a, b):
    return a + b

result = calculate_sum(5, 3)
print(result)
"""

execute_code_task = Task(
    description="Execute the following Python code and return the results:\n\n"
    + python_code,
    expected_output="Execution of Python code returned the results.",
    tools=tools,
    agent=python_executor_agent,
    allow_delegation=False,
)

crew = Crew(
    agents=[python_executor_agent],
    tasks=[execute_code_task],
    process=Process.sequential,
)

result = crew.kickoff()
print(result)
```