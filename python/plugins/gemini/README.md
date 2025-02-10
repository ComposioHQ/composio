## 🚀🔗 Integrating Composio with Google's Gemini SDK

Streamline the integration of Composio with Google AI Python to enhance the capabilities of Gemini models, allowing them to interact directly with external applications and expanding their operational scope.

### Objective

- **Automate starring a GitHub repository** using conversational instructions via Google AI Python's Function Calling feature.

### Installation and Setup

Ensure you have the necessary packages installed and connect your GitHub account to allow your agents to utilize GitHub functionalities.

```bash
# Install Composio Gemini package
pip install composio-gemini

# Connect your GitHub account
composio add github

# View available applications you can connect with
composio apps
```

### Usage Steps

#### 1. Import Base Packages

Prepare your environment by initializing necessary imports from Google AI Python and setting up your client.

```python
from google import genai

# Create google client
client = genai.Client()
```

### Step 2: Integrating GitHub Tools with Composio

This step involves fetching and integrating GitHub tools provided by Composio, enabling enhanced functionality for Google AI Python operations.
```python
from google.genai import types

from composio_gemini import Action, ComposioToolSet

# Create composio client
toolset = ComposioToolSet()

# Create tools
tools = toolset.get_tools(
    actions=[
        Action.GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER,
    ]
)

# Create genai client config
config = types.GenerateContentConfig(
    tools=tools,  # type: ignore    
)
```

### Step 3: Agent Execution

This step involves configuring and executing the agent to carry out actions, such as starring a GitHub repository.

```python
# Use the chat interface.
chat = client.chats.create(model="gemini-2.0-flash", config=config)
response = chat.send_message(
    "Can you star composiohq/composio repository on github",
)
print(response.text)
```
