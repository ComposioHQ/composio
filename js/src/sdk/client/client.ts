import * as SDKClient from "./services.gen";

export default {
    logs: SDKClient.LogsService,
    actionsV1: SDKClient.ActionsControllerV1Service,
    actionsV2: SDKClient.ActionsControllerV2Service,
    apiKeys: SDKClient.ApiKeysService,
    clientAuthService: SDKClient.ClientAuthService,
    cli: SDKClient.CliService,
    appConnector: SDKClient.AppConnectorService,

    apps: SDKClient.AppService,
    appLogin: SDKClient.AppLoginService,

    connections: SDKClient.ConnectionsService,
    metadata: SDKClient.MetadataService,
    team: SDKClient.TeamService,
    triggers: SDKClient.TriggersService,
};
