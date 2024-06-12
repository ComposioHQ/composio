import os

import langchain_core.agents
import yaml
import json
import datetime
from pathlib import Path
from composio_crewai import ComposioToolSet, App
from crewai import Agent, Task
from langchain_openai import AzureChatOpenAI
import logging

from rich.logging import RichHandler

CONFIG_FILE_PATH = "./base_task_config.yaml"
TASK_OUTPUT_PATH = "./task_output"

# Path of the current script
script_path = Path(__file__).resolve()
script_dir = script_path.parent
base_task_config_path = script_dir / Path(CONFIG_FILE_PATH)


# get logger
LOGGER_NAME = "local_workspace"

handler = RichHandler(show_time=False, show_path=False)
handler.setLevel(logging.DEBUG)
logger = logging.getLogger(LOGGER_NAME)
logger.setLevel(logging.DEBUG)
logger.addHandler(handler)
logger.propagate = False


def run(issue: dict):
    """
    Main function to load and display entries from the SWE-bench lite dataset.
    """
    azure_llm = AzureChatOpenAI(
        azure_endpoint=os.environ.get("AZURE_ENDPOINT"),
        api_key=os.environ.get("AZURE_KEY"),
        model="test",
        model_version="1106-Preview",
        api_version="2024-02-01",
    )
    task_output_dir = script_dir / Path(TASK_OUTPUT_PATH + "_" + datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S"))
    task_output_logs = task_output_dir / Path("agent_logs.json")
    if not os.path.exists(task_output_dir):
        os.makedirs(task_output_dir)
    composio_toolset = ComposioToolSet()
    base_role = (
        "You are the best programmer. You think carefully and step by step take action."
    )
    goal = "Help fix the given issue / bug in the code. And make sure you get it working. "
    tools = composio_toolset.get_tools(apps=[App.LOCALWORKSPACE,
                                             App.CMDMANAGERTOOL,
                                             App.HISTORYKEEPER,
                                             App.SUBMITPATCHTOOL])
    agent_logs = {}
    issue_description = issue["description"]
    repo_name = issue["repo"]
    instance_id = issue["issue_id"]
    base_commit = issue.get("base_commit")
    logger.info(f"starting agent for issue-id: {instance_id}\n"
                f"issue-description: {issue_description}\n"
                f"repo_name: {repo_name}\n")
    current_logs = []

    # this is a step_callback function -->
    #           used to store logs of agent actions and responses
    def add_in_logs(step_output):
        # get agent input
        if isinstance(step_output, langchain_core.agents.AgentFinish):
            current_logs.append({
                "agent_action": "agent_finish",
                "agent_output": step_output.return_values,
            })
        if isinstance(step_output, list):
            if len(step_output) < 1:
                return
            agent_action_with_tool_out = step_output[0]
            if isinstance(agent_action_with_tool_out[0], langchain_core.agents.AgentAction):
                agent_action = agent_action_with_tool_out[0]
                tool_out = None
                if len(agent_action_with_tool_out) > 1:
                    tool_out = agent_action_with_tool_out[1]
                current_logs.append({"agent_action": agent_action.json(),
                                     "tool_output": tool_out})
            else:
                print(type(agent_action_with_tool_out[0]))
        else:
            print("type is not list: ", type(step_output))

    with open(base_task_config_path) as f:
        base_config = yaml.safe_load(f.read())

    issue_added_instruction = base_config["issue_description"].format(issue=issue_description,
                                                                      issue_id=instance_id,)
    backstory_added_instruction = base_config["backstory"].format(repo_name=repo_name,
                                                                  base_commit=base_commit,
                                                                  git_access_token=os.environ.get("GITHUB_ACCESS_TOKEN"),
                                                                  install_commit_id="")

    print("--------------------------------------------------")

    expected_output = "A patch should be generated which fixes the given issue"
    swe_agent = Agent(
        role=base_role,
        goal=goal,
        backstory=backstory_added_instruction,
        verbose=True,
        tools=tools,
        llm=azure_llm,
        memory=True,
        cache=False,
        step_callback=add_in_logs,
    )

    coding_task = Task(
        description=issue_added_instruction,
        agent=swe_agent,
        expected_output=expected_output,
    )
    coding_task.execute()
    agent_logs[instance_id] = current_logs
    with open(task_output_logs, "w") as f:
        f.write(json.dumps(agent_logs))


if __name__ == "__main__":
    # set your issue here
    '''
    repo_name: set to the repo, you are solving for, 
        currently set to composio-sdk repo, set 
    issue_id: used for logging purpose
    description: actual description of the issue, this will
        be solved by agent 
    '''
    issue = {
        "repo": "ComposioHQ/composio",
        "issue_id": "123-xyz",
        "description": ""
    }
    run(issue)



