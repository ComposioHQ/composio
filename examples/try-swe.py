import os
import yaml
from pathlib import Path
from composio import ComposioCore, FrameworkEnum
from composio_crewai import App, ComposioToolset
from crewai import Agent, Task
from langchain_openai import ChatOpenAI

from composio.sdk.local_tools.local_workspace.commons.parsing import ParseCommandBash

# Path of the current script
script_path = Path(__file__).resolve()
print("Script path:", script_path)

# Directory of the current script
script_dir = script_path.parent
print("Script directory:", script_dir)


def get_command_docs(command_files):
    parse_command = ParseCommandBash()
    command_docs = []
    for file in command_files:
        file_path = os.path.join(script_dir, "../composio/sdk/local_tools/local_workspace", file)
        commands = parse_command.parse_command_file(path=file_path)
        commands = [
            command for command in commands if not command.name.startswith("_")
        ]
        command_docs.append(parse_command.generate_command_docs(commands, []))
    return "\n".join(command_docs)


client = ComposioCore(framework=FrameworkEnum.OPENAI, api_key=os.environ.get("COMPOSIO_API_KEY"))
composio_tool_set = ComposioToolset([App.LOCAL_WORKSPACE, App.CMD_MANAGER])

# Read YAML file
with open("/home/shubhra/work/composio/composio_sdk/composio/sdk/local_tools/local_workspace/config/agent_task_data.yaml", 'r') as stream:
    task_data = yaml.safe_load(stream)


command_docs = get_command_docs(task_data["command_files"])
window = task_data["WINDOW"]


role = task_data["role"]
backstory = task_data["backstory"].format(command_docs=command_docs, WINDOW=window)
description = task_data["description"]

os.environ["OPENAI_MODEL_NAME"] = "gpt-4-turbo"
llm = ChatOpenAI(openai_api_key=os.environ["OPENAI_API_KEY"], model_name="gpt-4-turbo")


if __name__ == "__main__":
    assert os.environ.get("GITHUB_ACCESS_TOKEN") is not None
    assert os.environ.get("HARD_CODED_REPO_NAME") is not None
    crewai_agent = Agent(
        role=role,
        goal="successfully fix the given issue",
        backstory=backstory,
        verbose=True,
        tools=composio_tool_set,
        llm=llm,
        memory=True,
    )
    task = Task(
        description=description,
        agent=crewai_agent,
        expected_output="issue should not be reproduced"
    )

    task.execute()
