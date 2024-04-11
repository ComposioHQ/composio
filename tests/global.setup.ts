import { test as setup, expect } from '@playwright/test';
import { execSync } from 'child_process';
import fs from "fs";

const userDataPath = `${process.env.HOME}/.composio`;

setup('user session management', async ({ }) => {
    // Check if directory exists, delete it if it does
    if (fs.existsSync(userDataPath)) {
    execSync(`rm -rf ${userDataPath}`);
    console.log(`Existing directory '${userDataPath}' deleted successfully.`);
    }

    // Create directory and write file
    execSync(`mkdir -p ${userDataPath}`);
    fs.writeFileSync(
    `${userDataPath}/user_data.json`,
    JSON.stringify({ "api_key": "3kmtwhffkxvwebhnm7qwzj" }, null, 2)
    );

    // Read file and verify content
    const data = fs.readFileSync(`${userDataPath}/user_data.json`, 'utf8');
    expect(data).toContain('3kmtwhffkxvwebhnm7qwzj');
    console.log('user_data.json created and verified successfully.');
});