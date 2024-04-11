import { test, expect } from '@playwright/test';
import fs from 'fs';
import { execSync } from 'child_process';

test.describe.serial('Python CLI Core Operations', () => {
    test('add integration for API_KEY', async () => {
        const output = execSync(`python3 core/start_cli.py add github`).toString();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        expect(output).not.toBeNull();
    });
});