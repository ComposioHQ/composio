import ComposioSDK from "@composio/client";

export class Triggers {
  private client: ComposioSDK;

  constructor(client: ComposioSDK) {
    this.client = client;
  }

  async list() {
    return this.client.triggerInstances.listActive();
  }

  async create(
    slug: string,
    {
      connectedAuthId,
      triggerConfig,
    }: {
      connectedAuthId: string;
      triggerConfig: { [key: string]: any };
    }
  ) {
    return this.client.triggerInstances.upsert(slug, {
      connectedAuthId,
      triggerConfig,
    });
  }

  async delete(slug: string) {
    return this.client.triggerInstances.removeUpsert(slug);
  }
  
}
