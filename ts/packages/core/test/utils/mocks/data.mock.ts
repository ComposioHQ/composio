export const toolMocks = {
  rawTool: {
    slug: 'COMPOSIO_TOOL',
    name: 'Composio Tool',
    description: 'A tool for testing',
    input_parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
      },
      additionalProperties: false,
    },
    output_parameters: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
      },
      additionalProperties: false,
    },
    toolkit: {
      logo: 'https://example.com/logo.png',
      slug: 'test-toolkit',
      name: 'Test Toolkit',
    },
  },

  customTool: {
    slug: 'CUSTOM_TOOL',
    name: 'Custom Tool',
    description: 'A custom tool for testing',
    input_parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
      },
    },
    output_parameters: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
      },
    },
    toolkit: {
      logo: 'https://example.com/logo.png',
      slug: 'custom',
      name: 'custom',
    },
  },

  transformedTool: {
    slug: 'COMPOSIO_TOOL',
    name: 'Composio Tool',
    description: 'A tool for testing',
    inputParameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
      },
      additionalProperties: false,
    },
    outputParameters: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
      },
      additionalProperties: false,
    },
  },
  // Fixture for the MCP-shaped metadata regression tests (see
  // normalizeRawToolParameters in models/Tools.ts).
  mcpRawTool: {
    slug: 'GRANOLA_MCP_LIST_MEETINGS',
    name: 'List Meetings',
    description: 'Lists Granola meetings via MCP',
    input_parameters: {
      type: 'object',
      properties: {
        time_range: {
          type: 'string',
          description: 'Window to query',
        },
      },
      additionalProperties: false,
    },
    output_parameters: {},
    toolkit: {
      logo: 'https://example.com/granola.png',
      slug: 'granola_mcp',
      name: 'Granola MCP',
    },
    version: '20260206_00',
  },

  // Both inputs and outputs empty — pins the both-empty branch of
  // normalizeRawToolParameters.
  mcpRawToolBothEmpty: {
    slug: 'SOME_MCP_PING',
    name: 'Ping',
    description: 'Trivial MCP tool with no inputs and no outputs',
    input_parameters: {},
    output_parameters: {},
    toolkit: {
      logo: 'https://example.com/x.png',
      slug: 'some_mcp',
      name: 'Some MCP',
    },
    version: '20260206_00',
  },

  // transformed response from the sdk
  toolExecuteResponse: {
    data: {
      results: true,
    },
    error: null,
    successful: true,
    logId: '123',
    sessionInfo: {},
  },
  // response from the client
  rawToolExecuteResponse: {
    data: {
      results: true,
    },
    error: null,
    successful: true,
    log_id: '123',
    session_info: {},
  },
};

export const toolkitMocks = {
  rawToolkit: {
    name: 'Test Toolkit',
    slug: 'TEST_TOOLKIT',
    meta: {
      categories: [
        {
          slug: 'other-/-miscellaneous',
          name: 'Other / Miscellaneous',
        },
      ],
      createdAt: '2024-06-14T12:12:24.632Z',
      description: 'test description',
      logo: 'https://cdn.jsdelivr.net/gh/ComposioHQ/open-logos@master/hackernews.png',
      toolsCount: 6,
      triggersCount: 0,
      updatedAt: '2025-05-19T05:36:24.455Z',
    },
    isLocalToolkit: false,
    composioManagedAuthSchemes: [],
    authConfigDetails: [
      {
        name: 'Test toolkit',
        mode: 'NO_AUTH',
        fields: {
          authConfigCreation: {
            optional: [],
            required: [],
          },
          connectedAccountInitiation: {
            optional: [],
            required: [],
          },
        },
        proxy: {},
      },
    ],
  },
};

export const connectedAccountMocks = {
  rawConnectedAccountsResponse: {
    items: [
      {
        toolkit: {
          slug: 'TEST_TOOLKIT',
        },
        auth_config: {
          id: 'test-auth-config',
          auth_scheme: 'OAUTH2',
          is_composio_managed: true,
          is_disabled: false,
        },
        id: 'test-connected-account-id',
        user_id: 'default',
        status: 'ACTIVE',
        created_at: '2025-05-16T12:42:44.957Z',
        updated_at: '2025-05-16T12:42:49.676Z',
        data: {
          redirectUrl: 'https://test.com',
          code_verifier: 'test-core-verifier',
          callback_url: 'https://test.com',
          access_token: 'secret-access-token',
          token_type: 'bearer',
          scope: 'public_repo,user',
        },
        is_disabled: false,
        status_reason: null,
        uuid: 'test-uuid',
      },
    ],
  },
};
