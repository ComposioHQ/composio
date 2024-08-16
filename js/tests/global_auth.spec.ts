const { chromium } = require('@playwright/test');

module.exports = async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://app.composio.dev/');
  
  // Select sign in with GitHub
  const buttonSelector = 'button[title="Get Magic Link"]';
  await page.waitForSelector(buttonSelector, { state: 'visible' });
  await page.click(buttonSelector);
  
  // Login to GitHub
  await page.getByLabel('Username or email address').fill(process.env.GITHUB_USERNAME);
  await page.getByLabel('Password').fill(process.env.GITHUB_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Check for the "Authorize composio-dev" button and click it if it appears (sometimes it appears)
  const authorizeButtonSelector = 'button.js-oauth-authorize-btn:has-text("Authorize composio-dev")';
  const authorizeButton = await page.waitForSelector(authorizeButtonSelector, { state: 'visible', timeout: 5000 }).catch(() => null);
  if (authorizeButton) {
    await page.click(authorizeButtonSelector);
  }

  // Save the storage state
  await context.storageState({ path: './tests/auth_state/storageState.json' });

  await browser.close();
};