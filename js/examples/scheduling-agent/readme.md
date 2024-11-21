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

3. Create a `.env` file in this directory and add your Composio API key:
```bash
COMPOSIO_API_KEY=YOUR_COMPOSIO_API_KEY
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
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