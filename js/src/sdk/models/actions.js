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
exports.Actions = void 0;
var client_1 = require("../client");
/**
 * The `Actions` class provides methods to interact with the Composio platform's actions.
 * It allows fetching details of specific actions, listing all actions, and executing actions.
 *
 * - `get` method retrieves details of a specific action.
 * - `list` method retrieves a list of all actions.
 * - `execute` method executes a specific action.
 *
 * Each method returns a `CancelablePromise` which can be canceled. If canceled, the promise
 * will reject with a `Cancellation` object.
 *
 * @typeParam Composio The client configuration object type.
 * @groupDescription Methods
 * The methods in this class are grouped under 'Actions Methods' and provide functionalities
 * to interact with actions in the Composio platform. This includes fetching, listing, and
 * executing actions.
 */
var Actions = /** @class */ (function () {
    function Actions(client) {
        this.client = client;
    }
    /**
     * Retrieves details of a specific action in the Composio platform by providing its action name.
     *
     * The response includes the action's name, display name, description, input parameters, expected response, associated app information, and enabled status.
     *
     * @param {GetActionData} data The data for the request.
     * @returns {CancelablePromise<GetActionResponse[0]>} A promise that resolves to the details of the action.
     * @throws {ApiError} If the request fails.
     */
    Actions.prototype.get = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var actions;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, client_1.getAction)(data, this.client.config)];
                    case 1:
                        actions = _a.sent();
                        return [2 /*return*/, actions[0]];
                }
            });
        });
    };
    /**
     * Retrieves a list of all actions in the Composio platform.
     *
     * This method allows you to fetch a list of all the available actions. It supports pagination to handle large numbers of actions. The response includes an array of action objects, each containing information such as the action's name, display name, description, input parameters, expected response, associated app information, and enabled status.
     *
     * @param {GetListActionsData} data The data for the request.
     * @returns {CancelablePromise<GetListActionsResponse>} A promise that resolves to the list of all actions.
     * @throws {ApiError} If the request fails.
     */
    Actions.prototype.list = function (data) {
        if (data === void 0) { data = {}; }
        return (0, client_1.getListActions)(data, this.client.config);
    };
    /**
     * Executes a specific action in the Composio platform.
     *
     * This method allows you to trigger the execution of an action by providing its name and the necessary input parameters. The request includes the connected account ID to identify the app connection to use for the action, and the input parameters required by the action. The response provides details about the execution status and the response data returned by the action.
     *
     * @param {ExecuteActionData} data The data for the request.
     * @returns {CancelablePromise<ExecuteActionResponse>} A promise that resolves to the execution status and response data.
     * @throws {ApiError} If the request fails.
     */
    Actions.prototype.execute = function (data) {
        return (0, client_1.executeAction)(data, this.client.config);
    };
    return Actions;
}());
exports.Actions = Actions;
