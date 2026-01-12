const { Composio } = require('@composio/core');
const { z } = require('zod/v3');
require('dotenv/config');

const composio = new Composio()

async function main() {
  console.log('Creating custom tool...');

  const tool = await composio.tools.createCustomTool({
	  name: 'My Custom Tool',
	  description: 'A custom tool that does something specific',
	  slug: 'MY_CUSTOM_TOOL',
	  inputParams: z.object({
	    param1: z.string().describe('First parameter'),
	  }),
	  execute: async (_input) => {
	    return {
        data: {
          result: 'Success!',
        },
        error: null,
        successful: true,
      };
	  },
	});

  console.log('Custom tool created:', tool);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
