from crewai import Agent, Task, Crew, Process
from langchain_openai import ChatOpenAI
from composio_crewai import ComposioToolSet, Action, App
import dotenv


dotenv.load_dotenv() # Load environment variables

llm = ChatOpenAI(model="gpt-4o") # Initialize the language model with OpenAI API key and model name

# Get tools
composio_toolset = ComposioToolSet()
tools = composio_toolset.get_tools(apps=[App.FILETOOL, App.SHELLTOOL])

# Take directory path as input
path = str(input("Enter the directory path (e.g. /home/user/programs/hello-world): "))


# Define agent
file_agent = Agent(
    role="File Agent",
    goal="""You take action on local files using FILE related commands""",
    backstory=(
        """You are AI agent that is responsible for taking actions on files
        on users behalf. You need to take action on local files using FILE related commands."""
    ),
    verbose=True,
    tools=tools,
    llm=llm,
)

analysis_agent = Agent(
    role="Code Analysis Agent",
    goal="""You analyze code and give errors, suggestions, and warnings""",
    backstory=(
        """You are AI agent that is responsible for analyzing code and giving errors, suggestions, and warnings
        on users behalf. You have to use FILE related commands for getting files data and analyze them."""
    ),
    verbose=True,
    tools=tools,
    llm=llm,
)

# Define tasks
check_issues_task = Task(
    description=f"Change current working directory to ${path}. Open all the files, and analyze them and give errors, suggestions, and warnings, you think are necessary. However skip files with '.md' extension and files written in `.gitignore` at ${path} directory.",
    agent=analysis_agent,
    expected_output="Errors, suggestions, and warnings",
)

write_issues_task = Task(
    description=f"""Write the errors, suggestions, and warnings in markdown, you got from checking the files 
    in a new file named 'ISSUES.md' in ${path} directory. Write in bullet points and try to elaborate all the points.""",
    agent=file_agent,
    expected_output="A new file named 'ISSUES.md' in ${path} directory",
    context=[check_issues_task],
)


# Define crew
code_anylasis_crew = Crew(
    agents=[file_agent, analysis_agent],
    tasks=[check_issues_task, write_issues_task],
    process=Process.sequential,
    # memory=True,
    verbose=True,
)


result = code_anylasis_crew.kickoff() # Execute the code analysis crew workflow
