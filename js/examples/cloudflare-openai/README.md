## About
This project demonstrates how to use Composio with Cloudflare Workers and OpenAI to create GitHub issues using AI. The example showcases the integration between Composio's GitHub tools and OpenAI's chat completions.

## Prerequisites
### API Keys and Configuration
- Composio API key (add to wrangler.toml)
- OpenAI API key (add to wrangler.toml)
- GitHub integration setup through Composio
- Cloudflare account for Workers deployment

### Wrangler Configuration
- Set `node_compat = true` in wrangler.toml
- Set `compatibility_date` in wrangler.toml (e.g., "2024-07-01")

## Setup
1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Configure your entity ID:
   - Open `src/worker.js`
   - Replace `'default2'` with your entity ID in the line:
     ```javascript
     const entity = await toolset.client.getEntity('default2');
     ```

3. Set up GitHub integration:
   - The first API call will return a GitHub OAuth redirect URL
   - Follow the URL to authorize GitHub access
   - Make the API call again after authorization

## Usage
The example provides a POST endpoint that creates GitHub issues:

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Sample Issue",
    "repo": "owner/repo"
  }'
```

### Response Format
- First call (if GitHub not connected):
```json
{
  "redirectUrl": "https://github.com/login/oauth/authorize...",
  "message": "Please log in to continue and then call this API again"
}
```

- Successful call (after GitHub connection):
```json
{
  "message": "Issue has been created successfully",
  "result": { ... }
}
```

## Development
1. Start the development server:
   ```bash
   pnpm run start
   ```
2. The server will be available at http://localhost:8787

## Known Issues
- The example uses GPT-4 by default. Ensure your OpenAI API key has access to GPT-4
- Workers AI will access your Cloudflare account and may incur usage charges

## For Support
- Discord: https://dub.composio.dev/discord
