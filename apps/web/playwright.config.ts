import { defineConfig, devices } from '@playwright/test';

// Runs against built apps: `pnpm build` first. Needs a migrated, seeded database.
const env = {
  APP_DATABASE_URL: process.env.APP_DATABASE_URL ?? 'postgresql://cafm_app:cafm_app@localhost:5432/cafm_dev',
  DEMO_MODE: 'true',
  API_PORT: '4000',
  API_URL: 'http://localhost:4000',
  WEB_ORIGIN: 'http://localhost:3000',
};

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: 'http://localhost:3000', trace: 'off' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'node ../api/dist/main.js',
      url: 'http://localhost:4000/api/health',
      env,
      reuseExistingServer: !process.env.CI,
    },
    { command: 'pnpm start', url: 'http://localhost:3000/login', env, reuseExistingServer: !process.env.CI },
  ],
});
