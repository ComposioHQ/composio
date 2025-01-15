import * as SDKClient from "./services.gen";

export default {
  logs: SDKClient.LogsService,
  actionsV1: SDKClient.ActionsService,
  actionsV2: SDKClient.ActionsService,
  apiKeys: SDKClient.ApiKeysService,
  clientAuth: SDKClient.ClientService,
  cli: SDKClient.CliService,
  appConnector: SDKClient.IntegrationsService,
  appConnectorV2: SDKClient.IntegrationsV2Service,
  apps: SDKClient.AppsService,
  connections: SDKClient.ConnectionsService,
  connectionsV2: SDKClient.Connectionsv2Service,
  triggers: SDKClient.TriggersService,
};
