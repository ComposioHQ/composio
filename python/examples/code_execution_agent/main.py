import os
import dotenv
from composio_langchain import Action, App, ComposioToolSet
from crewai import Agent, Crew, Process, Task
from langchain_openai import ChatOpenAI

dotenv.load_dotenv()
toolset = ComposioToolSet()
tools = toolset.get_tools(apps=[App.CODEINTERPRETER])


api_key = os.getenv("OPENAI_API_KEY")
if api_key is None:
    raise ValueError("OPENAI_API_KEY environment variable is not set")

llm = ChatOpenAI(
    api_key=api_key,
    model="gpt-4o"
)

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
