# Market Research Agent

This project is a Market Research Agent built using Composio to assist in researching market trends based on user input.

## Installation

1. Clone the repository and navigate to this folder:
```bash
git clone https://github.com/composioHQ/composio.git
cd composio/js/examples/market_research_agent
```

2. Install dependencies:
```bash
pnpm install
```

Required dependencies:
- `@langchain/openai`: For OpenAI model integration
- `composio-core`: For Composio toolset functionality
- `express`: For web server functionality (if running as a service)

## Usage

1. Navigate to the project directory:

   ```bash
   cd path/to/your/project
   ```

2. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Fill in the required API keys:
     - `COMPOSIO_API_KEY`: Your Composio API key for tool access
     - `OPENAI_API_KEY`: Your OpenAI API key for GPT-4 model access

3. Execute the application:

   ```bash
   node demo.mjs
   ```

## Customization

You can customize the domain of market research agent by modifying the `domain` variable in the `demo.mjs` file.
