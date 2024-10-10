from crewai import Agent, Task, Crew, Process
from langchain_openai import ChatOpenAI
from composio_crewai import ComposioToolSet, Action, App
import dotenv
import os

# Load environment variables
dotenv.load_dotenv()

# Check if OpenAI API key is set
if "OPENAI_API_KEY" not in os.environ:
    raise EnvironmentError("OPENAI_API_KEY not found in environment variables.")

# Initialize the language model with OpenAI API key and model name
llm = ChatOpenAI(model="gpt-4o")

# Get tools
composio_toolset = ComposioToolSet()
tools = composio_toolset.get_tools(apps=[App.FILETOOL, App.SHELLTOOL])

# Take directory path as input with validation
path = input("Enter the directory path (e.g. /home/user/programs/hello-world): ")
if not os.path.isdir(path):
    raise ValueError(f"The path '{path}' is not a valid directory.")

# Function to create agents
def create_agent(role: str, goal: str, backstory: str) -> Agent:
    return Agent(
        role=role,
        goal=goal,
        backstory=backstory,
        verbose=True,
        tools=tools,
        llm=llm,
    )

# Define agents
file_agent = create_agent(
    role="File Agent",
    goal="You take action on local files using FILE related commands",
    backstory=(
        "You are an AI agent responsible for taking actions on files "
        "on users' behalf. You need to take action on local files using FILE related commands."
    ),
)

analysis_agent = create_agent(
    role="Code Analysis Agent",
    goal="You analyze code and give errors, suggestions, and warnings",
    backstory=(
        "You are an AI agent responsible for analyzing code and giving errors, suggestions, and warnings "
        "on users' behalf. You have to use FILE related commands for getting files data and analyze them."
    ),
)

# Define tasks
check_issues_task = Task(
    description=(
        f"Change current working directory to '{path}'. Open all the files, analyze them, "
        "and provide any necessary errors, suggestions, and warnings. Skip files with '.md' "
        "extension and files written in '.gitignore' in the '{path}' directory."
    ),
    agent=analysis_agent,
    expected_output="Errors, suggestions, and warnings",
)

write_issues_task = Task(
    description=(
        f"Write the errors, suggestions, and warnings in markdown format in a new file named "
        "'ISSUES.md' in the '{path}' directory. Use bullet points and elaborate on all the points."
    ),
    agent=file_agent,
    expected_output=f"A new file named 'ISSUES.md' in '{path}' directory",
    context=[check_issues_task],
)

# Define crew
code_analysis_crew = Crew(
    agents=[file_agent, analysis_agent],
    tasks=[check_issues_task, write_issues_task],
    process=Process.sequential,
    verbose=True,
)

# Execute the code analysis crew workflow
try:
    result = code_analysis_crew.kickoff()
    print("Code analysis completed successfully.")
except Exception as e:
    print(f"An error occurred during the process: {e}")
