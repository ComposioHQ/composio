try:
    import rich
except ModuleNotFoundError as e:
    raise RuntimeError(
        "You probably either forgot to install the dependencies "
        "or forgot to activate your conda or virtual environment."
    ) from e

try:
    from rich_argparse import RichHelpFormatter
except ImportError:
    msg = (
        "Please install the rich_argparse package with `pip install rich_argparse`."
    )
    raise ImportError(msg)

import os
import yaml
from crewai import Agent, Task
from langchain_openai import ChatOpenAI

from tools.services.swelib.local_workspace.local_tool_utils import ComposioToolset, get_command_docs


# Read YAML file
with open("agent_task_data.yaml", 'r') as stream:
    task_data = yaml.safe_load(stream)


command_docs = get_command_docs(task_data["command_files"])
window = task_data["WINDOW"]


role = task_data["role"]
backstory = task_data["backstory"].format(command_docs=command_docs, WINDOW=window)
# description = task_data["description"].format(command_docs=command_docs, WINDO=window)
description = task_data["description"]

os.environ["OPENAI_MODEL_NAME"] = "gpt-4-turbo"

llm = ChatOpenAI(openai_api_key=os.environ["OPENAI_API_KEY"],model_name="gpt-4-turbo")


if __name__ == "__main__":
    assert os.environ.get("GITHUB_ACCESS_TOKEN") is not None
    assert os.environ.get("HARD_CODED_REPO_NAME") is not None
    my_tools = ComposioToolset()
    crewai_agent = Agent(
        role=role,
        goal="successfully run one of the commands given in the task",
        backstory=backstory,
        verbose=True,
        tools=my_tools,
        llm=llm
    )
    task = Task(
        description=description,
        agent=crewai_agent,
        expected_output="If any of the command successfully runs"
    )

    task.execute()




