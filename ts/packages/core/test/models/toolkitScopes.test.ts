import { describe, it, expect, vi, beforeEach } from 'vitest';
import ComposioClient from '@composio/client';
import { Toolkits } from '../../src/models/Toolkits';
import { ValidationError } from '../../src/errors/ValidationErrors';

vi.mock('../../src/telemetry/Telemetry', () => ({
  telemetry: {
    instrument: vi.fn(),
  },
}));

const createMockClient = () => ({
  toolkits: {
    recommendScopes: vi.fn(),
    retrieveScopesGrantContext: vi.fn(),
  },
});

const rawRecommendation = {
  auth_scheme: 'OAUTH2',
  toolkit_version: '20250909_00',
  grant_context: { account_type: 'Google Workspace' },
  scopes: {
    least_privilege: ['https://www.googleapis.com/auth/gmail.send'],
    fewest: ['https://mail.google.com/'],
    conditional: [
      {
        scope: 'https://www.googleapis.com/auth/gmail.modify',
        when: { label_ids: ['TRASH'] },
        for: ['GMAIL_FETCH_EMAILS'],
      },
    ],
  },
};

describe('Toolkits scope recommendation', () => {
  let toolkits: Toolkits;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    toolkits = new Toolkits(mockClient as unknown as ComposioClient);
  });

  describe('recommendScopes', () => {
    it('covers every tool when tools is empty', async () => {
      mockClient.toolkits.recommendScopes.mockResolvedValue(rawRecommendation);

      await toolkits.recommendScopes('gmail', { tools: [] });

      expect(mockClient.toolkits.recommendScopes).toHaveBeenCalledWith(
        'gmail',
        {
          tools: [],
          auth_scheme: undefined,
          toolkit_version: undefined,
          grant_context: undefined,
          include: undefined,
          exclude: undefined,
          available_scopes: undefined,
        },
        undefined
      );
    });

    it('maps params to the wire and transforms the response', async () => {
      mockClient.toolkits.recommendScopes.mockResolvedValue(rawRecommendation);
      const signal = new AbortController().signal;

      const result = await toolkits.recommendScopes(
        'gmail',
        {
          tools: ['GMAIL_SEND_EMAIL', 'GMAIL_FETCH_EMAILS'],
          authScheme: 'OAUTH2',
          toolkitVersion: '20250909_00',
          grantContext: { account_type: 'Google Workspace' },
          include: ['openid'],
          exclude: ['https://mail.google.com/'],
          availableScopes: ['openid', 'https://www.googleapis.com/auth/gmail.send'],
        },
        { signal }
      );

      expect(mockClient.toolkits.recommendScopes).toHaveBeenCalledWith(
        'gmail',
        {
          tools: ['GMAIL_SEND_EMAIL', 'GMAIL_FETCH_EMAILS'],
          auth_scheme: 'OAUTH2',
          toolkit_version: '20250909_00',
          grant_context: { account_type: 'Google Workspace' },
          include: ['openid'],
          exclude: ['https://mail.google.com/'],
          available_scopes: ['openid', 'https://www.googleapis.com/auth/gmail.send'],
        },
        { signal }
      );
      expect(result).toEqual({
        authScheme: 'OAUTH2',
        toolkitVersion: '20250909_00',
        grantContext: { account_type: 'Google Workspace' },
        scopes: {
          leastPrivilege: ['https://www.googleapis.com/auth/gmail.send'],
          fewest: ['https://mail.google.com/'],
          conditional: [
            {
              scope: 'https://www.googleapis.com/auth/gmail.modify',
              when: { label_ids: ['TRASH'] },
              for: ['GMAIL_FETCH_EMAILS'],
            },
          ],
        },
      });
    });

    it('rejects a missing tools list before calling the API', async () => {
      await expect(
        toolkits.recommendScopes('gmail', {} as Parameters<Toolkits['recommendScopes']>[1])
      ).rejects.toThrow(ValidationError);
      expect(mockClient.toolkits.recommendScopes).not.toHaveBeenCalled();
    });

    it('rejects an unknown auth scheme before calling the API', async () => {
      await expect(
        toolkits.recommendScopes('gmail', { tools: [], authScheme: 'NOT_A_SCHEME' as never })
      ).rejects.toThrow(ValidationError);
      expect(mockClient.toolkits.recommendScopes).not.toHaveBeenCalled();
    });
  });

  describe('listGrantContexts', () => {
    const rawGrantContexts = {
      auth_scheme: 'OAUTH2',
      toolkit_version: '20250909_00',
      grant_context_dimensions: [
        {
          dimension: 'account_type',
          description: 'Kind of Google account the user connects',
          values: ['Google Workspace', 'Personal'],
        },
      ],
      default_grant_context: { account_type: 'Personal' },
    };

    it('sends an empty query when called without params', async () => {
      mockClient.toolkits.retrieveScopesGrantContext.mockResolvedValue(rawGrantContexts);

      await toolkits.listGrantContexts('gmail');

      expect(mockClient.toolkits.retrieveScopesGrantContext).toHaveBeenCalledWith(
        'gmail',
        { auth_scheme: undefined, toolkit_version: undefined },
        undefined
      );
    });

    it('maps params to the wire and transforms the response', async () => {
      mockClient.toolkits.retrieveScopesGrantContext.mockResolvedValue(rawGrantContexts);

      const result = await toolkits.listGrantContexts('gmail', {
        authScheme: 'OAUTH2',
        toolkitVersion: '20250909_00',
      });

      expect(mockClient.toolkits.retrieveScopesGrantContext).toHaveBeenCalledWith(
        'gmail',
        { auth_scheme: 'OAUTH2', toolkit_version: '20250909_00' },
        undefined
      );
      expect(result).toEqual({
        authScheme: 'OAUTH2',
        toolkitVersion: '20250909_00',
        grantContextDimensions: [
          {
            dimension: 'account_type',
            description: 'Kind of Google account the user connects',
            values: ['Google Workspace', 'Personal'],
          },
        ],
        defaultGrantContext: { account_type: 'Personal' },
      });
    });

    it('rejects an empty toolkit version before calling the API', async () => {
      await expect(toolkits.listGrantContexts('gmail', { toolkitVersion: '' })).rejects.toThrow(
        ValidationError
      );
      expect(mockClient.toolkits.retrieveScopesGrantContext).not.toHaveBeenCalled();
    });
  });
});
