"use strict";
exports.__esModule = true;
exports.ActiveTriggers = void 0;
var client_1 = require("../client");
var ActiveTriggers = /** @class */ (function () {
    function ActiveTriggers(client) {
        this.client = client;
        this.client = client;
    }
    /**
     * Retrieves details of a specific active trigger in the Composio platform by providing its trigger name.
     *
     * The response includes the trigger's name, description, input parameters, expected response, associated app information, and enabled status.
     *
     * @param {GetActiveTriggerData} data The data for the request.
     * @returns {CancelablePromise<GetActiveTriggerResponse>} A promise that resolves to the details of the active trigger.
     * @throws {ApiError} If the request fails.
     */
    ActiveTriggers.prototype.get = function (data) {
        return (0, client_1.getActiveTrigger)(data, this.client.config);
    };
    /**
     * Retrieves a list of all active triggers in the Composio platform.
     *
     * This method allows you to fetch a list of all the available active triggers. It supports pagination to handle large numbers of triggers. The response includes an array of trigger objects, each containing information such as the trigger's name, description, input parameters, expected response, associated app information, and enabled status.
     *
     * @param {ListActiveTriggersData} data The data for the request.
     * @returns {CancelablePromise<ListActiveTriggersResponse>} A promise that resolves to the list of all active triggers.
     * @throws {ApiError} If the request fails.
     */
    ActiveTriggers.prototype.list = function (data) {
        if (data === void 0) { data = {}; }
        return (0, client_1.listActiveTriggers)(data, this.client.config);
    };
    /**
     * Enables the previously disabled trigger.
     *
     * @param {Object} data The data for the request.
     * @param {string} data.triggerId Id of the trigger
     * @returns {CancelablePromise<Record<string, any>>} A promise that resolves to the response of the enable request.
     * @throws {ApiError} If the request fails.
     */
    ActiveTriggers.prototype.enable = function (data) {
        return (0, client_1.updateActiveTriggerStatus)({
            triggerId: data.triggerId,
            requestBody: {
                enabled: true
            }
        }, this.client.config);
    };
    /**
     * Disables the previously disabled trigger.
     *
     * @param {Object} data The data for the request.
     * @param {string} data.triggerId Id of the trigger
     * @returns {CancelablePromise<Record<string, any>>} A promise that resolves to the response of the enable request.
     * @throws {ApiError} If the request fails.
     */
    ActiveTriggers.prototype.disable = function (data) {
        return (0, client_1.updateActiveTriggerStatus)({
            triggerId: data.triggerId,
            requestBody: {
                enabled: false
            }
        }, this.client.config);
    };
    return ActiveTriggers;
}());
exports.ActiveTriggers = ActiveTriggers;
