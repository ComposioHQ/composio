import { defineConfig } from '@playwright/test';

export default defineConfig({
  timeout: 5 * 60 * 1000,
  reporter: [['html', { open: 'never' }]],
  use: {
    // All requests we send go to this API endpoint.
    baseURL: process.env.COMPOSIO_BASE_URL ||"https://backend.composio.dev",
    launchOptions: {
      args: ['--disable-web-security']
    },
    headless: true,
    actionTimeout: 5 * 60 * 1000,

    extraHTTPHeaders: {
      // We set this header per GitHub guidelines.
      'Accept': 'application/vnd.github.v3+json',
      // Add authorization token to all requests.
      // Assuming personal access token available in the environment.
      'Authorization': `token ${process.env.API_TOKEN}`,
    },
  }
});