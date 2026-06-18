const { Composio } = require('@composio/core');
require('dotenv/config');

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

async function main() {
  console.log('Fetching tools enum...');

  const tools = await composio.tools.getToolsEnum();

  console.log('Tools enum fetched:', tools.items.length);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
