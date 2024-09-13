import axios from "axios";
import fs from "fs";

export const convertReqParams = (properties: Record<string, any>) => {
    const clonedProperties = JSON.parse(JSON.stringify(properties));
    for (const propertyKey of Object.keys(clonedProperties)) {
        const object = clonedProperties[propertyKey];
        const isObject = typeof object === "object";
        const isFile = isObject && (object?.required?.includes("name") && object?.required?.includes("content"));

        if (isFile) {
            const newKey = `${propertyKey}_file_uri_path`;
            clonedProperties[newKey] = {
                type: "string",
                title: "Name",
                description: "Local absolute path to the file or http url to the file"
            }

            delete clonedProperties[propertyKey];
        }
    }


    return clonedProperties;
}

export const converReqParamForActionExecution = async (params: Record<string, any>) => {
    const clonedParams = JSON.parse(JSON.stringify(params));
    for (const key of Object.keys(clonedParams)) {

        if (key.includes("file_uri_path")) {
            const initKey = key.replace("_file_uri_path", "");
            clonedParams[initKey] = {};
            const newKey = clonedParams[initKey];

            const valuePassedByClient = clonedParams[key];
            // if not http url
            if (valuePassedByClient.startsWith("http") || valuePassedByClient.startsWith("https")) {
                newKey.name = valuePassedByClient.split("/").pop();
                const response = await axios.get(valuePassedByClient, { responseType: 'arraybuffer' });
                newKey.content = Buffer.from(response.data, 'binary').toString('base64');
            } else {
                const file = await fs.promises.readFile(valuePassedByClient, {
                    encoding: null
                });
                newKey.content = file.toString('base64');
                newKey.name = valuePassedByClient.split("/").pop();
            }
            delete clonedParams[key];
        }
    }

    return clonedParams;
}