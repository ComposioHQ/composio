# Composio <> CrewAI

![CrewAI Logo](https://i.imgur.com/jXeNUda.png)

**Composio** enables **CrewAI agents** to connect with numerous tools, making it easy for these agents to interact with external applications seamlessly.

## Installation and Setup

Start by installing Composio CrewAI and connecting your GitHub account to enable GitHub functionalities for your agents.

```bash
pip install composio_crewai
composio-cli add github  # Connect your GitHub account
composio-cli show-apps   # Check available applications
```

## Goal

Automate GitHub interactions, such as starring a repository, using natural language commands through a CrewAI Agent.

### Step-by-Step Guide

#### 1. Import Base Packages

Prepare your environment by importing the necessary packages for CrewAI and setting up your language model.

```python
from crewai import Agent, Task
from langchain_openai import ChatOpenAI

# Initialize the language model with your OpenAI API key
llm = ChatOpenAI(openai_api_key="sk-<OPENAI KEY>")
```

#### 2. Fetch Tools via Composio

Initialize the Composio toolset for interacting with GitHub.

```python
from composio_crewai import ComposioToolset, Action, App

# Initialize the toolset with GitHub application
tools = ComposioToolset(apps=[App.GITHUB])
```

#### 3. Execute the Agent

Configure and execute the CrewAI agent to perform GitHub actions.

```python
crewai_agent = Agent(
    role='Github Agent',
    goal="You take action on Github using Github APIs",
    backstory="You are an AI agent responsible for taking actions on Github on users' behalf using Github APIs",
    verbose=True,
    tools=tools,
    llm=llm
)

# Define the task
task = Task(
    description="Star a repo SamparkAI/docs on GitHub",
    agent=crewai_agent,
    expected_output="if the star happened"
)

# Execute the task
task.execute()
```

#### 4. Check Response

Verify the agent's actions and responses to ensure the task was completed successfully.

```bash
> Entering new CrewAgentExecutor chain...
> I need to star the repository "SamparkAI/docs" on GitHub.
> {'execution_details': {'executed': True}, 'response_data': ''}
> Finished chain.
```

### Advanced Configuration

- **Filter Specific Actions:** Limit the actions an agent can perform for enhanced security and operational focus.

```python
toolsGithubCreateIssue = ComposioToolset(actions=[Action.GITHUB_CREATE_ISSUE])
```

- **Filter Specific Apps:** Restrict the agent's access to certain applications for streamlined operations.

```python
toolsAsanaGithub = ComposioToolset(apps=[App.ASANA, App.GITHUB])
```
