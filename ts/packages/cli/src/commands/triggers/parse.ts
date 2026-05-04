import type { TriggerListenEvent } from './types';

const toStringOrDefault = (value: unknown, defaultValue: string): string => {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  const str = String(value);
  return str.length > 0 ? str : defaultValue;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

export const parseTriggerListenEvent = (data: Record<string, unknown>): TriggerListenEvent => {
  // V3 payload (trigger event)
  if (
    data.type === 'composio.trigger.message' &&
    typeof data.id === 'string' &&
    typeof data.metadata === 'object' &&
    data.metadata !== null
  ) {
    const metadata = asRecord(data.metadata);
    if (typeof metadata.trigger_slug === 'string') {
      const triggerSlug = metadata.trigger_slug;
      const toolkitSlug = triggerSlug.split('_')[0]?.toUpperCase() || 'UNKNOWN';

      return {
        id: toStringOrDefault(metadata.trigger_id, data.id),
        uuid: toStringOrDefault(metadata.trigger_id, data.id),
        triggerSlug,
        toolkitSlug,
        userId: toStringOrDefault(metadata.user_id, ''),
        payload: asRecord(data.data),
        originalPayload: asRecord(data),
        metadata: {
          id: toStringOrDefault(metadata.trigger_id, data.id),
          uuid: toStringOrDefault(metadata.trigger_id, data.id),
          toolkitSlug,
          triggerSlug,
          triggerConfig: {},
          connectedAccount: {
            id: toStringOrDefault(metadata.connected_account_id, ''),
            uuid: toStringOrDefault(metadata.connected_account_id, ''),
            authConfigId: toStringOrDefault(metadata.auth_config_id, ''),
            authConfigUUID: toStringOrDefault(metadata.auth_config_id, ''),
            userId: toStringOrDefault(metadata.user_id, ''),
            status: 'ACTIVE',
          },
        },
      };
    }
  }

  // V2 payload
  if (
    typeof data.type === 'string' &&
    typeof data.data === 'object' &&
    data.data !== null &&
    typeof asRecord(data.data).trigger_nano_id === 'string'
  ) {
    const v2 = asRecord(data.data);
    const triggerSlug = data.type.toUpperCase();
    const toolkitSlug = triggerSlug.split('_')[0] || 'UNKNOWN';
    const payload = { ...v2 };
    delete payload.connection_id;
    delete payload.connection_nano_id;
    delete payload.trigger_nano_id;
    delete payload.trigger_id;
    delete payload.user_id;

    return {
      id: toStringOrDefault(v2.trigger_nano_id, ''),
      uuid: toStringOrDefault(v2.trigger_id, toStringOrDefault(v2.trigger_nano_id, '')),
      triggerSlug,
      toolkitSlug,
      userId: toStringOrDefault(v2.user_id, ''),
      payload,
      originalPayload: asRecord(data),
      metadata: {
        id: toStringOrDefault(v2.trigger_nano_id, ''),
        uuid: toStringOrDefault(v2.trigger_id, toStringOrDefault(v2.trigger_nano_id, '')),
        toolkitSlug,
        triggerSlug,
        triggerConfig: {},
        connectedAccount: {
          id: toStringOrDefault(v2.connection_nano_id, ''),
          uuid: toStringOrDefault(v2.connection_id, ''),
          authConfigId: '',
          authConfigUUID: '',
          userId: toStringOrDefault(v2.user_id, ''),
          status: 'ACTIVE',
        },
      },
    };
  }

  // V1 payload
  if (
    typeof data.trigger_name === 'string' &&
    typeof data.connection_id === 'string' &&
    typeof data.trigger_id === 'string'
  ) {
    const triggerSlug = data.trigger_name;
    const toolkitSlug = triggerSlug.split('_')[0]?.toUpperCase() || 'UNKNOWN';
    return {
      id: data.trigger_id,
      uuid: data.trigger_id,
      triggerSlug,
      toolkitSlug,
      userId: '',
      payload: asRecord(data.payload),
      originalPayload: asRecord(data),
      metadata: {
        id: data.trigger_id,
        uuid: data.trigger_id,
        toolkitSlug,
        triggerSlug,
        triggerConfig: {},
        connectedAccount: {
          id: data.connection_id,
          uuid: data.connection_id,
          authConfigId: '',
          authConfigUUID: '',
          userId: '',
          status: 'ACTIVE',
        },
      },
    };
  }

  // Legacy payload
  if (
    typeof data.appName === 'string' &&
    typeof data.metadata === 'object' &&
    data.metadata !== null &&
    typeof asRecord(data.metadata).nanoId === 'string'
  ) {
    const metadata = asRecord(data.metadata);
    const connection = asRecord(metadata.connection);
    return {
      id: toStringOrDefault(metadata.nanoId, toStringOrDefault(metadata.id, 'unknown')),
      uuid: toStringOrDefault(metadata.id, toStringOrDefault(metadata.nanoId, 'unknown')),
      triggerSlug: toStringOrDefault(metadata.triggerName, 'UNKNOWN'),
      toolkitSlug: toStringOrDefault(data.appName, 'UNKNOWN'),
      userId: toStringOrDefault(connection.clientUniqueUserId, ''),
      payload: asRecord(data.payload),
      originalPayload: asRecord(data.originalPayload ?? data.payload),
      metadata: {
        id: toStringOrDefault(metadata.nanoId, toStringOrDefault(metadata.id, 'unknown')),
        uuid: toStringOrDefault(metadata.id, toStringOrDefault(metadata.nanoId, 'unknown')),
        toolkitSlug: toStringOrDefault(data.appName, 'UNKNOWN'),
        triggerSlug: toStringOrDefault(metadata.triggerName, 'UNKNOWN'),
        triggerData: toStringOrDefault(metadata.triggerData, ''),
        triggerConfig: asRecord(metadata.triggerConfig),
        connectedAccount: {
          id: toStringOrDefault(connection.connectedAccountNanoId, ''),
          uuid: toStringOrDefault(connection.id, ''),
          authConfigId: toStringOrDefault(connection.authConfigNanoId, ''),
          authConfigUUID: toStringOrDefault(connection.integrationId, ''),
          userId: toStringOrDefault(connection.clientUniqueUserId, ''),
          status: toStringOrDefault(connection.status, 'ACTIVE'),
        },
      },
    };
  }

  // Fallback
  const id = toStringOrDefault(data.id, toStringOrDefault(data.trigger_id, 'unknown'));
  const uuid = toStringOrDefault(data.uuid, id);
  const triggerSlug = toStringOrDefault(
    data.triggerSlug,
    toStringOrDefault(data.trigger_name, 'UNKNOWN')
  );
  const toolkitSlug = toStringOrDefault(
    data.toolkitSlug,
    toStringOrDefault(data.appName, 'UNKNOWN')
  );
  const userId = toStringOrDefault(data.userId, '');

  return {
    id,
    uuid,
    triggerSlug,
    toolkitSlug,
    userId,
    payload: asRecord(data.payload ?? data),
    originalPayload: asRecord(data.originalPayload ?? data),
    metadata: {
      id,
      uuid,
      toolkitSlug,
      triggerSlug,
      triggerConfig: {},
      connectedAccount: {
        id: '',
        uuid: '',
        authConfigId: '',
        authConfigUUID: '',
        userId: '',
        status: 'ACTIVE',
      },
    },
  };
};
