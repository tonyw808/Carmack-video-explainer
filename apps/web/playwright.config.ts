import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// Self-contained e2e: a dedicated SQLite DB (reset+seeded in global-setup) and a full
// web+worker stack started on a non-default port so it never collides with a running dev
// server. Uses the preinstalled Chromium (never downloads).
const PORT = 3210;
const repoRoot = path.resolve(import.meta.dirname, '../..');
const E2E_DB = 'file:' + path.join(repoRoot, '.data/e2e.db');
const CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { executablePath: CHROMIUM, args: ['--no-sandbox'] },
      },
    },
  ],
  webServer: {
    command: 'node ../../scripts/e2e-boot.mjs',
    url: `http://localhost:${PORT}`,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      PORT: String(PORT),
      DATABASE_URL: E2E_DB,
      AUTH_URL: `http://localhost:${PORT}`,
      APP_URL: `http://localhost:${PORT}`,
      AUTH_SECRET: 'e2e-secret',
      AUTH_DEV_MAGIC_LINK: '1',
      QUEUE_DRIVER: 'db',
      STORAGE_DRIVER: 'local',
      VIDEO_PROVIDER: 'mock',
      MOCK_MIN_MS: '400',
      MOCK_MAX_MS: '900',
      MOCK_FAILURE_RATE: '0',
      WORKER_CONCURRENCY: '2',
      DEV_FAKE_CHECKOUT: '1',
      STRIPE_WEBHOOK_SECRET: 'whsec_e2e_fixture',
      ADMIN_EMAILS: '',
    },
  },
});
