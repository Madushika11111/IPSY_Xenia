import { defineConfig } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  globalSetup:  './global-setup.ts',

  testDir:       './tests',
  // 120s started clipping the heavier multi-step flows (manual ruleset/rule
  // builders, multi-channel campaigns) once combined with assertRowStatus's own
  // 90s poll budget against this space's 300+ campaigns — confirmed live (found
  // running the suite from VS Code): the whole test hit this global cap mid-poll
  // rather than assertRowStatus's own timeout producing a clear error.
  timeout:       180000,
  expect:        { timeout: 5000 },
  fullyParallel: false,
  // Specs share backend campaign data and use order-dependent shared pages —
  // never run more than one spec file at a time
  workers:       1,
  retries:       1,

  reporter: [
    
    ['list'],
    ['html',  { outputFolder: 'reports/html',  open: 'on-failure' }],
    ['json',  { outputFile:  'reports/results.json' }],
    ['junit', { outputFile:  'reports/results.xml'  }],
  ],

  use: {
    baseURL:    'https://be.contentful.com',
    headless:   process.env.HEADLESS === 'true',
    // Bounds every action (click/fill/etc.) so a stuck locator fails fast with its
    // own clear error instead of silently retrying until the whole test's 120s
    // timeout is exhausted (confirmed live: an unguarded click masked the real
    // failure point behind a bare "Test timeout of 120000ms exceeded"). 30s (not
    // 15s) — this QA space's campaign lists have grown large from repeated test
    // runs (280+ Personalization campaigns), and 15s started clipping genuinely
    // slow-but-successful interactions (nav link clicks, list filters) rather
    // than only catching truly stuck ones.
    actionTimeout: 30000,
    // --start-maximized has no effect in headless mode (no display); use an explicit
    // 1920×1080 viewport so Contentful's responsive nav bar renders fully (not collapsed).
    viewport:   process.env.HEADLESS === 'true' ? { width: 1920, height: 1080 } : null,
    launchOptions: {
      args:   process.env.HEADLESS === 'true' ? [] : ['--start-maximized'],
      // slowMo is only useful when a human is watching — skip it in headless / CI runs
      slowMo: process.env.HEADLESS === 'true' ? 0 : 500,
    },
    screenshot: 'only-on-failure',
    video:      'off',
    trace:      'off',
  },

  projects: [
    {
      name: 'chrome',
      use:  {
        channel:  'chrome',
        viewport: process.env.HEADLESS === 'true' ? { width: 1920, height: 1080 } : null,
      },
    },
  ],
});
