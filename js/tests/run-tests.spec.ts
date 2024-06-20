import { test, expect } from '@playwright/test';
import { exec, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const examplesDir = path.join(__dirname, '../examples');
test('Run examples', async ({ page }) => {
  try {
    const files = fs.readdirSync(examplesDir);

    for (let file of files) {
      const exampleDir = path.join(examplesDir, file);
      if (fs.lstatSync(exampleDir).isDirectory()) {
        const exampleName = file;
        await test.step(exampleName, async () => {
          await new Promise((resolve, reject) => {
            execSync(`pnpm build && cd ${exampleDir} && pnpm link ../../`);
            exec(`pnpm build && cd ${exampleDir} && pnpm start`, (error, stdout, stderr) => {
              if (error) {
                console.error(`exec error: ${error}`);
                reject(error);
                return;
              }
              console.log(`stdout: ${stdout}`);
              console.error(`stderr: ${stderr}`);
              
              // Assert some stuff on stdout for test checks
              try {
                expect(stdout).toContain('Expected output');
                expect(stderr).toBe('');
                resolve();
              } catch (assertionError) {
                reject(assertionError);
              }
            });
          });
        });
      }
    }
  } catch (err) {
    console.error(`Unable to read examples directory: ${err}`);
  }
});
