import { chromium } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { selectOrgInChooserIfPresent } from './utils/helpers';

dotenv.config();

const AUTH_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

async function globalSetup() {
  const authDir  = path.join(process.cwd(), 'auth');
  const authFile = path.join(authDir, 'user.json');

  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Reuse existing auth state if it is less than 8 hours old
  if (fs.existsSync(authFile)) {
    const ageMins = Math.round((Date.now() - fs.statSync(authFile).mtimeMs) / 60000);
    if (Date.now() - fs.statSync(authFile).mtimeMs < AUTH_MAX_AGE_MS) {
      console.log(`\n✔  Global setup: reusing auth/user.json (${ageMins} min old)\n`);
      return;
    }
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page    = await context.newPage();

  console.log('\n⏳  Global setup: logging in once...');

  await page.goto('https://be.contentful.com/login');
  await page.locator('[data-test-id="email-input"]').waitFor({ state: 'visible' });
  await page.locator('[data-test-id="email-input"]').fill(process.env.CONTENTFUL_EMAIL ?? '');
  await page.locator('[data-test-id="password-input"]').fill(process.env.CONTENTFUL_PASSWORD ?? '');
  await page.locator('[data-test-id="login-button"]').click();

  // Confirmed live: the org chooser's appearance/disappearance can race a
  // single attempt here — it can flash briefly then auto-navigate away on its
  // own (to a bare app.contentful.com root, not /spaces/ yet) before this
  // function's own internal checks finish, throwing instead of returning
  // false. Swallow failures and retry a few times rather than letting one bad
  // timing window crash the whole login — the final waitForURL below is the
  // real arbiter of success either way.
  for (let attempt = 0; attempt < 3; attempt++) {
    await selectOrgInChooserIfPresent(page).catch(() => {});
    if (/\/spaces\//.test(page.url())) break;
    await page.waitForTimeout(1000);
  }

  await page.waitForURL(/app\.contentful\.com\/spaces/, { timeout: 60000 });

  // Save cookies + localStorage so authenticated tests skip the login form
  await context.storageState({ path: authFile });
  await browser.close();

  console.log('✔  Global setup: auth state saved → auth/user.json\n');
}

export default globalSetup;
