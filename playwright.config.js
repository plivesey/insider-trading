import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/playwright',
  timeout: 30000,
  use: {
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Disable caching to ensure we load fresh JavaScript files
    launchOptions: {
      args: [
        '--disable-cache',
        '--disable-application-cache',
        '--disable-offline-load-stale-cache',
        '--disk-cache-size=0',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
