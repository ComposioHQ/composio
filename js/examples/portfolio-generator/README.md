# Portfolio Generator Demo

This demo shows how to create a portfolio website using Composio and Vercel AI. The agent generates ReactJS code for a portfolio website based on your professional information and saves it to a Google Doc.

## Features
- Generates ReactJS code for a portfolio website
- Creates folder structure and setup instructions
- Saves output to Google Docs
- Uses Code Interpreter for code generation
- Integrates with Google Docs for documentation

## Setup

1. Clone the repository and navigate to this folder:
```bash
git clone https://github.com/composioHQ/composio.git
cd composio/js/examples/portfolio-generator
```

2. Install dependencies:
```bash
pnpm install
```

Required dependencies:
- `@ai-sdk/openai`: For OpenAI model integration and GPT-4 access
- `ai`: For text generation functionality
- `composio-core`: For Composio toolset and entity management
- `dotenv`: For environment variable management
- `zod`: For data validation and type safety

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

The demo:
1. Sets up a Composio toolset with Code Interpreter and Google Docs integration
2. Takes your professional information as input
3. Uses AI to generate ReactJS code for a portfolio website
4. Creates a detailed folder structure and setup instructions
5. Saves all generated content to a Google Doc

The agent will automatically process your information and generate a complete portfolio website setup.
