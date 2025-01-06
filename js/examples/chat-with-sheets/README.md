# Chat with Sheets Example

This example demonstrates how to create a chat interface that interacts with Google Sheets using Composio, Next.js, and OpenAI. The application allows users to chat with an AI assistant that can read from and write to Google Sheets.

## Prerequisites

Before running this example, make sure you have:

1. A Composio API key
2. Google Sheets integration set up in your Composio account
3. Node.js >= 18.0.0
4. pnpm (recommended) or npm

## Environment Setup

1. Create a `.env.local` file in the root directory with the following variables:

```bash
# Required API Keys
COMPOSIO_API_KEY=your_composio_api_key_here

# Google Sheets Configuration (Optional - defaults to example spreadsheet)
GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id_here
```

## Google Sheets Integration

This example requires proper setup of Google Sheets integration:

1. The default entity ("default") is used for Google Sheets access
2. When first running the application:
   - The system will automatically initiate Google Sheets OAuth if not connected
   - You'll need to complete the OAuth flow by following the provided redirect URL
   - Wait up to 60 seconds for the OAuth connection to become active

## Installation

1. Install dependencies:
```bash
pnpm install
```

2. Start the development server:
```bash
pnpm dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

## Features

- Chat interface for interacting with Google Sheets
- Automatic OAuth setup for first-time users
- Support for reading and writing to Google Sheets
- Integration with OpenAI's GPT-4 model

## Troubleshooting

If you encounter issues:
1. Ensure all required dependencies are installed
2. Verify your Composio API key is correctly set in `.env.local`
3. Check that Google Sheets OAuth setup is complete
4. Wait for the OAuth connection to become active (up to 60 seconds)

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn-pages-router) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/pages/building-your-application/deploying) for more details.
