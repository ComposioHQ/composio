"use strict";
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
exports.ConnectionRequest = exports.ConnectedAccounts = void 0;
var client_1 = require("../client");
var ConnectedAccounts = /** @class */ (function () {
    function ConnectedAccounts(client) {
        this.client = client;
    }
    /**
     * Retrieves a list of all connected accounts in the Composio platform.
     *
     * It supports pagination and filtering based on various parameters such as app ID, integration ID, and connected account ID. The response includes an array of connection objects, each containing details like the connector ID, connection parameters, status, creation/update timestamps, and associated app information.
     *
     * @param {ListAllConnectionsData} data The data for the request.
     * @returns {CancelablePromise<ListAllConnectionsResponse>} A promise that resolves to the list of all connected accounts.
     * @throws {ApiError} If the request fails.
     */
    ConnectedAccounts.prototype.list = function (data) {
        if (data === void 0) { data = {}; }
        return (0, client_1.listAllConnections)(data, this.client.config);
    };
    /**
     * Connects an account to the Composio platform.
     *
     * This method allows you to connect an external app account with Composio. It requires the integration ID in the request body and returns the connection status, connection ID, and a redirect URL (if applicable) for completing the connection flow.
     *
     * @param {CreateConnectionData} data The data for the request.
     * @returns {CancelablePromise<CreateConnectionResponse>} A promise that resolves to the connection status and details.
     * @throws {ApiError} If the request fails.
     */
    ConnectedAccounts.prototype.create = function (data) {
        if (data === void 0) { data = {}; }
        return (0, client_1.createConnection)(data, this.client.config);
    };
    /**
     * Retrieves details of a specific account connected to the Composio platform by providing its connected account ID.
     *
     * The response includes the integration ID, connection parameters (such as scope, base URL, client ID, token type, access token, etc.), connection ID, status, and creation/update timestamps.
     *
     * @param {GetConnectedAccountData} data The data for the request.
     * @returns {CancelablePromise<GetConnectedAccountResponse>} A promise that resolves to the details of the connected account.
     * @throws {ApiError} If the request fails.
     */
    ConnectedAccounts.prototype.get = function (data) {
        return (0, client_1.getConnectedAccount)(data, this.client.config);
    };
    /**
     * Initiates a new connected account on the Composio platform.
     *
     * This method allows you to start the process of connecting an external app account with Composio. It requires the integration ID and optionally the entity ID, additional parameters, and a redirect URL.
     *
     * @param {CreateConnectionData["requestBody"]} data The data for the request.
     * @returns {CancelablePromise<ConnectionRequest>} A promise that resolves to the connection request model.
     * @throws {ApiError} If the request fails.
     */
    ConnectedAccounts.prototype.initiate = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, client_1.createConnection)({ requestBody: data }, this.client.config)];
                    case 1:
                        response = _a.sent();
                        return [2 /*return*/, new ConnectionRequest(response.connectionStatus, response.connectedAccountId, response.redirectUrl, this.client)];
                }
            });
        });
    };
    return ConnectedAccounts;
}());
exports.ConnectedAccounts = ConnectedAccounts;
var ConnectionRequest = /** @class */ (function () {
    /**
     * Connection request model.
     * @param {string} connectionStatus The status of the connection.
     * @param {string} connectedAccountId The unique identifier of the connected account.
     * @param {string} [redirectUrl] The redirect URL for completing the connection flow.
     */
    function ConnectionRequest(connectionStatus, connectedAccountId, redirectUrl, client) {
        if (redirectUrl === void 0) { redirectUrl = null; }
        this.client = client;
        this.connectionStatus = connectionStatus;
        this.connectedAccountId = connectedAccountId;
        this.redirectUrl = redirectUrl;
    }
    /**
     * Save user access data.
     * @param {Composio} client The Composio client instance.
     * @param {Object} data The data to save.
     * @param {Object} data.fieldInputs The field inputs to save.
     * @param {string} [data.redirectUrl] The redirect URL for completing the connection flow.
     * @param {string} [data.entityId] The entity ID associated with the user.
     * @returns {Promise<Object>} The response from the server.
     */
    ConnectionRequest.prototype.saveUserAccessData = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var connectedAccount;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.client.connectedAccounts.get({
                            connectedAccountId: this.connectedAccountId
                        })];
                    case 1:
                        connectedAccount = _a.sent();
                        return [2 /*return*/, (0, client_1.createConnection)({
                                requestBody: {
                                    integrationId: connectedAccount.integrationId,
                                    data: data.fieldInputs,
                                    redirectUri: data.redirectUrl,
                                    userUuid: data.entityId
                                }
                            }, this.client.config)];
                }
            });
        });
    };
    /**
     * Wait until the connection becomes active.
     * @param {Composio} client The Composio client instance.
     * @param {number} [timeout=60] The timeout period in seconds.
     * @returns {Promise<ConnectedAccountModel>} The connected account model.
     * @throws {ComposioClientError} If the connection does not become active within the timeout period.
     */
    ConnectionRequest.prototype.waitUntilActive = function (timeout) {
        if (timeout === void 0) { timeout = 60; }
        return __awaiter(this, void 0, void 0, function () {
            var startTime, connection;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        startTime = Date.now();
                        _a.label = 1;
                    case 1:
                        if (!(Date.now() - startTime < timeout * 1000)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.client.connectedAccounts.get({
                                connectedAccountId: this.connectedAccountId
                            })];
                    case 2:
                        connection = _a.sent();
                        if (connection.status === 'ACTIVE') {
                            return [2 /*return*/, connection];
                        }
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 1000); })];
                    case 3:
                        _a.sent();
                        return [3 /*break*/, 1];
                    case 4: throw new Error('Connection did not become active within the timeout period.');
                }
            });
        });
    };
    return ConnectionRequest;
}());
exports.ConnectionRequest = ConnectionRequest;
