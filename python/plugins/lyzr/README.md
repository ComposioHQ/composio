## Using Composio With Lyzr

Integrate Composio with Lyzr agents to allow them to interact seamlessly with external apps, enhancing their functionality and reach.

### Goal

- **Star a repository on GitHub** using natural language commands through a LangChain Agent.

### Installation and Setup

Ensure you have the necessary packages installed and connect your GitHub account to allow your agents to utilize GitHub functionalities.

```bash
# Install Composio LangChain package
pip install composio-lyzr

# Connect your GitHub account
composio-cli add github

# View available applications you can connect with
composio-cli show-apps
```

### Usage

```
from  lyzr_automata  import  Task, Agent
from lyzr_automata.ai_models.openai import OpenAIModel
from lyzr_automata.tasks.task_literals import InputType, OutputType
from lyzr_automata.pipelines.linear_sync_pipeline import LinearSyncPipeline

import os
import dotenv
dotenv.load_dotenv()
from composio_lyzr import ComposioToolSet, App, Action

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
        prompt_persona="You are AI agent that is responsible for taking actions on Github on users behalf. You need to take action on Github using Github APIs"
    )

composio_toolset = ComposioToolSet()
composio_tool = composio_toolset.get_lyzr_tool(Action.GITHUB_STAR_REPO)

task = Task(
        name="Github Starring",
        agent=lyzr_agent,
        tool=composio_tool,
        output_type=OutputType.TEXT,
        input_type=InputType.TEXT,
        model=open_ai_text_completion_model,
        instructions="Star a repo composiohq/composio on GitHub",
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
```
