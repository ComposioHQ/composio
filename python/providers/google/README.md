## 🚀🔗 Integrating Composio with Google AI Python (Vertex AI)

Streamline the integration of Composio with Google AI Python to enhance the capabilities of Gemini models on Vertex AI, allowing them to interact directly with external applications and expanding their operational scope.

### Objective

- **Automate starring a GitHub repository** using conversational instructions via Gemini's function-calling feature on Vertex AI.

### Installation and Setup

Ensure you have the necessary packages installed and connect your GitHub account to allow your agents to utilize GitHub functionalities.

```bash
# Install Composio core and the Google (Vertex AI) provider
pip install composio composio-google google-cloud-aiplatform

# Connect your GitHub account
composio add github

# View available toolkits you can connect with
composio toolkits
```

> Using the standalone `google-genai` SDK instead? See the `composio-gemini` provider.

### Usage Steps

#### 1. Import Base Packages

Prepare your environment by initializing necessary imports from Google AI Python and Composio.

```python
from vertexai.generative_models import GenerativeModel

from composio import Composio
from composio_google import GoogleProvider

# Initialize Composio with the Google provider
composio = Composio(provider=GoogleProvider())
```

### Step 2: Integrating GitHub Tools with Composio

Fetch GitHub tools for the user from Composio and attach them to a Gemini model.

```python
tool = composio.tools.get(user_id="default", toolkits=["GITHUB"])

model = GenerativeModel("gemini-1.5-pro", tools=[tool])
chat = model.start_chat()
```

### Step 3: Agent Execution

Send a message to Gemini.

```python
task = "Star a repo composiohq/composio on GitHub"

response = chat.send_message(task)
print(response)
```

### Step 4: Validate Execution Response

Have Composio handle any tool calls the model produced and return the results.

```python
result = composio.provider.handle_response(user_id="default", response=response)
print("Function call result:", result)
```
