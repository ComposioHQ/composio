## 🚀🔗 Integrating Composio with Google AI Python (Vertex AI)

Streamline the integration of Composio with Google AI Python to enhance the capabilities of Gemini models on Vertex AI, allowing them to interact directly with external applications and expanding their operational scope.

### Objective

- **Automate starring a GitHub repository** using conversational instructions via Gemini's function-calling feature on Vertex AI.

### Installation and Setup

Ensure you have the necessary packages installed and connect your GitHub account to allow your agents to utilize GitHub functionalities.

```bash
pip install composio composio-google google-cloud-aiplatform
```

Connect your GitHub account from the [Composio dashboard](https://platform.composio.dev/) before running the example.

> Using the standalone `google-genai` SDK instead? See the `composio-gemini` provider.

### Usage Steps

#### 1. Import Base Packages

Prepare your environment by initializing necessary imports from Google AI Python and Composio.

```python
from vertexai.generative_models import GenerativeModel, Tool

from composio import Composio
from composio_google import GoogleProvider

# Initialize Composio with the Google provider
composio = Composio(provider=GoogleProvider())
```

### Step 2: Integrating GitHub Tools with Composio

Fetch GitHub tools for the user from Composio. `GoogleProvider` returns
`vertexai.generative_models.FunctionDeclaration` objects, so wrap them in a
`Tool` before handing them to `GenerativeModel`.

```python
declarations = composio.tools.get(user_id="default", toolkits=["GITHUB"])

model = GenerativeModel(
    "gemini-1.5-pro",
    tools=[Tool(function_declarations=declarations)],
)
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
