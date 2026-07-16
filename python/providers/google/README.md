# composio-google

Adapts Composio tools to the Vertex AI SDK (`vertexai.generative_models`) as `FunctionDeclaration` objects for Gemini function calling.

## Installation

```bash
pip install composio composio-google google-cloud-aiplatform
```

Set `COMPOSIO_API_KEY` (create one at https://dashboard.composio.dev/settings) in your environment. Vertex AI authenticates with Google Cloud credentials; run `gcloud auth application-default login` or set `GOOGLE_APPLICATION_CREDENTIALS`.

## Quickstart

`GoogleProvider` is non-agentic: the model returns function calls, and `composio.provider.handle_response` executes every function call in the response and returns the results.

```python
import vertexai
from vertexai.generative_models import GenerativeModel, Tool

from composio import Composio
from composio_google import GoogleProvider

vertexai.init(project="your-gcp-project", location="us-central1")

composio = Composio(provider=GoogleProvider())

# Create a session for your user
session = composio.create(user_id="user_123")
tools = session.tools()

model = GenerativeModel(
    "gemini-2.0-flash",
    tools=[Tool(function_declarations=tools)],
)
chat = model.start_chat()

response = chat.send_message(
    "Send an email to john@example.com with the subject 'Hello' and body 'Hello from Composio!'"
)

# Execute the function calls the model requested
results = composio.provider.handle_response(user_id="user_123", response=response)
print(results)
```

To execute a single call instead of the whole response, use `composio.provider.execute_tool_call(user_id="user_123", function_call=part.function_call)`.

## composio-google vs composio-gemini

This package targets the Vertex AI SDK (`vertexai.generative_models`, installed via `google-cloud-aiplatform`). [`composio-gemini`](../gemini) targets the newer `google-genai` SDK with Automatic Function Calling. For new projects, use `composio-gemini`.

## Links

- Google provider docs: https://docs.composio.dev/docs/providers/google
- Composio docs: https://docs.composio.dev
