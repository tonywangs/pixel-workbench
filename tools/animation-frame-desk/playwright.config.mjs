import { defineConfig } from '@playwright/test';
process.env.PLAYWRIGHT_BROWSERS_PATH ||= 'node_modules/.cache/ms-playwright';
export default defineConfig({ testDir: './tests', testMatch: '**/*.spec.mjs', workers: 1, timeout: 90000, use: { baseURL: 'http://127.0.0.1:4317', viewport: { width: 1440, height: 1000 }, headless: true }, webServer: { command: 'node server.mjs', url: 'http://127.0.0.1:4317/api/health', reuseExistingServer: true }, reporter: 'list' });
