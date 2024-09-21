## 🚀🔗 Integrating Composio with Google AI Python

Streamline the integration of Composio with Google AI Python to enhance the capabilities of Gemini models, allowing them to interact directly with external applications and expanding their operational scope.

### Objective

- **Automate starring a GitHub repository** using conversational instructions via Google AI Python's Function Calling feature.

### Installation and Setup

Ensure you have the necessary packages installed and connect your GitHub account to allow your agents to utilize GitHub functionalities.

```bash
# Install Composio LangChain package
pip install composio-google

# Connect your GitHub account
composio-cli add github

# View available applications you can connect with
composio-cli show-apps
```

### Usage Steps

#### 1. Import Base Packages

Prepare your environment by initializing necessary imports from Google AI Python and setting up your client.

```python
from vertexai.generative_models import GenerativeModel

# Initialize Google AI Python client
model = GenerativeModel("gemini-pro")
```

### Step 2: Integrating GitHub Tools with Composio

This step involves fetching and integrating GitHub tools provided by Composio, enabling enhanced functionality for Google AI Python operations.
```python
from composio_google import App, ComposioToolset

toolset = ComposioToolset()
actions = toolset.get_tools(apps=[App.GITHUB])
```

### Step 3: Agent Execution

This step involves configuring and executing the agent to carry out actions, such as starring a GitHub repository.

```python
# Define task
task = "Star a repo composiohq/composio on GitHub"

# Send a message to the model
response = chat.send_message(task)
```

### Step 4: Validate Execution Response

Execute the following code to validate the response, ensuring that the intended task has been successfully completed.

```python
result = composio_toolset.handle_response(response)
print("Function call result:", result)
```
