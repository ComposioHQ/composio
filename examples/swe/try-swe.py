import os
import yaml
from pathlib import Path
from composio_crewai import App, ComposioToolSet
from crewai import Agent, Task
from langchain_openai import ChatOpenAI
from composio.local_tools.local_workspace.commons.parsing import ParseCommandBash
from langchain.globals import set_debug
set_debug(False)

# Path of the current script
script_path = Path(__file__).resolve()
script_dir = script_path.parent
COMMANDS_DIR = "../../composio/local_tools/local_workspace"

composio_toolset = ComposioToolSet()
tools = composio_toolset.get_tools([App.LOCALWORKSPACE, App.CMDMANAGERTOOL, App.HISTORYKEEPER])
llm = ChatOpenAI(openai_api_key=os.environ["OPENAI_API_KEY"], model_name="gpt-4-turbo")


def get_command_docs(command_files):
    parse_command = ParseCommandBash()
    command_docs = []
    for file in command_files:
        file_path = os.path.join(script_dir, COMMANDS_DIR, file)
        commands = parse_command.parse_command_file(path=file_path)
        commands = [
            command for command in commands if not command.name.startswith("_")
        ]
        command_docs.append(parse_command.generate_command_docs(commands, []))
    return "\n".join(command_docs)


def load_config(task_config_path):
    with open(task_config_path, 'r') as stream:
        task_data = yaml.safe_load(stream)
    command_docs = get_command_docs(task_data["command_files"])
    window = task_data["WINDOW"]
    role = task_data["role"]
    backstory = task_data["backstory"].format(command_docs=command_docs, WINDOW=window)
    description = task_data["description"]
    return role, backstory, description


if __name__ == "__main__":
    assert os.environ.get("GITHUB_ACCESS_TOKEN") is not None
    assert os.environ.get("HARD_CODED_REPO_NAME") is not None
    # load config from YAML file
    task_config_path = script_dir / Path("./task_config.yaml")
    role, backstory, description = load_config(task_config_path)
    # start agent and task
    crewai_agent = Agent(
        role=role,
        goal="successfully fix the given issue",
        backstory=backstory,
        verbose=True,
        tools=tools,
        llm=llm,
        memory=True,
    )
    task = Task(
            description=description,
            agent=crewai_agent,
            expected_output="issue should not be reproduced",
        )
    task.execute()

