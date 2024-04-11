import { test, expect } from '@playwright/test';
import fs from 'fs';
import { execSync } from 'child_process';

test.describe('Python CLI Operations', () => {
    const commands = [
      { command: 'whoami', description: 'Running whoami' },
      { command: 'show-apps', description: 'Running show-apps' },
      { command: 'show-connections github', description: 'Running show-connections github' },
      { command: 'list-triggers github', description: 'Running list-triggers github' },
    ];

    commands.forEach(({ command, description }) => {
      test(description, async () => {
        const output = execSync(`python3 core/start_cli.py ${command}`).toString();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        console.log(description + ':', output);
        expect(output).not.toBeNull();
      });
    });
});