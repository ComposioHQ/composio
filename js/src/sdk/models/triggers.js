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
exports.Triggers = void 0;
var client_1 = require("../client");
var pusher_1 = require("../utils/pusher");
var Triggers = /** @class */ (function () {
    function Triggers(client) {
        this.client = client;
        this.trigger_to_client_event = "trigger_to_client";
        this.client = client;
    }
    /**
     * Retrieves a list of all triggers in the Composio platform.
     *
     * This method allows you to fetch a list of all the available triggers. It supports pagination to handle large numbers of triggers. The response includes an array of trigger objects, each containing information such as the trigger's name, description, input parameters, expected response, associated app information, and enabled status.
     *
     * @param {ListTriggersData} data The data for the request.
     * @returns {CancelablePromise<ListTriggersResponse>} A promise that resolves to the list of all triggers.
     * @throws {ApiError} If the request fails.
     */
    Triggers.prototype.list = function (data) {
        if (data === void 0) { data = {}; }
        return (0, client_1.listTriggers)(data, this.client.config);
    };
    /**
     * Setup a trigger for a connected account.
     *
     * @param {SetupTriggerData} data The data for the request.
     * @returns {CancelablePromise<SetupTriggerResponse>} A promise that resolves to the setup trigger response.
     * @throws {ApiError} If the request fails.
     */
    Triggers.prototype.setup = function (data) {
        return (0, client_1.setupTrigger)(data, this.client.config);
    };
    Triggers.prototype.subscribe = function (fn, filters) {
        if (filters === void 0) { filters = {}; }
        return __awaiter(this, void 0, void 0, function () {
            var clientId, shouldSendTrigger;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!fn)
                            throw new Error("Function is required for trigger subscription");
                        return [4 /*yield*/, this.client.getClientId()];
                    case 1:
                        clientId = _a.sent();
                        return [4 /*yield*/, pusher_1.PusherUtils.getPusherClient(this.client.baseUrl, this.client.apiKey)];
                    case 2:
                        _a.sent();
                        shouldSendTrigger = function (data) {
                            if (Object.keys(filters).length === 0)
                                return true;
                            else {
                                return ((!filters.appName || data.appName === filters.appName) &&
                                    (!filters.triggerId || data.metadata.id === filters.triggerId) &&
                                    (!filters.connectionId || data.metadata.connectionId === filters.connectionId) &&
                                    (!filters.triggerName || data.metadata.triggerName === filters.triggerName) &&
                                    (!filters.entityId || data.metadata.connection.clientUniqueUserId === filters.entityId) &&
                                    (!filters.integrationId || data.metadata.connection.integrationId === filters.integrationId));
                            }
                        };
                        console.log("Subscribing to triggers", filters);
                        pusher_1.PusherUtils.triggerSubscribe(clientId, function (data) {
                            if (shouldSendTrigger(data)) {
                                fn(data);
                            }
                        });
                        return [2 /*return*/];
                }
            });
        });
    };
    Triggers.prototype.unsubscribe = function () {
        return __awaiter(this, void 0, void 0, function () {
            var clientId;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.client.getClientId()];
                    case 1:
                        clientId = _a.sent();
                        pusher_1.PusherUtils.triggerUnsubscribe(clientId);
                        return [2 /*return*/];
                }
            });
        });
    };
    return Triggers;
}());
exports.Triggers = Triggers;
