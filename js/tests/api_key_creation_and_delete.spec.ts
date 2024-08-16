import { test, expect } from '@playwright/test';

test.use({ storageState: 'tests/auth_state/storageState.json' });

test('another test', async ({ page }) => {
  await page.goto('https://app.composio.dev/settings');

  const buttonSelector = 'div.flex.w-full.items-start.justify-between button:has-text("Add")';
  await page.waitForSelector(buttonSelector, { state: 'visible' });
  await page.click(buttonSelector);

  const apiInputSelector = 'div.flex.gap-4 div.relative.w-full input[placeholder="API key name (optional)"]';
  await page.waitForSelector(apiInputSelector, { state: 'visible' });
  await page.fill(apiInputSelector, 'this_is_the_playwright_testing_key_remove');

  const apiButtonSelector = 'div.flex.gap-4 button:has-text("Add")';
  await page.waitForSelector(apiButtonSelector, { state: 'visible' });
  await page.click(apiButtonSelector);

  const successModalSelector = 'div.grid.gap-1 div.text-sm.font-semibold:has-text("Success")';
  await page.waitForSelector(successModalSelector, { state: 'visible' });
  const successText = await page.textContent(successModalSelector);
  expect(successText).toContain("Success");
  
  const apiKeySelector = 'div:has-text("this_is_the_playwright_testing_key_remove") ~ div.flex.justify-end svg.lucide.lucide-delete';
  await page.waitForSelector(apiKeySelector, { state: 'visible' });
  await page.click(apiKeySelector);

  const deletionSuccessModalSelector = 'div.grid.gap-1 div.text-sm.opacity-90:has-text("API key deleted successfully")';
  await page.waitForSelector(deletionSuccessModalSelector, { state: 'visible' });
  const deletionSuccessText = await page.textContent(deletionSuccessModalSelector);
  expect(deletionSuccessText).toContain("API key deleted successfully");

  await page.close();
});