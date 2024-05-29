import os
import yaml
from pathlib import Path
from composio_crewai import App, ComposioToolSet
from crewai import Agent, Task
from langchain_openai import ChatOpenAI


CONFIG_FILE_PATH = "./task_config.yaml"
# Path of the current script
script_path = Path(__file__).resolve()
script_dir = script_path.parent


composio_toolset = ComposioToolSet()
tools = composio_toolset.get_tools([App.LOCALWORKSPACE, App.CMDMANAGERTOOL, App.HISTORYKEEPER])
llm = ChatOpenAI(openai_api_key=os.environ["OPENAI_API_KEY"], model_name="gpt-4-turbo")


if __name__ == "__main__":
    assert os.environ.get("GITHUB_ACCESS_TOKEN") is not None
    assert os.environ.get("HARD_CODED_REPO_NAME") is not None
    # load config from YAML file
    task_config_path = script_dir / Path(CONFIG_FILE_PATH)
    with open(task_config_path, 'r') as stream:
        task_data = yaml.safe_load(stream)
    # start agent and task
    crewai_agent = Agent(
        role=task_data["role"],
        goal="successfully fix the given issue",
        backstory=task_data["backstory"],
        verbose=True,
        tools=tools,
        llm=llm,
        memory=True,
        cachetools=False,
    )
    task = Task(
            description=task_data["description"],
            agent=crewai_agent,
            expected_output="issue should not be reproduced",
        )
    task.execute()

