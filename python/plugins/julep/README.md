## 🚀🔗 Integrating Composio with Julep

Streamline the integration of Composio within the Julep agentic framework to enhance the interaction capabilities of Julep agents with external applications, significantly extending their operational range and efficiency.

### Objective

- **Facilitate the automation of starring a GitHub repository** through the use of conversational commands within the Julep framework, leveraging Composio's OpenAI Function Calls.

### Installation and Setup

Ensure you have the necessary packages installed and connect your GitHub account to allow your agents to utilize GitHub functionalities.

```bash
# Install Composio LangChain package
pip install composio-openai

# Connect your GitHub account
composio-cli add github

# View available applications you can connect with
composio-cli show-apps
```

### Usage Steps

#### 1. Initialize Environment and Client

Set up your development environment by importing essential libraries and configuring the Julep client.
```python

import os
import textwrap
from julep import Client
from dotenv import load_dotenv


load_dotenv()

api_key = os.environ["JULEP_API_KEY"]
base_url = os.environ["JULEP_API_URL"]
# openai_api_key = os.environ["OPENAI_API_KEY"]

client = Client(api_key=api_key, base_url=base_url)



name = "Jessica"
about = "Jessica is a forward-thinking tech entrepreneur with a sharp eye for disruptive technologies. She excels in identifying and nurturing innovative tech startups, with a particular interest in sustainability and AI."
default_settings = {
    "temperature": 0.7,
    "top_p": 1,
    "min_p": 0.01,
    "presence_penalty": 0,
    "frequency_penalty": 0,
    "length_penalty": 1.0,
    "max_tokens": 150,
}
```

### 2. Integrating GitHub Tools with Composio for LangChain Operations

This section guides you through the process of integrating GitHub tools into your LangChain projects using Composio's services.
```python
from composio_julep import App, ComposioToolset
    
toolset = ComposioToolset()
composio_tools = toolset.get_tools(tools=App.GITHUB)


agent = client.agents.create(
    name=name,
    about=about,
    default_settings=default_settings,
    model="gpt-4-turbo",
    tools=composio_tools,
)
```

### Step 3: Agent Execution

This step involves configuring and executing the agent to carry out specific tasks, for example, starring a GitHub repository.
```python
about = """
Sawradip, a software developer, is passionate about impactful tech. 
At the tech fair, he seeks investors and collaborators for his project.
"""
user = client.users.create(
    name="Sawradip",
    about=about,
)

situation_prompt = """You are Jessica, a key figure in the tech community, always searching for groundbreaking technologies. At a tech fair filled with innovative projects, your goal is to find and support the next big thing.

Your journey through the fair is highlighted by encounters with various projects, from groundbreaking to niche. You believe in the power of unexpected innovation.

Recent Tweets
1. 'Amazed by the tech fair's creativity. The future is bright. #TechInnovation'
2. 'Met a developer with a transformative tool for NGOs. This is the
"""

session = client.sessions.create(
    user_id=user.id, agent_id=agent.id, situation=situation_prompt
)

user_msg = "Hi, I am presenting my project, hosted at github repository composiohq/composio. If you like it, adding a star would be helpful "

# user_msg = "What do you like about tech?"

response = client.sessions.chat(
    session_id=session.id,
    messages=[
        {
            "role": "user",
            "content": user_msg,
            "name": "Sawradip",
        }
    ],
    recall=True,
    remember=True,
)

pprint(response)
```

### Step 4: Validate Response

Execute and validate the response to ensure the task was completed successfully.

```python
execution_output = toolset.handle_tool_calls(response)
print(execution_output)
```

