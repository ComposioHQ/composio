# Market Research Agent

This project is a Market Research Agent built using Composio to assist in researching market trends based on user input.

## Prerequisites

Before running this example, make sure you have:
1. Node.js installed (version >= 18)
2. pnpm package manager
3. Required API keys:
   - COMPOSIO_API_KEY
   - OPENAI_API_KEY

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

## Environment Setup

1. Create a `.env` file in the project root:
```bash
cp .env.example .env
```

2. Add your API keys to the `.env` file:
```
COMPOSIO_API_KEY=your_composio_api_key
OPENAI_API_KEY=your_openai_api_key
```

## Dependencies

This example uses the following packages:
- composio-core: ^0.4.4
- dotenv: ^16.4.7
- express: ^4.19.2
- langchain: ^0.3.5
- pusher-js: 8.4.0-rc2
- @langchain/openai (required but not in package.json yet)

## Usage

1. Make sure all environment variables are set in your `.env` file.

2. Execute the application:
```bash
node demo.mjs
```

## Customization

You can customize the domain of the market research agent by modifying the `domain` variable in the `demo.mjs` file.

## Troubleshooting

1. If you encounter an error about missing '@langchain/openai' package:
   - This is a known issue
   - The package is required but not yet added to package.json
   - Please contact the maintainers or wait for the package to be added

2. Common Issues:
   - Missing API keys in .env file
   - Incorrect API key format
   - Node.js version compatibility (ensure version >= 18)
