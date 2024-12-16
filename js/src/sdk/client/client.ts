import * as SDKClient from "./services.gen";

export default {
  logs: SDKClient.LogsService,
  actionsV1: SDKClient.ActionsService,
  actionsV2: SDKClient.ActionsService,
  apiKeys: SDKClient.ApiKeysService,
  clientAuth: SDKClient.AuthService,
  cli: SDKClient.CliService,
  appConnector: SDKClient.IntegrationsService,
  apps: SDKClient.AppsService,
  connections: SDKClient.ConnectionsService,
  triggers: SDKClient.TriggersService,
};
