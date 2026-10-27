# composio-gemini

Adapts Composio tools to the [`google-genai`](https://pypi.org/project/google-genai/) SDK as Python callables compatible with Gemini's Automatic Function Calling.

## Installation

```bash
pip install composio composio-gemini google-genai
```

Set `COMPOSIO_API_KEY` (create one at https://dashboard.composio.dev/settings) and `GOOGLE_API_KEY` (from https://aistudio.google.com/apikey) in your environment.

## Quickstart

`GeminiProvider` wraps each Composio tool as a typed Python callable. Pass the callables to `GenerateContentConfig(tools=...)` and the `google-genai` SDK derives function declarations from their signatures and executes tool calls automatically inside the chat loop; there is no manual tool-call handling.

```python
from composio import Composio
from composio_gemini import GeminiProvider
from google import genai
from google.genai import types

composio = Composio(provider=GeminiProvider())
client = genai.Client()

# Create a session for your user
session = composio.create(user_id="user_123")
tools = session.tools()

config = types.GenerateContentConfig(tools=tools)
chat = client.chats.create(model="gemini-3-pro-preview", config=config)

response = chat.send_message(
    "Send an email to john@example.com with the subject 'Hello' and body 'Hello from Composio!'"
)
print(response.text)
```

If you disable Automatic Function Calling and handle function calls yourself, `composio.provider.handle_response(response, session=session)` executes the function calls in a Gemini response through that session and returns `Part` objects ready to send back. For tools fetched with `composio.tools.get(user_id=...)`, pass `user_id=` instead:

```python
function_responses, executed = composio.provider.handle_response(
    response, user_id="user_123"
)
```

A Gemini response does not record which user it belongs to, so pass the user or session whenever one `Composio` instance serves more than one. Without one, `handle_response` raises a `ValueError` for a tool fetched for more than one user or session. With `user_id`, pass any execution modifiers to `handle_response(..., modifiers=...)`; the ones given to `tools.get()` do not apply.

## composio-gemini vs composio-google

This package targets the `google-genai` SDK (`from google import genai`). [`composio-google`](../google) targets the older Vertex AI SDK (`vertexai.generative_models`). For new projects, Google recommends `google-genai`, so use this package.

## Links

- Google provider docs: https://docs.composio.dev/docs/providers/google
- Composio docs: https://docs.composio.dev
