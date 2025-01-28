import os
from composio_langchain import Action, App, ComposioToolSet
from crewai import Agent, Crew, Process, Task

toolset = ComposioToolSet()
tools = toolset.get_tools(apps=[App.CODEINTERPRETER])

python_executor_agent = Agent(
    role="Python Code Executor",
    goal="Execute Python code in a Jupyter notebook cell and return the results.",
    verbose=True,
    backstory="You are an expert in executing Python code and interpreting results in a sandbox environment.",
    tools=list(tools),
)

python_code =  """
def factorial(n):
    if n < 0:
        return "Factorial is not defined for negative numbers."
    elif n == 0 or n == 1:
        return 1
    else:
        result = 1
        for i in range(2, n + 1):
            result *= i
        return result

# Example usage
number = 5
result = factorial(number)
print(f"The factorial of {number} is {result}.")
"""


execute_code_task = Task(
    description="Execute the following Python code and return the results:\n\n"+ python_code,
    expected_output="Execution of Python code returned the results.",
    agent=python_executor_agent,
)

crew = Crew(
    agents=[python_executor_agent],
    tasks=[execute_code_task],
    process=Process.sequential,
)

result = crew.kickoff()
print(result)
