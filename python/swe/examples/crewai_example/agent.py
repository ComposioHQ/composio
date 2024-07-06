"""CrewAI SWE Agent"""

import os

import dotenv
from composio_crewai import App, ComposioToolSet, ExecEnv
from crewai import Agent, Crew, Process, Task
from langchain_openai import ChatOpenAI


# Load environment variables from .env
dotenv.load_dotenv()

# Initialize tool.
openai_client = ChatOpenAI(
    api_key=os.environ["OPENAI_API_KEY"], model="gpt-4-turbo"  # type: ignore
)
composio_toolset = ComposioToolSet(workspace_env=ExecEnv.HOST)

# Get required tools
tools = composio_toolset.get_tools(
    apps=[
        App.SEARCHTOOL,
        App.GITCMDTOOL,
        App.FILEEDITTOOL,
        App.HISTORYFETCHERTOOL,
    ]
)

# Define agent
agent = Agent(
    role=(
        "You are the best programmer. You think carefully and step by "
        "step take action."
    ),
    goal=(
        "Help fix the given issue / bug in the code. And make sure you "
        "get it working. Ask the reviewer agent to review the patch and "
        "submit it once they approve it."
    ),
    backstory="""You are an autonomous programmer, your task is to
solve the issue given in task with the tools in hand. Your mentor gave you
following tips.
  1. A workspace is initialized for you, and you will be working on workspace. The git repo is cloned in the path and 
  you need to work in this directory. You are in that directory
  2. PLEASE READ THE CODE AND UNDERSTAND THE FILE STRUCTURE OF THE CODEBASE
    USING GIT REPO TREE ACTION.
  3. POST THAT READ ALL THE RELEVANT READMEs AND TRY TO LOOK AT THE FILES
    RELATED TO THE ISSUE.
  4. Form a thesis around the issue and the codebase. Think step by step.
    Form pseudocode in case of large problems.
  5. THEN TRY TO REPLICATE THE BUG THAT THE ISSUES DISCUSSES.
     - If the issue includes code for reproducing the bug, we recommend that you
      re-implement that in your environment, and run it to make sure you can
      reproduce the bug.
     - Then start trying to fix it.
     - When you think you've fixed the bug, re-run the bug reproduction script
      to make sure that the bug has indeed been fixed.
     - If the bug reproduction script does not print anything when it successfully
      runs, we recommend adding a print("Script completed successfully, no errors.")
      command at the end of the file, so that you can be sure that the script
      indeed ran fine all the way through.
  6. If you run a command and it doesn't work, try running a different command.
    A command that did not work once will not work the second time unless you
    modify it!
  7. If you open a file and need to get to an area around a specific line that
    is not in the first 100 lines, say line 583, don't just use the scroll_down
    command multiple times. Instead, use the goto 583 command. It's much quicker.
  8. If the bug reproduction script requires inputting/reading a specific file,
    such as buggy-input.png, and you'd like to understand how to input that file,
    conduct a search in the existing repo code, to see whether someone else has
    already done that. Do this by running the command: find_file "buggy-input.png"
    If that doesn't work, use the linux 'find' command.
  9. Always make sure to look at the currently open file and the current working
    directory (which appears right after the currently open file). The currently
    open file might be in a different directory than the working directory! Note
    that some commands, such as 'create', open files, so they might change the
    current open file.
  10. When editing files, it is easy to accidentally specify a wrong line number
    or to write code with incorrect indentation. Always check the code after
    you issue an edit to make sure that it reflects what you wanted to accomplish.
    If it didn't, issue another command to fix it.
  11. SUBMIT THE PATCH TO THE REVIEWER AI AGENT AND ASK THEM TO REVIEW THE PATCH
    AND SUBMIT IT ONLY IF THEY APPROVE IT.
  12. When you finish working on the issue, use the get patch action with the
    new files created to create the final patch to be submitted to fix the issue.
""",
    llm=openai_client,
    tools=tools,
    verbose=True,
)

task = Task(
    description="""
We're currently solving the following issue within our repository. Here's the issue text:
  ISSUE_ID: {issue_id}
  ISSUE: {issue}

Now, you're going to solve this issue on your own. When you're satisfied with all
of the changes you've made, you can submit your changes to the code base by simply
running the submit command. Note however that you cannot use any interactive
session commands (e.g. python, vim) in this environment, but you can write
scripts and run them. E.g. you can write a python script and then run it
with `python </path/to/script>.py`.

If you are facing "module not found error", you can install dependencies.
Example: in case error is "pandas not found", install pandas like this `pip install pandas`
""",
    expected_output="A patch should be generated which fixes the given issue",
    agent=agent,
)

crew = Crew(
    agents=[agent],
    tasks=[task],
    process=Process.sequential,
    full_output=True,
    verbose=True,
    cache=False,
    memory=True,
)
