## 🚀🔗 Leveraging PraisonAI with Composio

Facilitate the integration of PraisonAI with Composio to empower Praison Agents to directly interact with external applications, broadening their capabilities and application scope.

### Objective

- **Automate starring a GitHub repository** using conversational instructions via PraisonAI Agents.

### Installation and Setup

Ensure you have the necessary packages installed and connect your GitHub account to allow your agents to utilize GitHub functionalities.

```bash
# Install Composio LangChain package
pip install composio-praisonai

# Connect your GitHub account
composio-cli add github

# View available applications you can connect with
composio-cli show-apps
```

### Usage Steps

#### 1. Import Base Packages

Prepare your environment by initializing necessary imports from Praison and setting up your client.

```python
import os
import yaml
from praisonai import PraisonAI
```

### Step 2: Write the Praison-supported Composio Tools ins `tools.py` file.

This step involves fetching and integrating GitHub tools provided by Composio, and writing them in Praison supported Format, returning the name of tools in a format, that should be added to `agents.yml` file.
```python
from composio_praisonai import Action, ComposioToolSet

composio_toolset = ComposioToolSet()
tools = composio_toolset.get_actions(
    actions=[Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER]
)

tool_section_str = composio_toolset.get_tools_section(tools)
print(tool_section_str)
```

### Step 3: Define the 'agents_yml` either in a separate file, or in your script.

This step involves configuring and executing the agent to carry out actions, such as starring a GitHub repository.

```python
agent_yaml = """
framework: "crewai"
topic: "Github Management"

roles:
  developer:
    role: "Developer"
    goal: "An expert programmer"
    backstory: "A developer exploring new codebases and have certain tools available to execute different tasks."
    tasks:
      star_github:
        description: "Star a repo composiohq/composio on GitHub"
        expected_output: "Response whether the task was executed."
""" + tool_section_str

print(agent_yaml)
```

### Step 4: Run the Praison Agents to execute the goal/task.

Here you initialize PraisonAI class, and execute.
```python
# Create a PraisonAI instance with the agent_yaml content
praison_ai = PraisonAI(agent_yaml=agent_yaml)

# Run PraisonAI
result = praison_ai.main()

# Print the result
print(result)
```
