import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getEnvVariable } from "../../utils/shared";
import { client as axiosClient } from "../client/services.gen";
import apiClient from "../client/client";
import { AxiosInstance } from 'axios';
import logger from '../../utils/logger';

// Constants
const LOCAL_CACHE_DIRECTORY_NAME = '.composio';
const USER_DATA_FILE_NAME = 'user_data.json';
const DEFAULT_BASE_URL = "https://backend.composio.dev";

// File path helpers
export const userDataPath = () => path.join(os.homedir(), LOCAL_CACHE_DIRECTORY_NAME, USER_DATA_FILE_NAME);

export const getUserDataJson = () => {
    try {
        const data = fs.readFileSync(userDataPath(), 'utf8');
        return JSON.parse(data);
    } catch (error: any) {
        return {};
    }
}

/**
 * Writes data to a file, creating the directory if it doesn't exist.
 * @param filePath - The path to the file where data will be written.
 * @param data - The data to be written to the file.
 */
export const writeToFile = (filePath: string, data: any) => {
    try {
        const dirPath = path.dirname(filePath);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        logger.error("Oops! We couldn't save your settings. Here's why:", (error as Error).message);
        logger.error("Need help? Check file permissions for file:", filePath);
    }
}

// Axios configuration
export const setAxiosClientConfig = (axiosClientInstance: AxiosInstance) => {
    axiosClientInstance.interceptors.request.use((request) => {
        const body = request.data ? JSON.stringify(request.data) : '';
        logger.debug(`API Req [${request.method?.toUpperCase()}] ${request.url}`, {
            ...(body && { body })
        });
        request.metadata = { startTime: Date.now() };
        return request;
    });

    axiosClientInstance.interceptors.response.use(
        (response) => {
            const method = response.config.method?.toUpperCase();
            const responseSize = Math.round(JSON.stringify(response.data).length / 1024);
            const requestStartTime = response.config.metadata?.startTime;
            const responseTime = requestStartTime ? Date.now() - requestStartTime : 0;
            const responseData = response.data ? JSON.stringify(response.data) : '';

            logger.debug(`API Res [${method}] ${response.config.url} ${responseSize} KB ${responseTime}ms`, {
                ...(responseData && { response: JSON.parse(responseData) })
            });
            return response;
        },
        (error) => {
            const requestStartTime = error.config?.metadata?.startTime;
            const responseTime = requestStartTime ? Date.now() - requestStartTime : 0;

            logger.debug(`API Error [${error.response?.status || 'Unknown'}] ${error.config?.method?.toUpperCase()} ${error.config?.url} ${responseTime}ms`, {
                headers: error.response?.headers,
                data: error.response?.data,
                error: error.message,
                responseTime
            });
            return Promise.reject(error);
        }
    );
}

// Client configuration functions
export function getClientBaseConfig(baseUrl?: string, apiKey?: string) {
    const userData = getUserDataJson();
    const { api_key: apiKeyFromUserConfig, base_url: baseURLFromUserConfig } = userData;

    const baseURLParsed = baseUrl || getEnvVariable("COMPOSIO_BASE_URL") || baseURLFromUserConfig || DEFAULT_BASE_URL;
    const apiKeyParsed = apiKey || getEnvVariable("COMPOSIO_API_KEY") || apiKeyFromUserConfig || '';

    return { baseURL: baseURLParsed, apiKey: apiKeyParsed };
}

export function getAPISDK(baseUrl?: string, apiKey?: string) {
    const { baseURL, apiKey: apiKeyParsed } = getClientBaseConfig(baseUrl, apiKey);
    
    axiosClient.setConfig({
        baseURL,
        headers: {
            'X-API-KEY': apiKeyParsed,
            'X-SOURCE': 'js_sdk',
            'X-RUNTIME': 'js_sdk'
        },
        throwOnError: true
    });

    setAxiosClientConfig(axiosClient.instance);
    return apiClient;
}

/**
 * Sets the CLI configuration by updating the user data file.
 * @param apiKey - The API key to be set in the configuration.
 * @param baseUrl - The base URL to be set in the configuration (optional).
 */
export function setCliConfig(apiKey: string, baseUrl: string) {
    const userData = getUserDataJson();
    userData.api_key = apiKey;
    
    if (baseUrl) {
        userData.base_url = baseUrl;
    }
    
    writeToFile(userDataPath(), userData);
}
