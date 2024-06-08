"""
Lyzr plugin demo.
"""

import os

import dotenv
from composio_lyzr import Action, ComposioToolSet
from lyzr_automata import Agent, Task
from lyzr_automata.ai_models.openai import OpenAIModel
from lyzr_automata.pipelines.linear_sync_pipeline import LinearSyncPipeline
from lyzr_automata.tasks.task_literals import InputType, OutputType


# Load environment variables from .env
dotenv.load_dotenv()

# Initialize tools.
open_ai_text_completion_model = OpenAIModel(
    api_key=os.environ["OPENAI_API_KEY"],
    parameters={
        "model": "gpt-4-turbo-preview",
        "temperature": 0.2,
        "max_tokens": 1500,
    },
)
composio_toolset = ComposioToolSet()

# Define task
instructions = "Star a repo SamparkAI/docs on GitHub"

# Get required tool
(github_tool,) = composio_toolset.get_actions(
    actions=[Action.GITHUB_ACTIVITY_STAR_REPO_FOR_AUTHENTICATED_USER]
)

# Define agent
lyzr_agent = Agent(
    role="Github Agent",
    prompt_persona=(
        "You are AI agent that is responsible for taking actions on Github "
        "on users behalf. You need to take action on Github using Github APIs"
    ),
)

# Run task
task = Task(
    name="Github Starring",
    agent=lyzr_agent,
    tool=github_tool,
    output_type=OutputType.TEXT,
    input_type=InputType.TEXT,
    model=open_ai_text_completion_model,
    instructions=instructions,
    log_output=True,
    enhance_prompt=False,
)
lyzr_pipline = LinearSyncPipeline(
    name="Composio Lyzr",
    completion_message="Task completed",
    tasks=[
        task,
    ],
)

# Print the output
print(lyzr_pipline.run())
