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
