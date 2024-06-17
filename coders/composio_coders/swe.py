import datetime
import json
import logging
from pathlib import Path

import langchain_core
from composio_coders.config_store import (
    AzureModelConfig,
    IssueConfig,
    ModelEnvConfig,
    OpenAiModelConfig,
)
from composio_coders.constants import (
    KEY_API_KEY,
    MODEL_ENV_AZURE,
    MODEL_ENV_OPENAI,
)
from composio_crewai import App, ComposioToolSet
from crewai import Agent, Task
from langchain_openai import AzureChatOpenAI, ChatOpenAI
from pydantic import BaseModel, Field
from rich.logging import RichHandler


AGENT_BACKSTORY_TMPL = """
You are an autonomous programmer, your task is to solve the issue given in task with the tools in hand.
  Your mentor gave you following tips.
  1. Always start by initializing the workspace.
  2. Use the workspace_id returned to use tools to run commands. The commands are run on shell.
  3. use clone the git repo {repo_name} from the base_commit {base_commit} in workspace
  4. After setting up environment - *Always start with try to replicate the bug that the issues discusses*.
     If the issue includes code for reproducing the bug, we recommend that you re-implement that in your environment, 
     and run it to make sure you can reproduce the bug.
     Then start trying to fix it.
     When you think you've fixed the bug, re-run the bug reproduction script to make sure that the bug has indeed been fixed.
     If the bug reproduction script does not print anything when it successfully runs, 
     we recommend adding a print("Script completed successfully, no errors.") command at the end of the file,
     so that you can be sure that the script indeed ran fine all the way through.
  5. If you run a command and it doesn't work, try running a different command. A command that did not work once 
  will not work the second time unless you modify it!
  6. If you open a file and need to get to an area around a specific line that is not in the first 100 lines, 
  say line 583, don't just use the scroll_down command multiple times. Instead, use the goto 583 command. It's much quicker.
  7. If the bug reproduction script requires inputting/reading a specific file, such as buggy-input.png, and you'd like
   to understand how to input that file, conduct a search in the existing repo code, to see whether someone else has already done that. 
   Do this by running the command: find_file "buggy-input.png" If that doesn't work, use the linux 'find' command.
  8. Always make sure to look at the currently open file and the current working directory (which appears right after the currently open file).
   The currently open file might be in a different directory than the working directory! Note that some commands,
    such as 'create', open files, so they might change the current  open file.
  9. When editing files, it is easy to accidentally specify a wrong line number or to write code with incorrect indentation.
   Always check the code after you issue an edit to make sure that it reflects what you wanted to accomplish.
    If it didn't, issue another command to fix it.
  10. When you finish working on the issue, use submit patch tool to submit your patch.
"""
ISSUE_DESC_TMPL = """
 We're currently solving the following issue within our repository. Here's the issue text:
    ISSUE_ID:
    {issue_id}
    ISSUE:
    {issue}
  Now, you're going to solve this issue on your own.
  When you're satisfied with all of the changes you've made, you can submit your changes to the code base by simply running the submit command.
  Note however that you cannot use any interactive session commands (e.g. python, vim) in this environment, but you can 
  write scripts and run them. E.g. you can write a python script and then run it with `python </path/to/script>.py`.

  If you are facing "module not found error", you can install dependencies. Example: in case error is "pandas not found", install pandas like this
  `pip install pandas`
"""

LOGS_DIR_NAME_PREFIX = "coder_agent_logs"
AGENT_LOGS_JSON_PATH = "agent_logs.json"


def setup_logger():
    handler = RichHandler(show_time=False, show_path=False)
    handler.setLevel(logging.DEBUG)
    logger = logging.getLogger("local_workspace")
    logger.setLevel(logging.DEBUG)
    logger.addHandler(handler)
    logger.propagate = False
    return logger


logger = setup_logger()


class CoderAgentArgs(BaseModel):
    agent_backstory_tmpl: str = Field(
        default=AGENT_BACKSTORY_TMPL,
        description="backstory template for the agent to work on",
    )
    issue_description_tmpl: str = Field(default=ISSUE_DESC_TMPL)
    issue_config: IssueConfig = Field(
        ..., description="issue config, with issue description, repo-name"
    )
    model_env_config: ModelEnvConfig = Field(
        ..., description="llm configs like api_key, endpoint_url etc to intialize llm"
    )
    agent_logs_dir: Path = Field(..., description="logs for agent")


class CoderAgent:
    def __init__(self, args: CoderAgentArgs):
        # initialize logs and history logs path
        self.args = args
        self.model_env = args.model_env_config
        self.issue_config = args.issue_config
        self.repo_name = self.issue_config.repo_name
        if not self.issue_config.issue_id:
            raise ValueError("no git-issue configuration is found")

        # initialize composio toolset
        tool_set = ComposioToolSet()
        self.composio_toolset = tool_set.get_tools(
            apps=[
                App.LOCALWORKSPACE,
                App.CMDMANAGERTOOL,
                App.HISTORYKEEPER,
            ]
        )
        # initialize agent-related different prompts
        self.agent_role = "You are the best programmer. You think carefully and step by step take action."
        self.agent_goal = "Help fix the given issue / bug in the code. And make sure you get it working."
        self.expected_output = "A patch should be generated which fixes the given issue"
        self.agent_backstory_tmpl = args.agent_backstory_tmpl
        self.issue_description_tmpl = args.issue_description_tmpl
        # initialize logger
        self.logger = logger
        # initialize agent logs and history dict
        self.agent_logs_dir = args.agent_logs_dir
        self.task_output_logs = self.agent_logs_dir / Path(
            AGENT_LOGS_JSON_PATH + datetime.datetime.now().strftime("%m_%d_%Y_%H_%M_%S")
        )
        self.agent_logs = {}
        self.agent_history = {}
        self.current_logs = []

    def save_history(self, instance_id):
        self.agent_logs[instance_id] = self.current_logs
        with open(self.task_output_logs, "w", encoding="utf-8") as f:
            f.write(json.dumps(self.agent_logs))

    def add_in_logs(self, step_output):
        if isinstance(step_output, langchain_core.agents.AgentFinish):
            self.current_logs.append(
                {
                    "agent_action": "agent_finish",
                    "agent_output": step_output.return_values,
                }
            )
        if isinstance(step_output, list) and step_output:
            agent_action_with_tool_out = step_output[0]
            if isinstance(
                agent_action_with_tool_out[0], langchain_core.agents.AgentAction
            ):
                agent_action = agent_action_with_tool_out[0]
                tool_out = (
                    agent_action_with_tool_out[1]
                    if len(agent_action_with_tool_out) > 1
                    else None
                )
                self.current_logs.append(
                    {"agent_action": agent_action.json(), "tool_output": tool_out}
                )
            else:
                self.logger.info(
                    "type of step_output: %s", type(agent_action_with_tool_out[0])
                )
        else:
            self.logger.info("type is not list: %s", type(step_output))

    def get_llm(self):
        if self.model_env.model_env == MODEL_ENV_OPENAI and isinstance(
            self.model_env, OpenAiModelConfig
        ):
            openai_key = self.model_env.api_key
            return ChatOpenAI(model="gpt-4-turbo", api_key=openai_key)
        if self.model_env.model_env == MODEL_ENV_AZURE and isinstance(
            self.model_env, AzureModelConfig
        ):
            azure_endpoint = self.model_env.azure_endpoint
            azure_key = self.model_env.api_key
            azure_llm = AzureChatOpenAI(
                azure_endpoint=azure_endpoint,
                api_key=azure_key,
                model="test",
                model_version="1106-Preview",
                api_version="2024-02-01",
            )
            return azure_llm
        raise ValueError(f"Invalid model environment: {self.model_env}")

    def run(self):
        llm = self.get_llm()

        self.logger.info(
            "starting agent for issue-id: %s\n"
            "issue-description: %s\n"
            "repo_name: %s\n",
            self.issue_config.issue_id,
            self.issue_config.issue_desc,
            self.issue_config.issue_desc,
        )

        issue_added_instruction = self.issue_description_tmpl.format(
            issue=self.issue_config.issue_desc, issue_id=self.issue_config.issue_id
        )
        backstory_added_instruction = self.agent_backstory_tmpl.format(
            repo_name=self.repo_name, base_commit=self.issue_config.base_commit_id
        )
        swe_agent = Agent(
            role=self.agent_role,
            goal=self.agent_goal,
            backstory=backstory_added_instruction,
            verbose=True,
            tools=self.composio_toolset,
            llm=llm,
            memory=True,
            cache=False,
            step_callback=self.add_in_logs,
        )

        coding_task = Task(
            description=issue_added_instruction,
            agent=swe_agent,
            expected_output=self.expected_output,
        )
        coding_task.execute()
        self.save_history(self.issue_config.issue_id)


if __name__ == "__main__":
    from composio_coders.context import Context, set_context

    issue_config = {
        "repo_name": "test_repo",
        "issue_id": "123",
        "base_commit_id": "abc",
        "issue_desc": "Fix bug",
    }
    model_env_config = {
        KEY_API_KEY: "test-api-key",
        "azure_endpoint": "azure-end-point",
        "model_env": "azure",
    }
    ctx = Context()
    ctx.issue_config = issue_config
    ctx.model_env = model_env_config
    set_context(ctx)

    args = CoderAgentArgs(
        agent_logs_dir=ctx.agent_logs_dir,
        issue_config=ctx.issue_config,
        model_env_config=ctx.model_env,
    )
    c_agent = CoderAgent(args)
    c_agent.run()
