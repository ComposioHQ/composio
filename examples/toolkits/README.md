# Vercel Example with Composio SDK

This example demonstrates how to use the Composio SDK with Vercel's AI SDK to create an AI-powered application that can interact with HackerNews data.

## Features

- Integration with Composio SDK and Vercel AI SDK
- HackerNews front page summarization using GPT-4
- Streaming AI responses
- TypeScript support

## Prerequisites

- [Node.js](https://nodejs.org/) (Latest LTS version recommended)
- [pnpm](https://pnpm.io/) (v10.8.0 or later)
- Composio API Key
- OpenAI API Key

## Getting Started

1. Clone the repository and navigate to the example directory:
```bash
cd examples/vercel
```

2. Install dependencies:
```bash
pnpm install
```

3. Copy the `.env.example` file to `.env` and fill in your API keys:
```bash
cp .env.example .env
```

4. Update the `.env` file with your credentials:
```env
COMPOSIO_API_KEY=your_composio_api_key
OPENAI_API_KEY=your_openai_api_key
```

5. Start the development server:
```bash
pnpm start
```

## How It Works

This example showcases how to:
1. Initialize the Composio SDK with the Vercel toolset
2. Use the HackerNews tool to fetch front page data
3. Generate AI responses using OpenAI's GPT-4
4. Handle tool calls and results in a chat-like interface

## Dependencies

- `@composio/core`: Core Composio SDK
- `@composio/vercel`: Vercel integration for Composio
- `@ai-sdk/openai`: OpenAI integration
- `ai`: Vercel's AI SDK
- TypeScript for type safety

## License

ISC

## Support

For questions and support, please refer to the [Composio documentation](https://docs.composio.dev) or open an issue in the repository.