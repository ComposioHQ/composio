import { describe, it, expect } from 'vitest';
import {
  ConnectionExpiredEventSchema,
  WebhookEventSchema,
  WebhookEventTypes,
  SingleConnectedAccountDetailedResponseSchema,
  WebhookConnectionMetadataSchema,
} from '../../src/types/webhookEvents.types';

describe('WebhookEventTypes', () => {
  it('should have correct event type constants', () => {
    expect(WebhookEventTypes.CONNECTION_EXPIRED).toBe('composio.connected_account.expired');
    expect(WebhookEventTypes.TRIGGER_MESSAGE).toBe('composio.trigger.message');
  });
});

describe('WebhookConnectionMetadataSchema', () => {
  it('should validate valid metadata', () => {
    const validMetadata = {
      project_id: 'pr_koucdrMIwRsf',
      org_id: '4a4ded8f-d3ae-4dea-a229-c30234298b05',
    };

    const result = WebhookConnectionMetadataSchema.safeParse(validMetadata);
    expect(result.success).toBe(true);
  });

  it('should reject missing project_id', () => {
    const invalidMetadata = {
      org_id: '4a4ded8f-d3ae-4dea-a229-c30234298b05',
    };

    const result = WebhookConnectionMetadataSchema.safeParse(invalidMetadata);
    expect(result.success).toBe(false);
  });

  it('should reject missing org_id', () => {
    const invalidMetadata = {
      project_id: 'pr_koucdrMIwRsf',
    };

    const result = WebhookConnectionMetadataSchema.safeParse(invalidMetadata);
    expect(result.success).toBe(false);
  });

  it('should accept metadata with extra unknown fields (passthrough)', () => {
    const metadata = {
      project_id: 'pr_koucdrMIwRsf',
      org_id: '4a4ded8f-d3ae-4dea-a229-c30234298b05',
      some_future_field: 'new_value',
    };

    const result = WebhookConnectionMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.some_future_field).toBe('new_value');
    }
  });
});

describe('SingleConnectedAccountDetailedResponseSchema', () => {
  const validConnectedAccountData = {
    toolkit: { slug: 'gmail' },
    auth_config: {
      id: 'ac_izZGRCZ9qyxk',
      auth_scheme: 'OAUTH2',
      is_composio_managed: true,
      is_disabled: false,
    },
    id: 'ca__IvSeEzEBjVt',
    user_id: 'test-user-123',
    status: 'EXPIRED',
    created_at: '2026-02-02T08:35:44.272Z',
    updated_at: '2026-02-02T10:14:20.949Z',
    state: {
      authScheme: 'OAUTH2',
      val: { status: 'EXPIRED', access_token: 'ya29.test' },
    },
    data: { status: 'EXPIRED' },
    params: { status: 'EXPIRED' },
    status_reason: 'Token refresh failed',
    is_disabled: false,
  };

  it('should validate valid connected account data', () => {
    const result =
      SingleConnectedAccountDetailedResponseSchema.safeParse(validConnectedAccountData);
    expect(result.success).toBe(true);
  });

  it('should validate connected account with null status_reason', () => {
    const data = {
      ...validConnectedAccountData,
      status_reason: null,
    };

    const result = SingleConnectedAccountDetailedResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should validate connected account with optional deprecated field', () => {
    const data = {
      ...validConnectedAccountData,
      deprecated: {
        labels: ['label1'],
        uuid: 'd9641efa-8007-4864-8a41-3164599d65ec',
      },
    };

    const result = SingleConnectedAccountDetailedResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should reject invalid auth_scheme', () => {
    const data = {
      ...validConnectedAccountData,
      auth_config: {
        ...validConnectedAccountData.auth_config,
        auth_scheme: 'INVALID_SCHEME',
      },
    };

    const result = SingleConnectedAccountDetailedResponseSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should reject invalid status', () => {
    const data = {
      ...validConnectedAccountData,
      status: 'INVALID_STATUS',
    };

    const result = SingleConnectedAccountDetailedResponseSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should accept payloads with extra unknown fields (passthrough)', () => {
    const data = {
      ...validConnectedAccountData,
      some_future_field: 'future_value',
      another_new_field: 42,
    };

    const result = SingleConnectedAccountDetailedResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.some_future_field).toBe('future_value');
      expect(result.data.another_new_field).toBe(42);
    }
  });
});

describe('ConnectionExpiredEventSchema', () => {
  const validPayload = {
    id: 'msg_847cdfcd-d219-4f18-a6dd-91acd42ca94a',
    timestamp: '2026-02-02T10:14:20.955Z',
    type: 'composio.connected_account.expired',
    data: {
      toolkit: { slug: 'gmail' },
      auth_config: {
        id: 'ac_izZGRCZ9qyxk',
        auth_scheme: 'OAUTH2',
        is_composio_managed: true,
        is_disabled: false,
      },
      id: 'ca__IvSeEzEBjVt',
      user_id: 'test-user',
      status: 'EXPIRED',
      created_at: '2026-02-02T08:35:44.272Z',
      updated_at: '2026-02-02T10:14:20.949Z',
      state: {
        authScheme: 'OAUTH2',
        val: { status: 'EXPIRED' },
      },
      data: {},
      params: {},
      status_reason: null,
      is_disabled: false,
    },
    metadata: {
      project_id: 'pr_koucdrMIwRsf',
      org_id: '4a4ded8f-d3ae-4dea-a229-c30234298b05',
    },
  };

  it('validates a valid connection expired event', () => {
    const result = ConnectionExpiredEventSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('extracts typed data from parsed result', () => {
    const result = ConnectionExpiredEventSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('composio.connected_account.expired');
      expect(result.data.data.id).toBe('ca__IvSeEzEBjVt');
      expect(result.data.data.toolkit.slug).toBe('gmail');
      expect(result.data.data.status).toBe('EXPIRED');
      expect(result.data.metadata.project_id).toBe('pr_koucdrMIwRsf');
    }
  });

  it('rejects invalid event type', () => {
    const payload = {
      ...validPayload,
      type: 'composio.trigger.message',
    };
    const result = ConnectionExpiredEventSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('rejects missing metadata fields', () => {
    const payload = {
      ...validPayload,
      metadata: { project_id: 'pr_abc' }, // missing org_id
    };
    const result = ConnectionExpiredEventSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('rejects missing data fields', () => {
    const payload = {
      ...validPayload,
      data: { toolkit: { slug: 'gmail' } }, // missing required fields
    };
    const result = ConnectionExpiredEventSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('validates payload with status_reason', () => {
    const payload = {
      ...validPayload,
      data: {
        ...validPayload.data,
        status_reason: 'Token refresh failed due to revoked access',
      },
    };
    const result = ConnectionExpiredEventSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data.status_reason).toBe('Token refresh failed due to revoked access');
    }
  });

  it('accepts event payload with extra unknown fields (passthrough)', () => {
    const payload = {
      ...validPayload,
      version: '3.1',
      source: 'composio-webhook-system',
    };
    const result = ConnectionExpiredEventSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe('3.1');
      expect(result.data.source).toBe('composio-webhook-system');
    }
  });
});

describe('WebhookEventSchema', () => {
  const validConnectionExpiredPayload = {
    id: 'msg_847cdfcd-d219-4f18-a6dd-91acd42ca94a',
    timestamp: '2026-02-02T10:14:20.955Z',
    type: 'composio.connected_account.expired',
    data: {
      toolkit: { slug: 'gmail' },
      auth_config: {
        id: 'ac_izZGRCZ9qyxk',
        auth_scheme: 'OAUTH2',
        is_composio_managed: true,
        is_disabled: false,
      },
      id: 'ca__IvSeEzEBjVt',
      user_id: 'test-user',
      status: 'EXPIRED',
      created_at: '2026-02-02T08:35:44.272Z',
      updated_at: '2026-02-02T10:14:20.949Z',
      state: {
        authScheme: 'OAUTH2',
        val: { status: 'EXPIRED' },
      },
      data: {},
      params: {},
      status_reason: null,
      is_disabled: false,
    },
    metadata: {
      project_id: 'pr_koucdrMIwRsf',
      org_id: '4a4ded8f-d3ae-4dea-a229-c30234298b05',
    },
  };

  it('discriminates by event type for connection expired', () => {
    const result = WebhookEventSchema.safeParse(validConnectionExpiredPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('composio.connected_account.expired');
    }
  });

  it('rejects unknown event types', () => {
    const payload = {
      ...validConnectionExpiredPayload,
      type: 'composio.unknown.event',
    };
    const result = WebhookEventSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});
