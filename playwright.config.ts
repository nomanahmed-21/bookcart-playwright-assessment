import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';

// Credentials come from .env locally; CI passes them as real environment variables
if (fs.existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
    testDir: 'tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    timeout: 60 * 1000,
    expect: { timeout: 10000 },
    // html = technical report; plainReporter = one-page summary for non-technical readers (plain-report/)
    reporter: [['list'], ['html', { open: 'never' }], ['./reporters/plainReporter.ts']],
    use: {
        ...devices['Desktop Chrome'],
        baseURL: 'https://bookcart.azurewebsites.net',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        { name: 'parallel', grepInvert: /@account/ },
        // Only one real account exists (registration does not persist), so tests that touch its cart run one at a time
        { name: 'account', grep: /@account/, workers: 1 },
    ],
});
