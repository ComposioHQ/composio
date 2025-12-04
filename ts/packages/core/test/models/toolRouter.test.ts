import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRouter } from '../../src/models/ToolRouter';
import ComposioClient from '@composio/client';
import { telemetry } from '../../src/telemetry/Telemetry';
import { MockProvider } from '../utils/mocks/provider.mock';
import { Tools } from '../../src/models/Tools';
import { ConnectedAccountStatuses } from '../../src/types/connectedAccounts.types';
import { ToolRouterCreateSessionConfig, ToolRouterSession } from '../../src/types/toolRouter.types';

// Mock dependencies
vi.mock('../../src/telemetry/Telemetry', () => ({
  telemetry: {
    instrument: vi.fn(),
  },
}));

vi.mock('../../src/models/Tools', () => {
  return {
    Tools: vi.fn().mockImplementation(() => ({
      get: vi.fn().mockResolvedValue('mocked-wrapped-tools'),
    })),
  };
});

// Create mock client with ToolRouter-related methods
const createMockClient = () => ({
  baseURL: 'https://api.composio.dev',
  apiKey: 'test-api-key',
  toolRouter: {
    session: {
      create: vi.fn(),
      retrieve: vi.fn(),
      link: vi.fn(),
      toolkits: vi.fn(),
    },
  },
  tools: {
    list: vi.fn(),
    retrieve: vi.fn(),
    execute: vi.fn(),
  },
});

// Mock response data
const mockSessionCreateResponse = {
  session_id: 'session_123',
  mcp: {
    type: 'HTTP',
    url: 'https://mcp.example.com/session_123',
  },
  tool_router_tools: ['GMAIL_FETCH_EMAILS', 'SLACK_SEND_MESSAGE', 'GITHUB_CREATE_ISSUE'],
};

const mockLinkResponse = {
  connected_account_id: 'conn_456',
  redirect_url: 'https://composio.dev/auth/redirect',
};

const mockSessionRetrieveResponse = {
  session_id: 'session_123',
  mcp: {
    type: 'HTTP',
    url: 'https://mcp.example.com/session_123',
  },
  tool_router_tools: ['GMAIL_FETCH_EMAILS', 'SLACK_SEND_MESSAGE', 'GITHUB_CREATE_ISSUE'],
  config: {
    user_id: 'user_123',
    toolkits: { enabled: ['gmail', 'slack', 'github'] },
    auth_configs: {},
    connected_accounts: {},
    connections: {
      auto_manage_connections: true,
      infer_scopes_from_tools: false,
    },
  },
};

const mockToolkitsResponse = {
  items: [
    {
      slug: 'gmail',
      name: 'Gmail',
      meta: {
        logo: 'https://example.com/gmail-logo.png',
      },
      connected_account: {
        id: 'conn_123',
        status: 'ACTIVE',
        auth_config: {
          id: 'auth_config_123',
          auth_scheme: 'OAUTH2',
          is_composio_managed: true,
        },
      },
    },
    {
      slug: 'slack',
      name: 'Slack',
      meta: {
        logo: 'https://example.com/slack-logo.png',
      },
      connected_account: {
        id: 'conn_456',
        status: 'INITIATED',
        auth_config: {
          id: 'auth_config_456',
          auth_scheme: 'OAUTH2',
          is_composio_managed: true,
        },
      },
    },
    {
      slug: 'github',
      name: 'GitHub',
      meta: {
        logo: 'https://example.com/github-logo.png',
      },
      connected_account: null,
    },
  ],
  next_cursor: 'cursor_789',
  total_pages: 2,
};

describe('ToolRouter', () => {
  let toolRouter: ToolRouter<unknown, unknown, MockProvider>;
  let mockClient: ReturnType<typeof createMockClient>;
  let mockProvider: MockProvider;

  // Helper function to create expected connections object
  const createExpectedConnections = (
    overrides: {
      manageConnections?: boolean;
      callbackUri?: string;
      inferScopesFromTools?: boolean;
    } = {}
  ) => ({
    infer_scopes_from_tools: overrides.inferScopesFromTools ?? false,
    auto_manage_connections: overrides.manageConnections ?? true,
    callback_uri: overrides.callbackUri ?? undefined,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    mockProvider = new MockProvider();
    toolRouter = new ToolRouter(mockClient as unknown as ComposioClient, {
      provider: mockProvider,
    });
  });

  describe('constructor', () => {
    it('should create an instance successfully', () => {
      expect(toolRouter).toBeInstanceOf(ToolRouter);
      expect(telemetry.instrument).toHaveBeenCalledWith(toolRouter, 'ToolRouter');
    });

    it('should store the client reference', () => {
      expect(toolRouter['client']).toBe(mockClient);
    });

    it('should store the config reference', () => {
      expect(toolRouter['config']).toEqual({ provider: mockProvider });
    });
  });

  describe('create method', () => {
    const userId = 'user_123';

    describe('basic session creation', () => {
      it('should create a session with minimal configuration', async () => {
        mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

        const session = await toolRouter.create(userId);

        expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
          user_id: userId,
          toolkits: undefined,
          auth_configs: undefined,
          connected_accounts: undefined,
          tools: undefined,
          connections: createExpectedConnections(),
          execution: undefined,
        });

        expect(session).toHaveProperty('sessionId', 'session_123');
        expect(session).toHaveProperty('mcp');
        expect(session.mcp).toEqual({
          type: 'HTTP',
          url: 'https://mcp.example.com/session_123',
        });
        expect(session).toHaveProperty('tools');
        expect(session).toHaveProperty('authorize');
        expect(session).toHaveProperty('toolkits');
      });

      it('should create a session with empty config object', async () => {
        mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

        const session = await toolRouter.create(userId, {});

        expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
          user_id: userId,
          toolkits: undefined,
          auth_configs: undefined,
          connected_accounts: undefined,
          tools: undefined,
          connections: createExpectedConnections(),
          execution: undefined,
        });

        expect(session.sessionId).toBe('session_123');
      });

      it('should create a session with user ID only and verify MCP type transformation', async () => {
        mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

        const session = await toolRouter.create(userId);

        expect(session.mcp.type).toBe('HTTP');
        expect(mockClient.toolRouter.session.create).toHaveBeenCalledTimes(1);
      });
    });

    describe('toolkits configuration', () => {
      it('should create a session with toolkits as array (enabled toolkits)', async () => {
        mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

        const config: ToolRouterCreateSessionConfig = {
          toolkits: ['gmail', 'slack', 'github'],
        };

        await toolRouter.create(userId, config);

        expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
          user_id: userId,
          toolkits: {
            enabled: ['gmail', 'slack', 'github'],
          },
          auth_configs: undefined,
          connected_accounts: undefined,
          tools: undefined,
          connections: createExpectedConnections(),
          execution: undefined,
        });
      });

      it('should create a session with enabled toolkits configuration', async () => {
        mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

        const config: ToolRouterCreateSessionConfig = {
          toolkits: {
            enabled: ['gmail', 'slack'],
          },
        };

        await toolRouter.create(userId, config);

        expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
          user_id: userId,
          toolkits: {
            enabled: ['gmail', 'slack'],
          },
          auth_configs: undefined,
          connected_accounts: undefined,
          tools: undefined,
          connections: createExpectedConnections(),
          execution: undefined,
        });
      });

      it('should create a session with disabled toolkits configuration', async () => {
        mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

        const config: ToolRouterCreateSessionConfig = {
          toolkits: {
            disabled: ['notion', 'trello'],
          },
        };

        await toolRouter.create(userId, config);

        expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
          user_id: userId,
          toolkits: {
            disabled: ['notion', 'trello'],
          },
          auth_configs: undefined,
          connected_accounts: undefined,
          tools: undefined,
          connections: createExpectedConnections(),
          execution: undefined,
        });
      });
    });

    // describe('tools configuration', () => {
    //   it('should create a session with tools overrides as array', async () => {
    //     mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

    //     const config: ToolRouterCreateSessionConfig = {
    //       tools: {
    //         overrides: {
    //           gmail: ['GMAIL_FETCH_EMAILS', 'GMAIL_SEND_EMAIL'],
    //         },
    //       },
    //     };

    //     await toolRouter.create(userId, config);

    //     expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
    //       user_id: userId,
    //       toolkits: undefined,
    //       auth_configs: undefined,
    //       connected_accounts: undefined,
    //       tools: {
    //         overrides: {
    //           gmail: { enabled: ['GMAIL_FETCH_EMAILS', 'GMAIL_SEND_EMAIL'] },
    //         },
    //         filters: undefined,
    //       },
    //       connections: createExpectedConnections(),
    //       execution: undefined,
    //     });
    //   });

    //   it('should create a session with tools overrides with enabled tools', async () => {
    //     mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

    //     const config: ToolRouterCreateSessionConfig = {
    //       tools: {
    //         overrides: {
    //           gmail: { enabled: ['GMAIL_FETCH_EMAILS', 'GMAIL_SEND_EMAIL'] },
    //         },
    //       },
    //     };

    //     await toolRouter.create(userId, config);

    //     expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
    //       user_id: userId,
    //       toolkits: undefined,
    //       auth_configs: undefined,
    //       connected_accounts: undefined,
    //       tools: {
    //         overrides: {
    //           gmail: { enabled: ['GMAIL_FETCH_EMAILS', 'GMAIL_SEND_EMAIL'] },
    //         },
    //         filters: undefined,
    //       },
    //       connections: createExpectedConnections(),
    //       execution: undefined,
    //     });
    //   });

    //   it('should create a session with tools overrides with disabled tools', async () => {
    //     mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

    //     const config: ToolRouterCreateSessionConfig = {
    //       tools: {
    //         overrides: {
    //           gmail: { disabled: ['GMAIL_DELETE_EMAIL'] },
    //         },
    //       },
    //     };

    //     await toolRouter.create(userId, config);

    //     expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
    //       user_id: userId,
    //       toolkits: undefined,
    //       auth_configs: undefined,
    //       connected_accounts: undefined,
    //       tools: {
    //         overrides: {
    //           gmail: { disabled: ['GMAIL_DELETE_EMAIL'] },
    //         },
    //         filters: undefined,
    //       },
    //       connections: createExpectedConnections(),
    //       execution: undefined,
    //     });
    //   });

    //   it('should create a session with tag filters as array', async () => {
    //     mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

    //     const config: ToolRouterCreateSessionConfig = {
    //       tools: {
    //         tags: ['important', 'email'],
    //       },
    //     };

    //     await toolRouter.create(userId, config);

    //     expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
    //       user_id: userId,
    //       toolkits: undefined,
    //       auth_configs: undefined,
    //       connected_accounts: undefined,
    //       tools: {
    //         overrides: undefined,
    //         filters: {
    //           tags: { include: ['important', 'email'] },
    //         },
    //       },
    //       connections: createExpectedConnections(),
    //       execution: undefined,
    //     });
    //   });

    //   it('should create a session with enabled tag filters', async () => {
    //     mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

    //     const config: ToolRouterCreateSessionConfig = {
    //       tools: {
    //         tags: { enabled: ['important', 'email'] },
    //       },
    //     };

    //     await toolRouter.create(userId, config);

    //     expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
    //       user_id: userId,
    //       toolkits: undefined,
    //       auth_configs: undefined,
    //       connected_accounts: undefined,
    //       tools: {
    //         overrides: undefined,
    //         filters: {
    //           tags: { include: ['important', 'email'] },
    //         },
    //       },
    //       connections: createExpectedConnections(),
    //       execution: undefined,
    //     });
    //   });

    //   it('should create a session with disabled tag filters', async () => {
    //     mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

    //     const config: ToolRouterCreateSessionConfig = {
    //       tools: {
    //         tags: { disabled: ['dangerous'] },
    //       },
    //     };

    //     await toolRouter.create(userId, config);

    //     expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
    //       user_id: userId,
    //       toolkits: undefined,
    //       auth_configs: undefined,
    //       connected_accounts: undefined,
    //       tools: {
    //         overrides: undefined,
    //         filters: {
    //           tags: { exclude: ['dangerous'] },
    //         },
    //       },
    //       connections: createExpectedConnections(),
    //       execution: undefined,
    //     });
    //   });

    //   it('should create a session with both overrides and tag filters', async () => {
    //     mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

    //     const config: ToolRouterCreateSessionConfig = {
    //       tools: {
    //         overrides: {
    //           gmail: ['GMAIL_FETCH_EMAILS'],
    //           slack: { disabled: ['SLACK_DELETE_MESSAGE'] },
    //         },
    //         tags: ['important'],
    //       },
    //     };

    //     await toolRouter.create(userId, config);

    //     expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
    //       user_id: userId,
    //       toolkits: undefined,
    //       auth_configs: undefined,
    //       connected_accounts: undefined,
    //       tools: {
    //         overrides: {
    //           gmail: { enabled: ['GMAIL_FETCH_EMAILS'] },
    //           slack: { disabled: ['SLACK_DELETE_MESSAGE'] },
    //         },
    //         filters: {
    //           tags: { include: ['important'] },
    //         },
    //       },
    //       connections: createExpectedConnections(),
    //       execution: undefined,
    //     });
    //   });
    // });

    describe('manageConnections configuration', () => {
      it('should create a session with manageConnections as boolean (true)', async () => {
        mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

        const config: ToolRouterCreateSessionConfig = {
          manageConnections: true,
        };

        await toolRouter.create(userId, config);

        expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
          user_id: userId,
          toolkits: undefined,
          auth_configs: undefined,
          connected_accounts: undefined,
          tools: undefined,
          connections: createExpectedConnections({ manageConnections: true }),
          execution: undefined,
        });
      });

      it('should create a session with manageConnections as boolean (false)', async () => {
        mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

        const config: ToolRouterCreateSessionConfig = {
          manageConnections: false,
        };

        await toolRouter.create(userId, config);

        expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
          user_id: userId,
          toolkits: undefined,
          auth_configs: undefined,
          connected_accounts: undefined,
          tools: undefined,
          connections: createExpectedConnections({ manageConnections: false }),
          execution: undefined,
        });
      });

      it('should create a session with manageConnections as object with enabled', async () => {
        mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

        const config: ToolRouterCreateSessionConfig = {
          manageConnections: {
            enabled: true,
            inferScopesFromTools: false,
          },
        };

        await toolRouter.create(userId, config);

        expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
          user_id: userId,
          toolkits: undefined,
          auth_configs: undefined,
          connected_accounts: undefined,
          tools: undefined,
          connections: createExpectedConnections({ manageConnections: true }),
          execution: undefined,
        });
      });

      it('should create a session with manageConnections object with callbackUri', async () => {
        mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

        const config: ToolRouterCreateSessionConfig = {
          manageConnections: {
            enabled: true,
            callbackUri: 'https://myapp.com/callback',
            inferScopesFromTools: false,
          },
        };

        await toolRouter.create(userId, config);

        expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
          user_id: userId,
          toolkits: undefined,
          auth_configs: undefined,
          connected_accounts: undefined,
          tools: undefined,
          connections: createExpectedConnections({
            manageConnections: true,
            callbackUri: 'https://myapp.com/callback',
          }),
          execution: undefined,
        });
      });

      it('should create a session with manageConnections object with inferScopesFromTools', async () => {
        mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

        const config: ToolRouterCreateSessionConfig = {
          manageConnections: {
            enabled: true,
            inferScopesFromTools: true,
          },
        };

        await toolRouter.create(userId, config);

        expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
          user_id: userId,
          toolkits: undefined,
          auth_configs: undefined,
          connected_accounts: undefined,
          tools: undefined,
          connections: createExpectedConnections({
            manageConnections: true,
            inferScopesFromTools: true,
          }),
          execution: undefined,
        });
      });

      it('should create a session with full manageConnections configuration', async () => {
        mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

        const config: ToolRouterCreateSessionConfig = {
          manageConnections: {
            enabled: true,
            callbackUri: 'https://myapp.com/callback',
            inferScopesFromTools: true,
          },
        };

        await toolRouter.create(userId, config);

        expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
          user_id: userId,
          toolkits: undefined,
          auth_configs: undefined,
          connected_accounts: undefined,
          tools: undefined,
          connections: createExpectedConnections({
            manageConnections: true,
            inferScopesFromTools: true,
            callbackUri: 'https://myapp.com/callback',
          }),
          execution: undefined,
        });
      });
    });

    describe('authConfigs and connectedAccounts configuration', () => {
      it('should create a session with authConfigs', async () => {
        mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

        const config: ToolRouterCreateSessionConfig = {
          authConfigs: {
            gmail: 'auth_config_123',
            slack: 'auth_config_456',
          },
        };

        await toolRouter.create(userId, config);

        expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
          user_id: userId,
          toolkits: undefined,
          auth_configs: {
            gmail: 'auth_config_123',
            slack: 'auth_config_456',
          },
          connected_accounts: undefined,
          tools: undefined,
          connections: createExpectedConnections(),
          execution: undefined,
        });
      });

      it('should create a session with connectedAccounts', async () => {
        mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

        const config: ToolRouterCreateSessionConfig = {
          connectedAccounts: {
            gmail: 'conn_123',
            slack: 'conn_456',
          },
        };

        await toolRouter.create(userId, config);

        expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
          user_id: userId,
          toolkits: undefined,
          auth_configs: undefined,
          connected_accounts: {
            gmail: 'conn_123',
            slack: 'conn_456',
          },
          tools: undefined,
          connections: createExpectedConnections(),
          execution: undefined,
        });
      });

      it('should create a session with both authConfigs and connectedAccounts', async () => {
        mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

        const config: ToolRouterCreateSessionConfig = {
          authConfigs: {
            gmail: 'auth_config_123',
          },
          connectedAccounts: {
            slack: 'conn_456',
          },
        };

        await toolRouter.create(userId, config);

        expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
          user_id: userId,
          toolkits: undefined,
          auth_configs: {
            gmail: 'auth_config_123',
          },
          connected_accounts: {
            slack: 'conn_456',
          },
          tools: undefined,
          connections: createExpectedConnections(),
          execution: undefined,
        });
      });
    });

    describe('execution configuration', () => {
      it('should create a session with proxyExecutionEnabled only', async () => {
        mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

        const config: ToolRouterCreateSessionConfig = {
          execution: {
            proxyExecutionEnabled: true,
          },
        };

        await toolRouter.create(userId, config);

        expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
          user_id: userId,
          toolkits: undefined,
          auth_configs: undefined,
          connected_accounts: undefined,
          tools: undefined,
          connections: createExpectedConnections(),
          execution: {
            proxy_execution_enabled: true,
            timeout_seconds: undefined,
          },
        });
      });

      it('should create a session with timeoutSeconds only', async () => {
        mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

        const config: ToolRouterCreateSessionConfig = {
          execution: {
            timeoutSeconds: 60,
          },
        };

        await toolRouter.create(userId, config);

        expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
          user_id: userId,
          toolkits: undefined,
          auth_configs: undefined,
          connected_accounts: undefined,
          tools: undefined,
          connections: createExpectedConnections(),
          execution: {
            proxy_execution_enabled: undefined,
            timeout_seconds: 60,
          },
        });
      });

      it('should create a session with full execution configuration', async () => {
        mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

        const config: ToolRouterCreateSessionConfig = {
          execution: {
            proxyExecutionEnabled: true,
            timeoutSeconds: 30,
          },
        };

        await toolRouter.create(userId, config);

        expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
          user_id: userId,
          toolkits: undefined,
          auth_configs: undefined,
          connected_accounts: undefined,
          tools: undefined,
          connections: createExpectedConnections(),
          execution: {
            proxy_execution_enabled: true,
            timeout_seconds: 30,
          },
        });
      });

      it('should create a session with execution disabled', async () => {
        mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

        const config: ToolRouterCreateSessionConfig = {
          execution: {
            proxyExecutionEnabled: false,
            timeoutSeconds: 0,
          },
        };

        await toolRouter.create(userId, config);

        expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
          user_id: userId,
          toolkits: undefined,
          auth_configs: undefined,
          connected_accounts: undefined,
          tools: undefined,
          connections: createExpectedConnections(),
          execution: {
            proxy_execution_enabled: false,
            timeout_seconds: 0,
          },
        });
      });
    });

    // describe('complex configuration combinations', () => {
    //   it('should create a session with all configuration options', async () => {
    //     mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

    //     const config: ToolRouterCreateSessionConfig = {
    //       toolkits: ['gmail', 'slack'],
    //       tools: {
    //         overrides: {
    //           gmail: ['GMAIL_FETCH_EMAILS'],
    //         },
    //         tags: ['important'],
    //       },
    //       authConfigs: {
    //         gmail: 'auth_config_123',
    //       },
    //       connectedAccounts: {
    //         slack: 'conn_456',
    //       },
    //       manageConnections: {
    //         enabled: true,
    //         callbackUri: 'https://myapp.com/callback',
    //         inferScopesFromTools: true,
    //       },
    //       execution: {
    //         proxyExecutionEnabled: true,
    //         timeoutSeconds: 30,
    //       },
    //     };

    //     await toolRouter.create(userId, config);

    //     expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
    //       user_id: userId,
    //       toolkits: {
    //         enabled: ['gmail', 'slack'],
    //       },
    //       auth_configs: {
    //         gmail: 'auth_config_123',
    //       },
    //       connected_accounts: {
    //         slack: 'conn_456',
    //       },
    //       tools: {
    //         overrides: {
    //           gmail: { enabled: ['GMAIL_FETCH_EMAILS'] },
    //         },
    //         filters: {
    //           tags: { include: ['important'] },
    //         },
    //       },
    //       connections: createExpectedConnections({
    //         manageConnections: true,
    //         inferScopesFromTools: true,
    //         callbackUri: 'https://myapp.com/callback',
    //       }),
    //       execution: {
    //         proxy_execution_enabled: true,
    //         timeout_seconds: 30,
    //       },
    //     });
    //   });

    //   it('should create a session with toolkits and disabled tools', async () => {
    //     mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

    //     const config: ToolRouterCreateSessionConfig = {
    //       toolkits: {
    //         enabled: ['gmail', 'slack', 'github'],
    //       },
    //       tools: {
    //         overrides: {
    //           gmail: { disabled: ['GMAIL_DELETE_EMAIL'] },
    //           slack: { disabled: ['SLACK_DELETE_MESSAGE'] },
    //         },
    //       },
    //     };

    //     await toolRouter.create(userId, config);

    //     expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
    //       user_id: userId,
    //       toolkits: {
    //         enabled: ['gmail', 'slack', 'github'],
    //       },
    //       auth_configs: undefined,
    //       connected_accounts: undefined,
    //       tools: {
    //         overrides: {
    //           gmail: { disabled: ['GMAIL_DELETE_EMAIL'] },
    //           slack: { disabled: ['SLACK_DELETE_MESSAGE'] },
    //         },
    //         filters: undefined,
    //       },
    //       connections: createExpectedConnections(),
    //       execution: undefined,
    //     });
    //   });

    //   it('should create a session with complex nested configuration', async () => {
    //     mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

    //     const config: ToolRouterCreateSessionConfig = {
    //       toolkits: {
    //         disabled: ['notion'],
    //       },
    //       tools: {
    //         overrides: {
    //           gmail: { disabled: ['GMAIL_DELETE_EMAIL'] },
    //         },
    //         tags: { disabled: ['dangerous'] },
    //       },
    //       authConfigs: {
    //         gmail: 'auth_config_123',
    //         slack: 'auth_config_456',
    //         github: 'auth_config_789',
    //       },
    //       connectedAccounts: {},
    //       manageConnections: {
    //         enabled: false,
    //         inferScopesFromTools: false,
    //       },
    //     };

    //     await toolRouter.create(userId, config);

    //     expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith({
    //       user_id: userId,
    //       toolkits: {
    //         disabled: ['notion'],
    //       },
    //       auth_configs: {
    //         gmail: 'auth_config_123',
    //         slack: 'auth_config_456',
    //         github: 'auth_config_789',
    //       },
    //       connected_accounts: {},
    //       tools: {
    //         overrides: {
    //           gmail: { disabled: ['GMAIL_DELETE_EMAIL'] },
    //         },
    //         filters: {
    //           tags: { exclude: ['dangerous'] },
    //         },
    //       },
    //       connections: createExpectedConnections({
    //         manageConnections: false,
    //       }),
    //       execution: undefined,
    //     });
    //   });
    // });

    describe('error handling', () => {
      it('should throw error if API call fails', async () => {
        const apiError = new Error('API error: Invalid session configuration');
        mockClient.toolRouter.session.create.mockRejectedValueOnce(apiError);

        await expect(toolRouter.create(userId)).rejects.toThrow(
          'API error: Invalid session configuration'
        );

        expect(mockClient.toolRouter.session.create).toHaveBeenCalledTimes(1);
      });

      it('should throw error for invalid configuration', async () => {
        const invalidConfig = {
          toolkits: 'invalid-toolkits', // Should be array or object
        } as any;

        await expect(toolRouter.create(userId, invalidConfig)).rejects.toThrow();
      });

      it('should throw error for empty userId', async () => {
        mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

        // The test validates that even empty userId is passed through
        // The API layer would handle the validation
        await toolRouter.create('');

        expect(mockClient.toolRouter.session.create).toHaveBeenCalledWith(
          expect.objectContaining({
            user_id: '',
          })
        );
      });
    });

    describe('response handling', () => {
      it('should handle MCP type correctly', async () => {
        const responseWithUppercase = {
          ...mockSessionCreateResponse,
          mcp: {
            type: 'HTTP',
            url: 'https://mcp.example.com/session_123',
          },
        };

        mockClient.toolRouter.session.create.mockResolvedValueOnce(responseWithUppercase);

        const session = await toolRouter.create(userId);

        expect(session.mcp.type).toBe('HTTP');
      });

      it('should handle SSE MCP type correctly', async () => {
        const sseResponse = {
          ...mockSessionCreateResponse,
          mcp: {
            type: 'SSE',
            url: 'https://mcp.example.com/sse/session_123',
          },
        };

        mockClient.toolRouter.session.create.mockResolvedValueOnce(sseResponse);

        const session = await toolRouter.create(userId);

        expect(session.mcp.type).toBe('SSE');
        expect(session.mcp.url).toBe('https://mcp.example.com/sse/session_123');
      });

      it('should return session with all required properties', async () => {
        mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

        const session = await toolRouter.create(userId);

        expect(session).toHaveProperty('sessionId');
        expect(session).toHaveProperty('mcp');
        expect(session).toHaveProperty('tools');
        expect(session).toHaveProperty('authorize');
        expect(session).toHaveProperty('toolkits');

        expect(typeof session.tools).toBe('function');
        expect(typeof session.authorize).toBe('function');
        expect(typeof session.toolkits).toBe('function');
      });
    });
  });

  describe('authorize function', () => {
    const userId = 'user_123';
    const sessionId = 'session_123';
    const toolkit = 'gmail';

    beforeEach(async () => {
      mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);
    });

    it('should authorize a toolkit without callbackUrl', async () => {
      mockClient.toolRouter.session.link.mockResolvedValueOnce(mockLinkResponse);

      const session = await toolRouter.create(userId);
      const connectionRequest = await session.authorize(toolkit);

      expect(mockClient.toolRouter.session.link).toHaveBeenCalledWith(sessionId, {
        toolkit,
      });

      expect(connectionRequest).toHaveProperty('id', 'conn_456');
      expect(connectionRequest).toHaveProperty('status', ConnectedAccountStatuses.INITIATED);
      expect(connectionRequest).toHaveProperty('redirectUrl', 'https://composio.dev/auth/redirect');
    });

    it('should authorize a toolkit with callbackUrl', async () => {
      mockClient.toolRouter.session.link.mockResolvedValueOnce(mockLinkResponse);

      const session = await toolRouter.create(userId);
      const connectionRequest = await session.authorize(toolkit, {
        callbackUrl: 'https://myapp.com/callback',
      });

      expect(mockClient.toolRouter.session.link).toHaveBeenCalledWith(sessionId, {
        toolkit,
        callbackUrl: 'https://myapp.com/callback',
      });

      expect(connectionRequest.id).toBe('conn_456');
      expect(connectionRequest.redirectUrl).toBe('https://composio.dev/auth/redirect');
    });

    it('should authorize multiple toolkits in sequence', async () => {
      const slackLinkResponse = {
        connected_account_id: 'conn_789',
        redirect_url: 'https://composio.dev/auth/slack/redirect',
      };

      mockClient.toolRouter.session.link
        .mockResolvedValueOnce(mockLinkResponse)
        .mockResolvedValueOnce(slackLinkResponse);

      const session = await toolRouter.create(userId);

      const gmailConnection = await session.authorize('gmail');
      const slackConnection = await session.authorize('slack');

      expect(mockClient.toolRouter.session.link).toHaveBeenCalledTimes(2);
      expect(gmailConnection.id).toBe('conn_456');
      expect(slackConnection.id).toBe('conn_789');
    });

    it('should handle authorization errors', async () => {
      const authError = new Error('Authorization failed: Invalid toolkit');
      mockClient.toolRouter.session.link.mockRejectedValueOnce(authError);

      const session = await toolRouter.create(userId);

      await expect(session.authorize(toolkit)).rejects.toThrow(
        'Authorization failed: Invalid toolkit'
      );

      expect(mockClient.toolRouter.session.link).toHaveBeenCalledWith(sessionId, {
        toolkit,
      });
    });

    it('should handle network errors during authorization', async () => {
      const networkError = new Error('Network error');
      mockClient.toolRouter.session.link.mockRejectedValueOnce(networkError);

      const session = await toolRouter.create(userId);

      await expect(session.authorize(toolkit)).rejects.toThrow('Network error');
    });

    it('should create ConnectionRequest with correct parameters', async () => {
      mockClient.toolRouter.session.link.mockResolvedValueOnce(mockLinkResponse);

      const session = await toolRouter.create(userId);
      const connectionRequest = await session.authorize(toolkit);

      // Verify the connection request has the expected methods
      expect(connectionRequest).toHaveProperty('waitForConnection');
      expect(connectionRequest).toHaveProperty('toJSON');
      expect(connectionRequest).toHaveProperty('toString');
      expect(typeof connectionRequest.waitForConnection).toBe('function');
    });
  });

  describe('toolkits function', () => {
    const userId = 'user_123';
    const sessionId = 'session_123';

    beforeEach(async () => {
      mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);
    });

    it('should fetch toolkits without options', async () => {
      mockClient.toolRouter.session.toolkits.mockResolvedValueOnce(mockToolkitsResponse);

      const session = await toolRouter.create(userId);
      const result = await session.toolkits();

      expect(mockClient.toolRouter.session.toolkits).toHaveBeenCalledWith(sessionId, {
        cursor: undefined,
        limit: undefined,
        toolkits: undefined,
      });

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('nextCursor', 'cursor_789');
      expect(result).toHaveProperty('totalPages', 2);
      expect(result.items).toHaveLength(3);
    });

    it('should fetch toolkits with pagination options', async () => {
      mockClient.toolRouter.session.toolkits.mockResolvedValueOnce(mockToolkitsResponse);

      const session = await toolRouter.create(userId);
      const result = await session.toolkits({
        limit: 10,
        nextCursor: 'cursor_abc',
      });

      expect(mockClient.toolRouter.session.toolkits).toHaveBeenCalledWith(sessionId, {
        cursor: 'cursor_abc',
        limit: 10,
        toolkits: undefined,
      });

      expect(result.items).toHaveLength(3);
    });

    it('should fetch toolkits with toolkits filter option', async () => {
      mockClient.toolRouter.session.toolkits.mockResolvedValueOnce(mockToolkitsResponse);

      const session = await toolRouter.create(userId);
      const result = await session.toolkits({
        toolkits: ['gmail', 'slack'],
      });

      expect(mockClient.toolRouter.session.toolkits).toHaveBeenCalledWith(sessionId, {
        cursor: undefined,
        limit: undefined,
        toolkits: ['gmail', 'slack'],
      });

      expect(result.items).toHaveLength(3);
    });

    it('should fetch toolkits with both pagination and toolkits filter options', async () => {
      mockClient.toolRouter.session.toolkits.mockResolvedValueOnce(mockToolkitsResponse);

      const session = await toolRouter.create(userId);
      const result = await session.toolkits({
        limit: 5,
        nextCursor: 'cursor_xyz',
        toolkits: ['github'],
      });

      expect(mockClient.toolRouter.session.toolkits).toHaveBeenCalledWith(sessionId, {
        cursor: 'cursor_xyz',
        limit: 5,
        toolkits: ['github'],
      });

      expect(result.items).toHaveLength(3);
    });

    it('should transform toolkit connection state correctly for active connection', async () => {
      mockClient.toolRouter.session.toolkits.mockResolvedValueOnce(mockToolkitsResponse);

      const session = await toolRouter.create(userId);
      const result = await session.toolkits();

      const gmailToolkit = result.items[0];
      expect(gmailToolkit.slug).toBe('gmail');
      expect(gmailToolkit.name).toBe('Gmail');
      expect(gmailToolkit.logo).toBe('https://example.com/gmail-logo.png');
      expect(gmailToolkit.isNoAuth).toBe(false);
      expect(gmailToolkit.connection.isActive).toBe(true);
      expect(gmailToolkit.connection.authConfig).toEqual({
        id: 'auth_config_123',
        mode: 'OAUTH2',
        isComposioManaged: true,
      });
      expect(gmailToolkit.connection.connectedAccount).toEqual({
        id: 'conn_123',
        status: 'ACTIVE',
      });
    });

    it('should transform toolkit connection state correctly for initiated connection', async () => {
      mockClient.toolRouter.session.toolkits.mockResolvedValueOnce(mockToolkitsResponse);

      const session = await toolRouter.create(userId);
      const result = await session.toolkits();

      const slackToolkit = result.items[1];
      expect(slackToolkit.slug).toBe('slack');
      expect(slackToolkit.connection.isActive).toBe(false);
      expect(slackToolkit.connection.connectedAccount?.status).toBe('INITIATED');
    });

    it('should transform toolkit connection state correctly for no connection', async () => {
      mockClient.toolRouter.session.toolkits.mockResolvedValueOnce(mockToolkitsResponse);

      const session = await toolRouter.create(userId);
      const result = await session.toolkits();

      const githubToolkit = result.items[2];
      expect(githubToolkit.slug).toBe('github');
      expect(githubToolkit.connection.isActive).toBe(false);
      expect(githubToolkit.connection.authConfig).toBeNull();
      expect(githubToolkit.connection.connectedAccount).toBeUndefined();
    });

    it('should handle empty toolkits response', async () => {
      const emptyResponse = {
        items: [],
        next_cursor: undefined,
        total_pages: 0,
      };

      mockClient.toolRouter.session.toolkits.mockResolvedValueOnce(emptyResponse);

      const session = await toolRouter.create(userId);
      const result = await session.toolkits();

      expect(result.items).toHaveLength(0);
      expect(result.nextCursor).toBeUndefined();
      expect(result.totalPages).toBe(0);
    });

    it('should handle pagination through multiple pages', async () => {
      const firstPageResponse = {
        items: mockToolkitsResponse.items.slice(0, 2),
        next_cursor: 'cursor_page2',
        total_pages: 2,
      };

      const secondPageResponse = {
        items: mockToolkitsResponse.items.slice(2),
        next_cursor: undefined,
        total_pages: 2,
      };

      mockClient.toolRouter.session.toolkits
        .mockResolvedValueOnce(firstPageResponse)
        .mockResolvedValueOnce(secondPageResponse);

      const session = await toolRouter.create(userId);

      // Fetch first page
      const page1 = await session.toolkits({ limit: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursor).toBe('cursor_page2');

      // Fetch second page
      const page2 = await session.toolkits({
        limit: 2,
        nextCursor: page1.nextCursor,
      });
      expect(page2.items).toHaveLength(1);
      expect(page2.nextCursor).toBeUndefined();
    });

    it('should handle API errors', async () => {
      const apiError = new Error('Failed to fetch toolkits');
      mockClient.toolRouter.session.toolkits.mockRejectedValueOnce(apiError);

      const session = await toolRouter.create(userId);

      await expect(session.toolkits()).rejects.toThrow('Failed to fetch toolkits');
    });

    it('should handle malformed response data', async () => {
      const malformedResponse = {
        items: [
          {
            slug: 'gmail',
            // Missing required fields
          },
        ],
        next_cursor: undefined,
        total_pages: 1,
      };

      mockClient.toolRouter.session.toolkits.mockResolvedValueOnce(malformedResponse);

      const session = await toolRouter.create(userId);

      // Should throw transformation error due to missing required fields
      await expect(session.toolkits()).rejects.toThrow();
    });
  });

  describe('tools function', () => {
    const userId = 'user_123';

    beforeEach(() => {
      // Reset the Tools mock before each test
      vi.clearAllMocks();
      (Tools as any).mockImplementation(() => ({
        get: vi.fn().mockResolvedValue('mocked-wrapped-tools'),
      }));
    });

    it('should fetch and wrap tools without modifiers', async () => {
      mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

      const session = await toolRouter.create(userId);
      const tools = await session.tools();

      expect(Tools).toHaveBeenCalledWith(mockClient, { provider: mockProvider });

      const toolsInstance = (Tools as any).mock.results[0].value;
      expect(toolsInstance.get).toHaveBeenCalledWith(
        userId,
        {
          tools: ['GMAIL_FETCH_EMAILS', 'SLACK_SEND_MESSAGE', 'GITHUB_CREATE_ISSUE'],
        },
        undefined
      );

      expect(tools).toBe('mocked-wrapped-tools');
    });

    it('should fetch and wrap tools with modifiers', async () => {
      mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

      const modifiers = {
        modifySchema: vi.fn(tool => ({
          ...tool,
          description: 'Modified description',
        })),
      };

      const session = await toolRouter.create(userId);
      const tools = await session.tools(modifiers);

      const toolsInstance = (Tools as any).mock.results[0].value;
      expect(toolsInstance.get).toHaveBeenCalledWith(
        userId,
        {
          tools: ['GMAIL_FETCH_EMAILS', 'SLACK_SEND_MESSAGE', 'GITHUB_CREATE_ISSUE'],
        },
        modifiers
      );

      expect(tools).toBe('mocked-wrapped-tools');
    });

    it('should handle tools fetching errors', async () => {
      mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

      (Tools as any).mockImplementation(() => ({
        get: vi.fn().mockRejectedValue(new Error('Failed to fetch tools')),
      }));

      const session = await toolRouter.create(userId);

      await expect(session.tools()).rejects.toThrow('Failed to fetch tools');
    });

    it('should call tools function multiple times with different modifiers', async () => {
      mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);

      const modifier1 = { modifySchema: vi.fn() };
      const modifier2 = { modifySchema: vi.fn() };

      const session = await toolRouter.create(userId);

      // Each call to session.tools() creates a new Tools instance
      // So we need to check that Tools was called twice and each instance's get method was called once
      await session.tools(modifier1);
      await session.tools(modifier2);

      expect(Tools).toHaveBeenCalledTimes(2);

      const firstToolsInstance = (Tools as any).mock.results[0].value;
      expect(firstToolsInstance.get).toHaveBeenCalledWith(
        userId,
        {
          tools: ['GMAIL_FETCH_EMAILS', 'SLACK_SEND_MESSAGE', 'GITHUB_CREATE_ISSUE'],
        },
        modifier1
      );

      const secondToolsInstance = (Tools as any).mock.results[1].value;
      expect(secondToolsInstance.get).toHaveBeenCalledWith(
        userId,
        {
          tools: ['GMAIL_FETCH_EMAILS', 'SLACK_SEND_MESSAGE', 'GITHUB_CREATE_ISSUE'],
        },
        modifier2
      );
    });

    it('should use tool slugs from session response', async () => {
      const customResponse = {
        ...mockSessionCreateResponse,
        session_id: 'custom_session_123',
        tool_router_tools: ['CUSTOM_TOOL_1', 'CUSTOM_TOOL_2'],
      };

      mockClient.toolRouter.session.create.mockResolvedValueOnce(customResponse);

      const newSession = await toolRouter.create(userId);
      await newSession.tools();

      expect(Tools).toHaveBeenCalledWith(mockClient, { provider: mockProvider });
      const toolsInstance = (Tools as any).mock.results[0].value;
      expect(toolsInstance.get).toHaveBeenCalledWith(
        userId,
        {
          tools: ['CUSTOM_TOOL_1', 'CUSTOM_TOOL_2'],
        },
        undefined
      );
    });

    it('should handle empty tool router tools array', async () => {
      const emptyToolsResponse = {
        ...mockSessionCreateResponse,
        session_id: 'empty_session_123',
        tool_router_tools: [],
      };

      mockClient.toolRouter.session.create.mockResolvedValueOnce(emptyToolsResponse);

      const session = await toolRouter.create(userId);
      await session.tools();

      expect(Tools).toHaveBeenCalledWith(mockClient, { provider: mockProvider });
      const toolsInstance = (Tools as any).mock.results[0].value;
      expect(toolsInstance.get).toHaveBeenCalledWith(
        userId,
        {
          tools: [],
        },
        undefined
      );
    });
  });

  describe('integration tests', () => {
    const userId = 'user_123';

    it('should create a complete session and use all functions', async () => {
      mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);
      mockClient.toolRouter.session.link.mockResolvedValueOnce(mockLinkResponse);
      mockClient.toolRouter.session.toolkits.mockResolvedValueOnce(mockToolkitsResponse);

      // Create session
      const session = await toolRouter.create(userId, {
        toolkits: ['gmail', 'slack'],
        manageConnections: true,
      });

      expect(session.sessionId).toBe('session_123');
      expect(session.mcp.url).toBe('https://mcp.example.com/session_123');

      // Use authorize function
      const connection = await session.authorize('gmail');
      expect(connection.id).toBe('conn_456');

      // Use toolkits function
      const toolkits = await session.toolkits();
      expect(toolkits.items).toHaveLength(3);

      // Use tools function
      const tools = await session.tools();
      expect(tools).toBe('mocked-wrapped-tools');

      // Verify all API calls were made
      expect(mockClient.toolRouter.session.create).toHaveBeenCalledTimes(1);
      expect(mockClient.toolRouter.session.link).toHaveBeenCalledTimes(1);
      expect(mockClient.toolRouter.session.toolkits).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple sessions independently', async () => {
      const session1Response = {
        ...mockSessionCreateResponse,
        session_id: 'session_1',
      };

      const session2Response = {
        ...mockSessionCreateResponse,
        session_id: 'session_2',
      };

      mockClient.toolRouter.session.create
        .mockResolvedValueOnce(session1Response)
        .mockResolvedValueOnce(session2Response);

      mockClient.toolRouter.session.toolkits.mockResolvedValue(mockToolkitsResponse);

      const session1 = await toolRouter.create('user_1');
      const session2 = await toolRouter.create('user_2');

      expect(session1.sessionId).toBe('session_1');
      expect(session2.sessionId).toBe('session_2');

      await session1.toolkits();
      await session2.toolkits();

      expect(mockClient.toolRouter.session.toolkits).toHaveBeenCalledWith('session_1', {
        cursor: undefined,
        limit: undefined,
        toolkits: undefined,
      });
      expect(mockClient.toolRouter.session.toolkits).toHaveBeenCalledWith('session_2', {
        cursor: undefined,
        limit: undefined,
        toolkits: undefined,
      });
    });

    it('should handle rapid successive calls', async () => {
      mockClient.toolRouter.session.create.mockResolvedValue(mockSessionCreateResponse);
      mockClient.toolRouter.session.toolkits.mockResolvedValue(mockToolkitsResponse);

      const session = await toolRouter.create(userId);

      // Make multiple rapid calls
      const promises = [session.toolkits(), session.toolkits(), session.toolkits()];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.items).toHaveLength(3);
      });

      expect(mockClient.toolRouter.session.toolkits).toHaveBeenCalledTimes(3);
    });
  });

  describe('use method', () => {
    const sessionId = 'session_123';

    it('should retrieve an existing session by ID', async () => {
      mockClient.toolRouter.session.retrieve.mockResolvedValueOnce(mockSessionRetrieveResponse);

      const session = await toolRouter.use(sessionId);

      expect(mockClient.toolRouter.session.retrieve).toHaveBeenCalledWith(sessionId);
      expect(session).toHaveProperty('sessionId', 'session_123');
      expect(session).toHaveProperty('mcp');
      expect(session.mcp).toEqual({
        type: 'HTTP',
        url: 'https://mcp.example.com/session_123',
      });
      expect(session).toHaveProperty('tools');
      expect(session).toHaveProperty('authorize');
      expect(session).toHaveProperty('toolkits');
    });

    it('should return a session with correct user ID from config', async () => {
      const customResponse = {
        ...mockSessionRetrieveResponse,
        config: {
          ...mockSessionRetrieveResponse.config,
          user_id: 'custom_user_456',
        },
      };

      mockClient.toolRouter.session.retrieve.mockResolvedValueOnce(customResponse);

      const session = await toolRouter.use(sessionId);

      expect(session.sessionId).toBe('session_123');
      // The tools function should be created with the correct user ID from config
      expect(session.tools).toBeDefined();
    });

    it('should return a session with working tools function', async () => {
      mockClient.toolRouter.session.retrieve.mockResolvedValueOnce(mockSessionRetrieveResponse);

      const session = await toolRouter.use(sessionId);

      const tools = await session.tools();

      expect(tools).toBe('mocked-wrapped-tools');
      expect(Tools).toHaveBeenCalled();
    });

    it('should return a session with working authorize function', async () => {
      mockClient.toolRouter.session.retrieve.mockResolvedValueOnce(mockSessionRetrieveResponse);
      mockClient.toolRouter.session.link.mockResolvedValueOnce(mockLinkResponse);

      const session = await toolRouter.use(sessionId);

      const connectionRequest = await session.authorize('github');

      expect(mockClient.toolRouter.session.link).toHaveBeenCalledWith(sessionId, {
        toolkit: 'github',
      });
      expect(connectionRequest).toHaveProperty('redirectUrl', 'https://composio.dev/auth/redirect');
      expect(connectionRequest).toHaveProperty('status', ConnectedAccountStatuses.INITIATED);
    });

    it('should return a session with working toolkits function', async () => {
      mockClient.toolRouter.session.retrieve.mockResolvedValueOnce(mockSessionRetrieveResponse);
      mockClient.toolRouter.session.toolkits.mockResolvedValueOnce(mockToolkitsResponse);

      const session = await toolRouter.use(sessionId);

      const toolkitsResult = await session.toolkits();

      expect(mockClient.toolRouter.session.toolkits).toHaveBeenCalledWith(sessionId, {
        cursor: undefined,
        limit: undefined,
        toolkits: undefined,
      });
      expect(toolkitsResult.items).toHaveLength(3);
      expect(toolkitsResult.items[0].slug).toBe('gmail');
    });

    it('should handle different session IDs', async () => {
      const session1Response = {
        ...mockSessionRetrieveResponse,
        session_id: 'session_1',
      };

      const session2Response = {
        ...mockSessionRetrieveResponse,
        session_id: 'session_2',
      };

      mockClient.toolRouter.session.retrieve
        .mockResolvedValueOnce(session1Response)
        .mockResolvedValueOnce(session2Response);

      const session1 = await toolRouter.use('session_1');
      const session2 = await toolRouter.use('session_2');

      expect(session1.sessionId).toBe('session_1');
      expect(session2.sessionId).toBe('session_2');
      expect(mockClient.toolRouter.session.retrieve).toHaveBeenCalledTimes(2);
    });

    it('should handle MCP server type correctly', async () => {
      mockClient.toolRouter.session.retrieve.mockResolvedValueOnce(mockSessionRetrieveResponse);

      const session = await toolRouter.use(sessionId);

      expect(session.mcp.type).toBe('HTTP');
      expect(session.mcp.url).toBe('https://mcp.example.com/session_123');
    });

    it('should throw error if session retrieve fails', async () => {
      const error = new Error('Session not found');
      mockClient.toolRouter.session.retrieve.mockRejectedValueOnce(error);

      await expect(toolRouter.use(sessionId)).rejects.toThrow('Session not found');
      expect(mockClient.toolRouter.session.retrieve).toHaveBeenCalledWith(sessionId);
    });

    it('should handle retrieve with different tool lists', async () => {
      const customResponse = {
        ...mockSessionRetrieveResponse,
        tool_router_tools: ['CUSTOM_TOOL_1', 'CUSTOM_TOOL_2'],
      };

      mockClient.toolRouter.session.retrieve.mockResolvedValueOnce(customResponse);

      const session = await toolRouter.use(sessionId);

      expect(session).toBeDefined();
      expect(session.sessionId).toBe('session_123');
    });

    it('should be independent from create method', async () => {
      mockClient.toolRouter.session.create.mockResolvedValueOnce(mockSessionCreateResponse);
      mockClient.toolRouter.session.retrieve.mockResolvedValueOnce(mockSessionRetrieveResponse);

      // Create a new session
      const createdSession = await toolRouter.create('user_123');
      expect(createdSession.sessionId).toBe('session_123');

      // Use an existing session
      const retrievedSession = await toolRouter.use('session_123');
      expect(retrievedSession.sessionId).toBe('session_123');

      // Both should have been called once
      expect(mockClient.toolRouter.session.create).toHaveBeenCalledTimes(1);
      expect(mockClient.toolRouter.session.retrieve).toHaveBeenCalledTimes(1);
    });
  });
});
