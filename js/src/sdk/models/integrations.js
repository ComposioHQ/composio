"use strict";
exports.__esModule = true;
exports.Integrations = void 0;
var client_1 = require("../client");
var Integrations = /** @class */ (function () {
    function Integrations(client) {
        this.client = client;
        this.client = client;
    }
    /**
     * Retrieves a list of all available integrations in the Composio platform.
     *
     * This method allows clients to explore and discover the supported integrations. It returns an array of integration objects, each containing essential details such as the integration's key, name, description, logo, categories, and unique identifier.
     *
     * @returns {Promise<ListAllIntegrationsResponse>} A promise that resolves to the list of all integrations.
     * @throws {ApiError} If the request fails.
     */
    Integrations.prototype.list = function (data) {
        if (data === void 0) { data = {}; }
        return (0, client_1.listAllIntegrations)(data, this.client.config);
    };
    /**
     * Retrieves details of a specific integration in the Composio platform by providing its integration name.
     *
     * The response includes the integration's name, display name, description, input parameters, expected response, associated app information, and enabled status.
     *
     * @param {GetIntegrationData} data The data for the request.
     * @returns {CancelablePromise<GetIntegrationResponse>} A promise that resolves to the details of the integration.
     * @throws {ApiError} If the request fails.
     */
    Integrations.prototype.get = function (data) {
        return (0, client_1.getIntegration)(data, this.client.config);
    };
    /**
     * Creates a new integration in the Composio platform.
     *
     * This method allows clients to create a new integration by providing the necessary details such as app ID, name, authentication mode, and configuration.
     *
     * @param {CreateIntegrationData["requestBody"]} data The data for the request.
     * @returns {CancelablePromise<CreateIntegrationResponse>} A promise that resolves to the created integration model.
     * @throws {ApiError} If the request fails.
     */
    Integrations.prototype.create = function (data) {
        if (!(data === null || data === void 0 ? void 0 : data.authConfig)) {
            data.authConfig = {};
        }
        return (0, client_1.createIntegration)({
            requestBody: data
        }, this.client.config);
    };
    return Integrations;
}());
exports.Integrations = Integrations;
