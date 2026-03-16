export type TriggerListenEvent = {
  id: string;
  uuid: string;
  triggerSlug: string;
  toolkitSlug: string;
  userId: string;
  payload: Record<string, unknown>;
  originalPayload: Record<string, unknown>;
  metadata: {
    id: string;
    uuid: string;
    toolkitSlug: string;
    triggerSlug: string;
    triggerData?: string;
    triggerConfig: Record<string, unknown>;
    connectedAccount: {
      id: string;
      uuid: string;
      authConfigId: string;
      authConfigUUID: string;
      userId: string;
      status: string;
    };
  };
};

export type TriggerListenFilters = {
  toolkits?: ReadonlyArray<string>;
  triggerId?: string;
  connectedAccountId?: string;
  triggerSlug?: ReadonlyArray<string>;
  userId?: string;
};
