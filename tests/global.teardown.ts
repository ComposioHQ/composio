import { test as teardown, expect } from '@playwright/test';
import { execSync } from 'child_process';

teardown('logout user session', async ({ }) => {
    const output = execSync(`python3 ./start_cli.py logout`).toString();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(output).not.toBeNull();
});