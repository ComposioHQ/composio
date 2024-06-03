from pathlib import Path
from composio_crewai import App, ComposioToolSet, Action
from crewai import Agent, Crew, Process, Task
from crewai.task import TaskOutput
import yaml
from langchain_openai import ChatOpenAI
from langchain_openai import AzureChatOpenAI
import os

CONFIG_FILE_PATH = "./task_config.yaml"

# Path of the current script
script_path = Path(__file__).resolve()
script_dir = script_path.parent
task_config_path = script_dir / Path(CONFIG_FILE_PATH)

task_data = ""

composio_toolset = ComposioToolSet()

llm = ChatOpenAI(model="gpt-4-1106-preview")

base_role = (
    "You are the best programmer. You think carefully and step by step take action."
)

goal = "Help fix the given issue / bug in the code. And make sure you get it working. "

tools = composio_toolset.get_tools(apps=[App.LOCALWORKSPACE, App.CMDMANAGERTOOL, App.HISTORYKEEPER])


if __name__ == "__main__":
    with open("/home/shubhra/work/composio/composio_sdk/examples/swe/task_config.yaml") as f:
        base_config = yaml.safe_load(f.read())

    agent_1 = Agent(
        role=base_role,
        goal=goal,
        backstory=base_config["backstory"].format(repo_name=base_config["repo_name"]),
        verbose=True,
        tools=tools,
        llm=llm,
        memory=True,
        cache=False,
    )

    task = Task(
        description=base_config["issue_description"],
        agent=agent_1,
        expected_output="Name of the file",
    )

    task.execute()
    #
    # my_crew.kickoff()
    # print(my_crew.usage_metrics)
