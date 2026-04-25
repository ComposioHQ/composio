## 🚀🔗 Integrating Composio with Google's Gemini SDK

Streamline the integration of Composio with the Google GenAI (Gemini) SDK to enhance the capabilities of Gemini models, allowing them to interact directly with external applications and expanding their operational scope.

### Objective

- **Automate starring a GitHub repository** using conversational instructions via Gemini's function-calling feature.

### Installation and Setup

Ensure you have the necessary packages installed and connect your GitHub account to allow your agents to utilize GitHub functionalities.

```bash
# Install Composio core and the Gemini provider
pip install composio composio-gemini google-genai

# Connect your GitHub account
composio add github

# View available toolkits you can connect with
composio toolkits
```

### Usage Steps

#### 1. Import Base Packages

Prepare your environment by initializing necessary imports from Google's GenAI SDK and Composio.

```python
from google import genai
from google.genai import types

from composio import Composio
from composio_gemini import GeminiProvider

# Initialize Composio with the Gemini provider
composio = Composio(provider=GeminiProvider())

# Create the Google GenAI client
client = genai.Client()
```

### Step 2: Integrating GitHub Tools with Composio

Fetch a specific GitHub tool from Composio and attach it to a Gemini config.

```python
config = types.GenerateContentConfig(
    tools=composio.tools.get(
        user_id="default",
        tools=["GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER"],
    )
)
```

### Step 3: Agent Execution

Use the chat interface to talk to Gemini.

```python
chat = client.chats.create(model="gemini-2.0-flash", config=config)
response = chat.send_message(
    "Can you star composiohq/composio repository on github",
)
print(response.text)
```
