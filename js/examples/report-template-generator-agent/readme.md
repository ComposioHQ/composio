# Report Template Generator Agent Demo

This demo shows how to create a report template generator agent that can generate report templates on Google Docs automatically using Composio and Vercel.

## Setup

1. Clone the repository and navigate to this folder:
```bash
git clone https://github.com/composioHQ/composio-js.git
cd composio/js/examples/report-template-generator-agent
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

This Agent powered by Composio generates a report template on Google Docs based on the user's request.