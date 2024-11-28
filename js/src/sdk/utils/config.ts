import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getEnvVariable } from "../../utils/shared";

import { client as axiosClient } from "../client/services.gen"
import apiClient from "../client/client"
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import logger from '../../utils/logger';


// Constants
const LOCAL_CACHE_DIRECTORY_NAME = '.composio';
const USER_DATA_FILE_NAME = 'user_data.json';
const DEFAULT_BASE_URL = "https://backend.composio.dev";

export const setAxiosClientConfig = (axiosClientInstance: AxiosInstance) => {
   
     axiosClientInstance.interceptors.request.use(
        (request) => {
            logger.debug(`API Req [${request.method?.toUpperCase()}] ${request.url}`, {
                data: request.data
            });
            return request;
        }
    );
     axiosClientInstance.interceptors.response.use(
        (response) => {
            const responseSize = Math.round(JSON.stringify(response.data).length / 1024);
            logger.debug(`API Res [${response.status}] ${response.config.method?.toUpperCase()} ${response.config.url} ${responseSize} KB`);
            return response;
        },
        (error) => {
            logger.debug(`API Error [${error.response?.status || 'Unknown'}] ${error.config?.method?.toUpperCase()} ${error.config?.url}`, {
                headers: error.response?.headers,
                data: error.response?.data,
                error: error.message
            });
            return Promise.reject(error);
        }
    );

}

export const userDataPath = () => path.join(os.homedir(), LOCAL_CACHE_DIRECTORY_NAME, USER_DATA_FILE_NAME);

export const getUserDataJson = () => {
    try {
        const data = fs.readFileSync(userDataPath(), 'utf8');
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

    setAxiosClientConfig(axiosClient.instance);  
 
    return apiClient;
}

/**
 * Writes data to a file, creating the directory if it doesn't exist.
 * @param filePath - The path to the file where data will be written.
 * @param data - The data to be written to the file.
 */
export const writeToFile = (filePath: string, data: any) => {
    try{
        // Get the directory path from the file path
        const dirPath = path.dirname(filePath);
        // Create the directory if it doesn't exist
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        // Write the data to the file as a formatted JSON string
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }catch(error){  
        logger.error("Oops! We couldn't save your settings. Here's why:", (error as Error).message);
        logger.info("Need help? Check file permissions for file:", filePath);
    }
}

/**
 * Sets the CLI configuration by updating the user data file.
 * @param apiKey - The API key to be set in the configuration.
 * @param baseUrl - The base URL to be set in the configuration (optional).
 */
export function setCliConfig(apiKey: string, baseUrl: string) {
    // Get the current user data
    const userData = getUserDataJson();
    // Update the API key
    userData.api_key = apiKey;
    // Update the base URL if provided
    if (!!baseUrl) {
        userData.base_url = baseUrl;
    }
    // Write the updated user data to the file
    writeToFile(userDataPath(), userData);
}
