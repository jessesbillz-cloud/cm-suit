import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  retries: process.env['CI'] ? 1 : 0,
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['iPhone 14'] } },
  ],
  ...(process.env['E2E_BASE_URL']
    ? {}
    : { webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true } }),
});
