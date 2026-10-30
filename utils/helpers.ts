import { Page, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export async function takeScreenshot(page: Page, name: string) {
  await page.screenshot({ path: `reports/screenshots/${name}-${Date.now()}.png`, fullPage: true });
}

export function getEnvVar(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Environment variable "${key}" is not set. Check your .env file.`);
  return value;
}

/** Loads and parses a JSON test-data file from the project's data/ folder, e.g. loadTestData<PersonalizationTestData>('personalization.json'). */
export function loadTestData<T>(fileName: string): T {
  const filePath = path.join(process.cwd(), 'data', fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Test data file not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

// The Contentful test account belongs to multiple organizations, so a login (or
// even a freshly-saved storageState replayed into a brand new browser context —
// confirmed live: the org choice isn't captured by cookies/localStorage the way
// storageState() expects) can land on the "Welcome back — Choose an organization"
// chooser instead of the requested space.
//
// Confirmed live via the captured accessibility snapshot: each org row is a
// plain clickable <div> (NOT a link or button role) containing a level-3
// heading with the org's name — so role="link"/"button" locators never match
// any row and silently report "chooser not present" even when it is. The list
// is also truncated behind a "Show N more" button (a real expand toggle, not
// virtualized scrolling) when the target org isn't in the first page of rows.
// Returns true if the chooser was present and handled, false if it never
// appeared (nothing to do).
//
// orgNamePattern is a regex, not a plain string — the exact spelling/spacing of
// this org's display name has been inconsistent across observations ("Xenia
// version 1" vs "Xenia_version1"), so this matches loosely on "xenia" +
// "version" + "1" tolerating spaces/underscores/hyphens/case between them,
// rather than requiring one exact literal string.
export async function selectOrgInChooserIfPresent(
  page: Page,
  orgNamePattern: RegExp = /xenia[\s_-]*version[\s_-]*1/i
): Promise<boolean> {
  const chooserHeading = page.getByRole('heading', { name: 'Welcome back' });
  if (!(await chooserHeading.isVisible({ timeout: 3000 }).catch(() => false))) {
    return false;
  }

  const orgHeading = page.getByRole('heading', { name: orgNamePattern, level: 3 });

  // Expand the truncated list if the target org isn't in the initially
  // rendered rows.
  if (!(await orgHeading.isVisible({ timeout: 2000 }).catch(() => false))) {
    const showMore = page.getByRole('button', { name: /Show \d+ more/ });
    if (await showMore.isVisible({ timeout: 3000 }).catch(() => false)) {
      await showMore.click();
    }
  }

  await expect(orgHeading).toBeVisible({ timeout: 8000 });
  await orgHeading.click();
  return true;
}
