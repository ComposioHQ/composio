import { AppInfoResponseDto, AppListResDTO, SingleAppInfoResDTO } from "../client";
import apiClient from "../client/client"
import { BackendClient } from "./backendClient";

export type GetAppData = {
    appKey: string;
};

export type GetAppResponse = SingleAppInfoResDTO;

export type ListAllAppsResponse = AppListResDTO;

export type RequiredParamsResponse = {
    required_fields: string[];
    expected_from_user: string[];
    optional_fields: string[];
};

export type RequiredParamsFullResponse = {
    availableAuthSchemes: string[];
    authSchemes: Record<string, RequiredParamsResponse>;
};

export class Apps {
    backendClient: BackendClient;
    constructor(backendClient: BackendClient) {
        this.backendClient = backendClient;
    }
    /**
     * Retrieves a list of all available apps in the Composio platform.
     * 
     * This method allows clients to explore and discover the supported apps. It returns an array of app objects, each containing essential details such as the app's key, name, description, logo, categories, and unique identifier.
     * 
     * @returns {Promise<AppListResDTO>} A promise that resolves to the list of all apps.
     * @throws {ApiError} If the request fails.
     */
    list(): Promise<AppInfoResponseDto[]> {
        return apiClient.apps.getApps().then(res => res.data!.items)
    }

    /**
     * Retrieves details of a specific app in the Composio platform.
     * 
     * This method allows clients to fetch detailed information about a specific app by providing its unique key. The response includes the app's name, key, status, description, logo, categories, authentication schemes, and other metadata.
     * 
     * @param {GetAppData} data The data for the request, including the app's unique key.
     * @returns {CancelablePromise<GetAppResponse>} A promise that resolves to the details of the app.
     * @throws {ApiError} If the request fails.
     */
    get(data: GetAppData) {
        return apiClient.apps.getApp({
            path:{
                appName: data.appKey
            },
            throwOnError: true
        }).then(res => res.data!)
    }

    async getRequiredParams(appId: string): Promise<RequiredParamsFullResponse> {
        const appData = await this.get({ appKey: appId });
        const authSchemes = appData.auth_schemes;
        const availableAuthSchemes = (authSchemes as Array<{ mode: string }>)?.map(scheme => scheme?.mode);
        
        const authSchemesObject: Record<string, RequiredParamsResponse> = {};

        for (const scheme of authSchemes as Array<{
            mode: string;
            fields: Array<{
                name: string;
                required: boolean;
                expected_from_customer: boolean;
            }>;
        }>) {
            const name = scheme.mode;
            authSchemesObject[name] = {
                required_fields: [],
                optional_fields: [],
                expected_from_user: []
            };

            scheme.fields.forEach((field) => {
                const isExpectedForIntegrationSetup = field.expected_from_customer === false;
                const isRequired = field.required;
                
                if (isExpectedForIntegrationSetup) {
                    if (isRequired) {
                        authSchemesObject[name].expected_from_user.push(field.name);
                    } else {
                        authSchemesObject[name].optional_fields.push(field.name);
                    }
                } else {
                    authSchemesObject[name].required_fields.push(field.name);
                }
            });
        }

        return {
            availableAuthSchemes,
            authSchemes: authSchemesObject
        };
    }

    async getRequiredParamsForAuthScheme(appId: string, authScheme: string): Promise<RequiredParamsResponse> {
        return this.getRequiredParams(appId).then(res => res.authSchemes[authScheme]);
    }
}

