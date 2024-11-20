# Lead Generator Agent

This project is a Lead Generator Agent built using Composio to generate a list of leads and their contact info based on your requirements and store them in a Google Spreadsheet that you can use.

## Installation

To get started with the Lead Generator Agent, you need to install the following dependencies:

- `@ai-sdk/openai`
- `ai`
- `zod`
- `composio-core`

You can install these packages using npm:

```bash
pnpm install @ai-sdk/openai ai zod composio-core
```

## Usage

1. Navigate to the project directory:

   ```bash
   cd path/to/your/project
   ```

2. Add your environment variables in a `.env` file.

3. Execute the demo script:

   ```bash
   node demo.mjs
   ```

## Customization

You can customize the email written by the Agent by modifying the following variables in the code:

- `my_details`
- `lead_details`
- `purpose`

Make sure to update these variables to fit your specific needs.