# Reddit Research Agent Demo

This demo shows how to create a Reddit research agent that can research and summarize Reddit posts from a subreddit automatically using Composio and Vercel.

## Setup

1. Clone the repository and navigate to this folder:
```bash
git clone https://github.com/composioHQ/composio.git
cd composio/js/examples/reddit-research
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

This Agent powered by Composio researches and summarizes Reddit posts from a subreddit based on the user's request.
