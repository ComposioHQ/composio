import os
import yaml
from pathlib import Path
from composio_crewai import App, ComposioToolSet,Action
from crewai import Agent, Task, Process, Crew
from langchain_openai import ChatOpenAI

CONFIG_FILE_PATH = "./task_config.yaml"

# Path of the current script
script_path = Path(__file__).resolve()
script_dir = script_path.parent
task_config_path = script_dir / Path(CONFIG_FILE_PATH)

task_data = ""
# read yaml 
with open(task_config_path, 'r') as stream:
    task_data = yaml.safe_load(stream)

composio_toolset = ComposioToolSet()

llm = ChatOpenAI(model="gpt-4-turbo")

base_role = "You are the part of best programming system to ever exist. You think carefully and step by step."
goal = "Help fix the given issue / bug in the code."

workspace_tools = composio_toolset.get_tools([App.LOCALWORKSPACE])
commandmanager_tools = composio_toolset.get_tools([App.CMDMANAGERTOOL])
Historymanager_tools = composio_toolset.get_tools([App.HISTORYKEEPER])
composio_toolset.get_actions(actions=[Action.WORKSPACESTATUS])

if __name__ == "__main__":
    assert os.environ.get("GITHUB_ACCESS_TOKEN") is not None
    assert os.environ.get("HARD_CODED_REPO_NAME") is not None
    # start agent and task
    agent_1 = Agent(
        role=base_role + " You manage workspaces.",
        goal=goal,
        backstory=task_data["backstory"],
        verbose=True,
        tools=workspace_tools,
        llm=llm,
        memory=True,
        cachetools=False,
    )

    # start agent and task
    agent_2 = Agent(
        role=base_role + "You manage history and help fetch it to make sure right decisions are taken by looking at all the datapoints.",
        goal=goal,
        backstory=task_data["backstory"],
        verbose=True,
        tools=commandmanager_tools,
        llm=llm,
        memory=True,
        cachetools=False,
    )


    # start agent and task
    agent_3 = Agent(
        role=base_role,
        goal=goal,
        backstory=task_data["backstory"],
        verbose=True,
        tools=Historymanager_tools,
        llm=llm,
        memory=True,
        cachetools=False,
    )

    task = Task(
            description=task_data["issue_description"],
            agent=agent_1,
            expected_output="issue should not be reproduced")

    my_crew = Crew(
        agents=[agent_1,agent_2,agent_3],
        tasks=[task],
        process=Process.sequential,
        full_output=True,
        verbose=True,
    )

    my_crew.kickoff()
    print(my_crew.usage_metrics)
