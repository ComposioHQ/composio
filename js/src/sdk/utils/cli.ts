import { getUserDataJson, userDataPath } from "./config";
import { saveFile } from "./fileUtils";
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
    
    saveFile(userDataPath(), userData);
}
