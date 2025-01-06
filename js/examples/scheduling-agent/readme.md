# Scheduling Agent Demo

This demo shows how to create a scheduling agent that can read emails and create calendar events automatically using Composio and Vercel.

## Prerequisites

Before running this example, make sure you have:
1. Node.js installed (version >= 18)
2. pnpm package manager
3. Required API keys:
   - COMPOSIO_API_KEY (for Composio integration)
   - OPENAI_API_KEY (for GPT-4 model access)
4. Configured Composio entity with:
   - Google Calendar integration
   - Gmail integration
   - Proper permissions for email and calendar access

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

3. Create a `.env` file in this directory with your API keys:
```bash
COMPOSIO_API_KEY=YOUR_COMPOSIO_API_KEY
OPENAI_API_KEY=YOUR_OPENAI_API_KEY  # Required for GPT-4 model
```

4. Configure Entity:
   - The demo uses a default entity ID ('default')
   - Ensure the entity exists in your Composio account
   - Set up Google Calendar and Gmail integrations for this entity
   - Verify the entity has proper permissions

5. Run the demo:
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

## Dependencies

This example uses the following packages:
- @ai-sdk/openai: ^0.0.36 (for OpenAI integration)
- ai: ^3.2.24 (for text generation)
- composio-core: 0.2.9-7 (core Composio functionality)
- dotenv: ^16.4.5 (environment variable management)
- zod: ^3.23.8 (schema validation)

## Troubleshooting

1. TypeError: Cannot read properties of undefined (reading 'subscribe'):
   - This error occurs when the toolset.triggers is not properly initialized
   - Common causes:
     - Invalid or expired COMPOSIO_API_KEY
     - Entity 'default' does not exist or lacks proper configuration
     - Missing Google Calendar or Gmail integration setup
   - Solution:
     - Verify your COMPOSIO_API_KEY is valid
     - Check entity configuration in Composio dashboard
     - Set up required integrations for the entity

2. OpenAI API Errors:
   - Make sure OPENAI_API_KEY is set and valid
   - The demo uses GPT-4 model ("gpt-4o")
   - Verify you have access to GPT-4 in your OpenAI account

3. Integration Issues:
   - Ensure Google Calendar integration is properly configured
   - Verify Gmail integration permissions
   - Check entity permissions in Composio dashboard

## Required Permissions

The scheduling agent needs the following permissions:
1. Gmail:
   - Read email content
   - Send emails
2. Google Calendar:
   - Create events
   - Read calendar data
3. Composio:
   - Access to triggers
   - Entity management permissions
