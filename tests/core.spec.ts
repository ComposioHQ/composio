import { test, expect } from '@playwright/test';
import fs from 'fs';
import { execSync } from 'child_process';

test.describe.serial('Python CLI Core Operations', () => {
    test.skip('add integration for github', async ({browser}) => {
        const { exec } = require('child_process');
        const command = `DISABLE_COMPOSIO_WEBBROWSER_OPEN=true python3 ./start_cli.py add github`;
        const context = await browser.newContext({ storageState: 'session.json' });

        const process = exec(command);

        process.stdout.on('data', async (data) => {
            // console.log('stdout:', data);
            const match = data.trim().match(/Please authenticate github in the browser and come back here. URL: (.+)/);
            if (match && match[1]) {
                const redirectURL = match[1];
                console.log(`Redirect URL: ${match[1]}`);
                const page = await context.newPage();
                await page.goto(redirectURL);
            }
        });

        process.stderr.on('data', (data) => {
            // console.error('stderr:', data);
        });

        await new Promise((resolve, reject) => {
            process.on('close', (code) => {
                if (code === 0) {
                    resolve(true);
                } else {
                    reject(`Process exited with code ${code}`);
                }
            });
        });

        expect(process).not.toBeNull();
    });
});