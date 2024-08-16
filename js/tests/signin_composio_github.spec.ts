import { test, expect } from '@playwright/test';

test('login', async ({ page }) => {
  await page.goto('https://app.composio.dev/');
  
  // Select sign in with GitHub
  const buttonSelector = 'button[title="Get Magic Link"]';
  await page.waitForSelector(buttonSelector, { state: 'visible' });
  await page.click(buttonSelector);
  
  // Login to GitHub
  await page.getByLabel('Username or email address').fill(process.env.GITHUB_USERNAME);
  await page.getByLabel('Password').fill(process.env.GITHUB_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Check for the "Authorize composio-dev" button and click it if it appears (sometime it appears)
  const authorizeButtonSelector = 'button.js-oauth-authorize-btn:has-text("Authorize composio-dev")';
  const authorizeButton = await page.waitForSelector(authorizeButtonSelector, { state: 'visible', timeout: 5000 }).catch(() => null);
  if (authorizeButton) {
    await page.click(authorizeButtonSelector);
  }

  // Navigate to connected accounts
  const connectedAccountsButtonSelector = 'text="Connected accounts"';
  await page.waitForSelector(connectedAccountsButtonSelector, { state: 'visible' });
  await page.click(connectedAccountsButtonSelector);

  // Click on the GitHub integration
  const openButtonSelector = 'div:has-text("Github") button:has-text("Open")';
  await page.waitForSelector(openButtonSelector, { state: 'visible' });
  await page.click(openButtonSelector);

  // Click on the "Execute actions" button
  const executeActionsButtonSelector = 'button:has-text("Execute actions")';
  await page.waitForSelector(executeActionsButtonSelector, { state: 'visible' });
  await page.click(executeActionsButtonSelector);

  // Wait for the success message to be visible, so it doesn't say 'error' or something
  const successMessageSelector = 'div.grid.gap-1 div.text-sm.font-semibold:has-text("Success")';
  await page.waitForSelector(successMessageSelector, { state: 'visible' });
  const successMessageText = await page.textContent(successMessageSelector);
  expect(successMessageText).toContain("Success");

  await page.close();
});