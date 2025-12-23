# LiveKit Voice Agent with Composio Tools

This example demonstrates how to create a LiveKit voice agent that can use Composio tools to perform actions like web search, sending emails, posting to Slack, and more.

## Prerequisites

1. **LiveKit Cloud Account**: Sign up at [LiveKit Cloud](https://cloud.livekit.io/)
2. **Composio Account**: Sign up at [Composio](https://composio.dev/)
3. **OpenAI API Key**: Get one from [OpenAI Platform](https://platform.openai.com/)

## Installation

```bash
# Install dependencies
pip install \
  "livekit-agents[silero,turn-detector]~=1.3" \
  "livekit-plugins-noise-cancellation~=0.2" \
  "python-dotenv" \
  "composio"

# Install the local Composio LiveKit provider (for development)
pip install -e ../../providers/livekit
```

## Environment Setup

Use the LiveKit CLI to load your credentials:

```bash
# This will create a .env file with your LiveKit credentials
lk app env -w -d .env
```

Then add your other API keys to the `.env` file:

```bash
# .env file contents
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
LIVEKIT_URL=wss://your-project.livekit.cloud

OPENAI_API_KEY=your_openai_api_key
COMPOSIO_API_KEY=your_composio_api_key
```

## Running the Agent

```bash
# Development mode (auto-reload on changes)
python agent.py dev

# Production mode
python agent.py start
```

## Connecting to the Agent

Once the agent is running, you can connect to it using:

1. **LiveKit Playground**: Go to your LiveKit Cloud dashboard and use the built-in playground
2. **Custom Frontend**: Build a frontend using the [LiveKit Client SDKs](https://docs.livekit.io/client-sdk/)

## Customizing Tools

Edit the `agent.py` file to change which Composio tools are available to the agent:

```python
# Example: Add email and Slack tools
composio_tools = composio.tools.get(
    user_id="default",
    slug=[
        "GMAIL_SEND_EMAIL",
        "SLACK_POST_MESSAGE",
        "GITHUB_CREATE_ISSUE",
        "TAVILY_TAVILY_SEARCH",
    ],
)
```

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   LiveKit Room  │────▶│  Voice Agent     │────▶│  Composio Tools │
│   (WebRTC)      │     │  (STT→LLM→TTS)   │     │  (APIs)         │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                        │                        │
        │                        │                        │
   User Voice              Agent Logic              External APIs
   Input/Output            & Tool Calls            (Gmail, Slack, etc.)
```

## License

Apache 2.0
