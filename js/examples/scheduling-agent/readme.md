# Scheduling Agent Demo

This demo shows how to create a scheduling agent that can read emails and create calendar events automatically using Composio and Vercel.

## Setup

1. Clone the repository and navigate to this folder:
```bash
git clone https://github.com/composioHQ/composio.git
cd composio/js/examples/scheduling-agent
```

2. Install dependencies:
```bash
pnpm install
```

Required dependencies:
- `@ai-sdk/openai`: For OpenAI model integration
- `ai`: For text generation functionality
- `composio-core`: For Composio toolset and entity management
- `dotenv`: For environment variable management
- `zod`: For data validation

3. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Fill in the required API keys:
     - `COMPOSIO_API_KEY`: Your Composio API key for tool access
     - `OPENAI_API_KEY`: Your OpenAI API key for GPT-4 model access
     - `GROQ_API_KEY` (Optional): Your Groq API key if using Groq models instead of OpenAI

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env and add your API keys
nano .env
```

4. Run the demo:
```bash
node demo.mjs
```


## How it works

The demo sets up a trigger listener that:
1. Listens to new emails
2. Uses AI Agent powered by Composio to understand scheduling requests on the received emails
3. Creates calendar events via Google Calendar
4. Sends confirmation emails via Gmail

The agent will automatically process incoming messages and handle the scheduling workflow.
