import { Composio } from '@composio/core';
import { z } from 'zod';

const composio = new Composio();

const bearerToken = 'ghp_YourPersonalAccessToken...';
// const userId = 'user@acme.com';
const userId = 'sid';

// const tool = await composio.tools.createCustomTool({
//   slug: 'GITHUB_SEARCH_REPOSITORIES',
//   name: 'Search GitHub Repositories',
//   description: 'Search for repositories with custom parameters',
//   toolkitSlug: 'github',
//   inputParams: z.object({
//     query: z.string().describe('Search query'),
//     perPage: z.number().optional().describe('Results per page'),
//   }),
//   execute: async (input, connectionConfig, executeToolRequest) => {
//     const result = await executeToolRequest({
//       endpoint: '/search/repositories',
//       method: 'GET',
//       parameters: [
//         // Add custom auth header
//         {
//           name: 'Authorization',
//           value: `Bearer ${bearerToken}`,
//           in: 'header',
//         },
//       ],
//     });
//     return result;
//   },
// });

const customToolSlug = 'GITHUB_STAR_COMPOSIOHQ_REPOSITORY';
const tool_1 = await composio.tools.createCustomTool({
  slug: customToolSlug,
  name: 'Github star composio repositories',
  toolkitSlug: 'github',
  description: 'For any given repository of the user composiohq, star the repository',
  inputParams: z.object({
    repository: z.string().describe('The repository to star'),
  }),
  execute: async (input, connectionConfig, executeToolRequest) => {
    console.log('🚀 ~ execute: ~ params:', input);
    console.log('🚀 ~ execute: ~ connectionConfig:', connectionConfig);

    const result = await executeToolRequest({
      endpoint: `/user/starred/composiohq/${input.repository}`,
      method: 'PUT',
    });
    return result;
  },
});

const result = await composio.tools.execute(tool_1.slug, {
  arguments: {
    repository: 'composio',
  },
  userId,
  connectedAccountId: 'ca_XOVkjOlY95qN',
});

console.log(result);
