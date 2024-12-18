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
pnpm install @langchain @langchain/openai composio-core express
```

## Usage

1. Navigate to the project directory:

   ```bash
   cd path/to/your/project
   ```

2. Add your environment variables in a `.env` file. Make sure to include the necessary API keys, such as `COMPOSIO_API_KEY` and `OPENAI_API_KEY`.

3. Execute the application:

   ```bash
   node demo.mjs
   ```

## Customization

You can customize the domain of market research agent by modifying the `domain` variable in the `demo.mjs` file.