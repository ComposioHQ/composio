"""
Lyzr plugin demo.
"""

from lyzr_automata import Task, Agent
from lyzr_automata.ai_models.openai import OpenAIModel
from lyzr_automata.tasks.task_literals import InputType, OutputType
from lyzr_automata.pipelines.linear_sync_pipeline import LinearSyncPipeline

import os
from composio_lyzr import ComposioToolset, App, Action

open_ai_text_completion_model = OpenAIModel(
    api_key=os.environ["OPENAI_API_KEY"],
    parameters={
        "model": "gpt-4-turbo-preview",
        "temperature": 0.2,
        "max_tokens": 1500,
    },
)


lyzr_agent = Agent(
    role="Github Agent",
    prompt_persona="You are AI agent that is responsible for taking actions on Github on users behalf. You need to take action on Github using Github APIs",
)

composio_toolset = ComposioToolset()
composio_tool = composio_toolset.get_lyzr_tool(Action.GITHUB_STAR_REPO)

task = Task(
    name="Github Starring",
    agent=lyzr_agent,
    tool=composio_tool,
    output_type=OutputType.TEXT,
    input_type=InputType.TEXT,
    model=open_ai_text_completion_model,
    instructions="Star a repo SamparkAI/docs on GitHub",
    log_output=True,
    enhance_prompt=False,
)

lyzr_output = LinearSyncPipeline(
    name="Composio Lyzr",
    # completion message after pipeline completes
    completion_message="Task completed",
    tasks=[
        # tasks are instance of Task class
        task,
    ],
).run()

print(lyzr_output)
