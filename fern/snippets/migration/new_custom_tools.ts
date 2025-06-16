import { Composio } from "@composio/core";
import z from "zod";

const composio = new Composio();

const tool = await composio.tools.createCustomTool({
    slug: 'GITHUB_STAR_COMPOSIOHQ_REPOSITORY',
    name: 'Github star composio repositories',
    toolkitSlug: 'github',
    description: 'Star any specificied repo of `composiohq` user',
    inputParams: z.object({
      repository: z.string().describe('The repository to star'),
      page: z.number().optional().describe('Pagination page number'),
      customHeader: z.string().optional().describe('Custom header'),
    }),
    execute: async (input, connectionConfig, executeToolRequest) => {
      const result = await executeToolRequest({
        endpoint: `/user/starred/composiohq/${input.repository}`,
        method: 'PUT',
        body: {},
        parameters: [
          {
            name: 'page',
            value: input.page?.toString() || '1',
            in: 'query',
          },
          {
            name: 'x-custom-header',
            value: input.customHeader || 'default-value',
            in: 'header',
          },
        ],
      });
      return result;
    },
  });
  