
import { spawn } from "child_process";
import { TELEMETRY_URL } from "../sdk/utils/constants";

/**
 * Sends a reporting payload to the telemetry server using a child process.
 * This function is intended for use in Node.js environments.
 * 
 * @param {any} reportingPayload - The payload to be sent to the telemetry server.
 */
export async function sendProcessReq(payload:{
    url: string,
    method: string,
    headers: Record<string, string>,
    data: Record<string, unknown>
}) {
    try {
        // Spawn a child process to execute a Node.js script
        const child = spawn('node', ['-e', `
        const axios = require('axios');
        axios.post('${payload.url}', {
            data: ${JSON.stringify(payload.data)},
            headers: ${JSON.stringify(payload.headers)}
        });
        `]);

        // Write the reporting payload to the child process's stdin
        child.stdin.write(JSON.stringify(payload.data));
        // Close the stdin stream
        child.stdin.end();
    } catch (error) {
        console.error("Error sending error to telemetry", error);
        // DO NOTHING
    }
}

/**
 * Sends a reporting payload to the telemetry server using XMLHttpRequest.
 * This function is intended for use in browser environments.
 * 
 * @param {any} reportingPayload - The payload to be sent to the telemetry server.
 */
export async function sendBrowserReq(info:{
    url: string,
    method: string,
    headers: Record<string, string>,
    data: Record<string, unknown>
}) {
    try {
        // Create a new XMLHttpRequest object
        const xhr = new XMLHttpRequest();
        // Open a new POST request to the telemetry server
        xhr.open(info.method, info.url, true);
        // Set the request header to indicate JSON content
        xhr.setRequestHeader('Content-Type', 'application/json');

    // Define the onload event handler
    xhr.onload = function() {
        // Log the response if the request was successful
        if (xhr.status === 200) {
            console.log(xhr.response);
        }
    };

    // Send the reporting payload as a JSON string
        xhr.send(JSON.stringify(info.reportingPayload));
    } catch (error) {
        console.error("Error sending error to telemetry", error);
        // DO NOTHING
    }
}