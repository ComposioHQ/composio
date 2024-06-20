## 🦜🔗 Using Composio With LangChain

Integrate Composio with LangChain agents to allow them to interact seamlessly with external apps, enhancing their functionality and reach.

### Goal

- **Star a repository on GitHub** using natural language commands through a LangChain Agent.

### Installation and Setup

Ensure you have the necessary packages installed and connect your GitHub account to allow your agents to utilize GitHub functionalities.

```bash
# Install Composio LangChain package
pip install composio-langchain

# Connect your GitHub account
composio-cli add github

# View available applications you can connect with
composio-cli show-apps
```

### Usage Steps

#### 1. Import Base Packages

Prepare your environment by initializing necessary imports from LangChain and setting up your agent.

```python
from langchain.agents import create_openai_functions_agent, AgentExecutor
from langchain import hub
from langchain_openai import ChatOpenAI

# Initialize LangChain OpenAI Chat
llm = ChatOpenAI()

# Pull the agent prompt configuration
prompt = hub.pull("hwchase17/openai-functions-agent")
```

#### 2. Fetch GitHub LangChain Tools via Composio

Access GitHub tools provided by Composio for LangChain.

```python
from composio_langchain import ComposioToolset, Action, App

# Initialize the toolset for GitHub
tools = ComposioToolset(apps=[App.GITHUB])
```

#### 3. Execute the Agent

Configure and execute the agent to perform tasks such as starring a repository on GitHub.

```python
task = "Star a repo SamparkAI/docs on GitHub"

# Create and set up the agent
agent = create_openai_functions_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# Execute the task
agent_executor.invoke({"input": task})
```

#### 4. Check Response

Validate the execution and response from the agent to ensure the task was completed successfully.

```bash
> Entering new AgentExecutor chain...
> Invoking: `github_star_repo` with `{'owner': 'SamparkAI', 'repo': 'docs'}`
> {'execution_details': {'executed': True}, 'response_data': ''}
> I have successfully starred the repository SamparkAI/docs on GitHub.
```

### Advanced Configuration

- **Filter Specific Actions:** Limit the actions an agent can execute.

```python
# Filter to only allow creating issues on GitHub
toolsGithubCreateIssue = ComposioToolset(actions=[Action.GITHUB_CREATE_ISSUE])
```

- **Filter Specific Apps:** Restrict the tools an agent can use.

```python
# Allow usage of Asana and GitHub only
toolsAsanaGithub = ComposioToolset(apps=[App.ASANA, App.GITHUB])
```
