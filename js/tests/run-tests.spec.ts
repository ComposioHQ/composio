import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const examplesDir = path.join(__dirname, '../examples');
const files = fs.readdirSync(examplesDir);

for (let file of files) {
  const exampleDir = path.join(examplesDir, file);
  if (fs.lstatSync(exampleDir).isDirectory()) {
    const exampleName = file;
    test(exampleName, async ({ page }) => {
      await new Promise<void>((resolve, reject) => {
        try {
          execSync(`pnpm build && cd ${exampleDir} && pnpm link ../../`);
          console.log(`Running example: ${exampleName}`);
          const { stdout, stderr } = execSync(`pnpm build && cd ${exampleDir} && pnpm start`);
          console.log(`stdout: ${stdout}`);
          console.error(`stderr: ${stderr}`);
          
          // Assert some stuff on stdout for test checks
          expect(stdout).toContain('Expected output');
          expect(stderr).toBe('');
          resolve();
        } catch (error) {
          console.error(`exec error: ${error}`);
          reject(error);
        }
      });
    });
  }
}
