"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
exports.Entity = exports.Composio = void 0;
var axios_1 = require("axios");
var connectedAccounts_1 = require("./models/connectedAccounts");
var apps_1 = require("./models/apps");
var actions_1 = require("./models/actions");
var triggers_1 = require("./models/triggers");
var integrations_1 = require("./models/integrations");
var activeTriggers_1 = require("./models/activeTriggers");
var client_1 = require("./client");
var Composio = /** @class */ (function () {
    function Composio(apiKey, baseUrl, runtime) {
        this.apiKey = apiKey || process.env.ENV_COMPOSIO_API_KEY || '';
        if (!this.apiKey) {
            throw new Error('API key is missing');
        }
        this.baseUrl = baseUrl || this.getApiUrlBase();
        this.http = axios_1["default"].create({
            baseURL: this.baseUrl,
            headers: {
                'X-API-KEY': "".concat(this.apiKey),
                'X-SOURCE': 'js_sdk',
                'X-RUNTIME': runtime
            }
        });
        this.config = __assign(__assign({}, client_1.OpenAPI), { HEADERS: {
                'X-API-Key': "".concat(this.apiKey)
            } });
        this.connectedAccounts = new connectedAccounts_1.ConnectedAccounts(this);
        this.apps = new apps_1.Apps(this);
        this.actions = new actions_1.Actions(this);
        this.triggers = new triggers_1.Triggers(this);
        this.integrations = new integrations_1.Integrations(this);
        this.activeTriggers = new activeTriggers_1.ActiveTriggers(this);
    }
    Composio.prototype.getClientId = function () {
        return __awaiter(this, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.http.get('/v1/client/auth/client_info', {
                            headers: {
                                'X-API-KEY': "".concat(this.apiKey)
                            }
                        })];
                    case 1:
                        response = _a.sent();
                        if (response.status !== 200) {
                            throw new Error("HTTP Error: ".concat(response.status));
                        }
                        return [2 /*return*/, response.data.client.id];
                }
            });
        });
    };
    Composio.prototype.getApiUrlBase = function () {
        return 'https://backend.composio.dev/api';
    };
    Composio.generateAuthKey = function (baseUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var http, response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        http = axios_1["default"].create({
                            baseURL: baseUrl || 'https://backend.composio.dev/api',
                            headers: {
                                'Authorization': ''
                            }
                        });
                        return [4 /*yield*/, http.get('/v1/cli/generate_cli_session')];
                    case 1:
                        response = _a.sent();
                        if (response.status !== 200) {
                            throw new Error("HTTP Error: ".concat(response.status));
                        }
                        return [2 /*return*/, response.data.key];
                }
            });
        });
    };
    Composio.validateAuthSession = function (key, code, baseUrl) {
        return __awaiter(this, void 0, void 0, function () {
            var http, response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        http = axios_1["default"].create({
                            baseURL: baseUrl || 'https://backend.composio.dev/api',
                            headers: {
                                'Authorization': ''
                            }
                        });
                        return [4 /*yield*/, http.get("/v1/cli/verify_cli_code", {
                                params: { key: key, code: code }
                            })];
                    case 1:
                        response = _a.sent();
                        if (response.status !== 200) {
                            throw new Error("HTTP Error: ".concat(response.status));
                        }
                        return [2 /*return*/, response.data.apiKey];
                }
            });
        });
    };
    Composio.prototype.getEntity = function (id) {
        if (id === void 0) { id = 'default'; }
        return new Entity(this, id);
    };
    return Composio;
}());
exports.Composio = Composio;
var Entity = /** @class */ (function () {
    function Entity(client, id) {
        if (id === void 0) { id = 'DEFAULT_ENTITY_ID'; }
        this.client = client;
        this.id = id;
    }
    Entity.prototype.execute = function (actionName, params, text, connectedAccountId) {
        return __awaiter(this, void 0, void 0, function () {
            var action, app, connectedAccount, connectedAccounts;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.client.actions.get({
                            actionName: actionName
                        })];
                    case 1:
                        action = _a.sent();
                        if (!action) {
                            throw new Error("Could not find action: " + actionName);
                        }
                        return [4 /*yield*/, this.client.apps.get({
                                appKey: action.appKey
                            })];
                    case 2:
                        app = _a.sent();
                        if (app.yaml.no_auth) {
                            return [2 /*return*/, this.client.actions.execute({
                                    actionName: actionName,
                                    requestBody: {
                                        input: params,
                                        appName: action.appKey
                                    }
                                })];
                        }
                        connectedAccount = null;
                        if (!connectedAccountId) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.client.connectedAccounts.get({
                                connectedAccountId: connectedAccountId
                            })];
                    case 3:
                        connectedAccount = _a.sent();
                        return [3 /*break*/, 6];
                    case 4: return [4 /*yield*/, this.client.connectedAccounts.list({
                            user_uuid: this.id
                        })];
                    case 5:
                        connectedAccounts = _a.sent();
                        if (connectedAccounts.items.length === 0) {
                            throw new Error('No connected account found');
                        }
                        connectedAccount = connectedAccounts.items[0];
                        _a.label = 6;
                    case 6: return [2 /*return*/, this.client.actions.execute({
                            actionName: actionName,
                            requestBody: {
                                connectedAccountId: connectedAccount.id,
                                input: params,
                                appName: action.appKey,
                                text: text
                            }
                        })];
                }
            });
        });
    };
    Entity.prototype.getConnection = function (app, connectedAccountId) {
        return __awaiter(this, void 0, void 0, function () {
            var latestAccount, latestCreationDate, connectedAccounts, _i, _a, connectedAccount, creationDate;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!connectedAccountId) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.client.connectedAccounts.get({
                                connectedAccountId: connectedAccountId
                            })];
                    case 1: return [2 /*return*/, _b.sent()];
                    case 2:
                        latestAccount = null;
                        latestCreationDate = null;
                        return [4 /*yield*/, this.client.connectedAccounts.list({
                                user_uuid: this.id
                            })];
                    case 3:
                        connectedAccounts = _b.sent();
                        if (!connectedAccounts.items || connectedAccounts.items.length === 0) {
                            return [2 /*return*/, null];
                        }
                        for (_i = 0, _a = connectedAccounts.items; _i < _a.length; _i++) {
                            connectedAccount = _a[_i];
                            if (app === connectedAccount.appName) {
                                creationDate = new Date(connectedAccount.createdAt);
                                if ((!latestAccount || (latestCreationDate && creationDate > latestCreationDate)) && connectedAccount.status === "ACTIVE") {
                                    latestCreationDate = creationDate;
                                    latestAccount = connectedAccount;
                                }
                            }
                        }
                        if (!latestAccount) {
                            return [2 /*return*/, null];
                        }
                        return [2 /*return*/, this.client.connectedAccounts.get({
                                connectedAccountId: latestAccount.id
                            })];
                }
            });
        });
    };
    Entity.prototype.setupTrigger = function (app, triggerName, config) {
        return __awaiter(this, void 0, void 0, function () {
            var connectedAccount;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getConnection(app)];
                    case 1:
                        connectedAccount = _a.sent();
                        if (!connectedAccount) {
                            throw new Error("Could not find a connection with app='".concat(app, "' and entity='").concat(this.id, "'"));
                        }
                        return [2 /*return*/, this.client.triggers.setup({
                                triggerName: triggerName,
                                connectedAccountId: connectedAccount.id,
                                requestBody: {
                                    triggerConfig: config
                                }
                            })];
                }
            });
        });
    };
    Entity.prototype.disableTrigger = function (triggerId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                /**
                 * Disable a trigger for an entity.
                 *
                 * @param triggerId Trigger ID
                 */
                return [2 /*return*/, this.client.activeTriggers.disable({ triggerId: triggerId })];
            });
        });
    };
    Entity.prototype.getConnections = function () {
        return __awaiter(this, void 0, void 0, function () {
            var connectedAccounts;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.client.connectedAccounts.list({
                            user_uuid: this.id
                        })];
                    case 1:
                        connectedAccounts = _a.sent();
                        return [2 /*return*/, connectedAccounts.items];
                }
            });
        });
    };
    Entity.prototype.getActiveTriggers = function () {
        return __awaiter(this, void 0, void 0, function () {
            var connectedAccounts, activeTriggers;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getConnections()];
                    case 1:
                        connectedAccounts = _a.sent();
                        return [4 /*yield*/, this.client.activeTriggers.list({
                                connectedAccountIds: connectedAccounts.map(function (account) { return account.id; }).join(",")
                            })];
                    case 2:
                        activeTriggers = _a.sent();
                        return [2 /*return*/, activeTriggers.triggers];
                }
            });
        });
    };
    Entity.prototype.initiateConnection = function (appName, authMode, authConfig, redirectUrl, integrationId) {
        return __awaiter(this, void 0, void 0, function () {
            var app, timestamp, integration, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.client.apps.get({ appKey: appName })];
                    case 1:
                        app = _b.sent();
                        timestamp = new Date().toISOString().replace(/[-:.]/g, "");
                        if (!integrationId) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.client.integrations.get({ integrationId: integrationId })];
                    case 2:
                        _a = _b.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        _a = null;
                        _b.label = 4;
                    case 4:
                        integration = _a;
                        if (!(!integration && authMode)) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.client.integrations.create({
                                appId: app.appId,
                                name: "integration_".concat(timestamp),
                                authScheme: authMode,
                                authConfig: authConfig,
                                useComposioAuth: false
                            })];
                    case 5:
                        integration = _b.sent();
                        _b.label = 6;
                    case 6:
                        if (!(!integration && !authMode)) return [3 /*break*/, 8];
                        return [4 /*yield*/, this.client.integrations.create({
                                appId: app.appId,
                                name: "integration_".concat(timestamp),
                                useComposioAuth: true
                            })];
                    case 7:
                        integration = _b.sent();
                        _b.label = 8;
                    case 8: 
                    // Initiate the connection process
                    return [2 /*return*/, this.client.connectedAccounts.initiate({
                            integrationId: integration.id,
                            userUuid: this.id,
                            redirectUri: redirectUrl
                        })];
                }
            });
        });
    };
    return Entity;
}());
exports.Entity = Entity;
