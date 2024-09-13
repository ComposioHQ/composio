import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getEnvVariable } from "../../utils/shared";

import { client as axiosClient } from "../client/services.gen"
import apiClient from "../client/client"


// Constants
const LOCAL_CACHE_DIRECTORY_NAME = '.composio';
const USER_DATA_FILE_NAME = 'user_data.json';
const DEFAULT_BASE_URL = "https://backend.composio.dev";

export const userDataPath = path.join(os.homedir(), LOCAL_CACHE_DIRECTORY_NAME, USER_DATA_FILE_NAME);

export const getUserDataJson = () => {
    try {
        const data = fs.readFileSync(userDataPath, 'utf8');
        return JSON.parse(data);
    } catch (error: any) {
        return (error.code === 'ENOENT') ? {} : {};
    }
}

// Client configuration
export function getClientBaseConfig(baseUrl?: string, apiKey?: string) {
    const userData = getUserDataJson();
    const { api_key: apiKeyFromUserConfig, base_url: baseURLFromUserConfig } = userData;

    const baseURLParsed = baseUrl || getEnvVariable("COMPOSIO_BASE_URL") || baseURLFromUserConfig || DEFAULT_BASE_URL;
    const apiKeyParsed = apiKey || getEnvVariable("COMPOSIO_API_KEY") || apiKeyFromUserConfig || '';

    return { baseURL: baseURLParsed, apiKey: apiKeyParsed };
}

export function getAPISDK(baseUrl?: string, apiKey?: string) {
    const { baseURL, apiKey:apiKeyParsed } = getClientBaseConfig(baseUrl, apiKey);
    axiosClient.setConfig({
        baseURL: baseURL,
        headers: {
            'X-API-KEY': `${apiKeyParsed}`,
            'X-SOURCE': 'js_sdk',
            'X-RUNTIME': 'js_sdk'
        },
        throwOnError: true
    });

    return apiClient;
}

export function setCliConfig(apiKey:string,baseUrl:string){
    const userData = getUserDataJson();
    userData.api_key = apiKey;
    if(!!baseUrl){
        userData.base_url = baseUrl;
    }
    fs.writeFileSync(userDataPath, JSON.stringify(userData, null, 2));
}