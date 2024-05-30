import os
import yaml
from pathlib import Path
from composio_crewai import App, ComposioToolSet, Action
from crewai import Agent, Task, Process, Crew
from langchain_openai import ChatOpenAI

CONFIG_FILE_PATH = "./task_config.yaml"

# Path of the current script
script_path = Path(__file__).resolve()
script_dir = script_path.parent
task_config_path = script_dir / Path(CONFIG_FILE_PATH)

task_data = ""
# read yaml
with open(task_config_path, "r") as stream:
    task_data = yaml.safe_load(stream)

composio_toolset = ComposioToolSet()

llm = ChatOpenAI(model="gpt-4-turbo")

base_role = "You are an autonomous programmer. You think carefully and step by step take action."
goal = "Help fix the given issue / bug in the code."

tools = composio_toolset.get_tools([App.LOCALWORKSPACE, App.CMDMANAGERTOOL])

print("Task data : ", task_data)
if __name__ == "__main__":
    assert os.environ.get("GITHUB_ACCESS_TOKEN") is not None
    assert os.environ.get("HARD_CODED_REPO_NAME") is not None
    # start agent and task
    agent_1 = Agent(
        role=base_role + " You manage workspaces.",
        goal=goal,
        backstory=task_data["backstory"],
        verbose=True,
        tools=tools,
        llm=llm,
        memory=True,
        cachetools=False,
    )

    task = Task(
        description=task_data["issue_description"],
        agent=agent_1,
        expected_output="issue should not be reproduced",
    )

    my_crew = Crew(
        agents=[agent_1],
        tasks=[task],
        process=Process.sequential,
        full_output=True,
        verbose=True,
        cache=False,
        memory=True,
    )

    my_crew.kickoff()
    print(my_crew.usage_metrics)
