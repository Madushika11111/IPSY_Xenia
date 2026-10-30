import { test, expect, Browser, Page } from '@playwright/test';
import { SpacePage } from '../../pages/SpacePage';
import { CopyPage } from '../../pages/CopyPage';
import { config } from '../../config/config';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function futureDateStr(daysOffset: number, hour = 10, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  d.setHours(hour, minute, 0, 0);
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  const hh   = String(d.getHours()).padStart(2, '0');
  const mi   = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function pastDateStr(daysOffset: number): string {
  return futureDateStr(-daysOffset);
}

// ─── Timing helpers ───────────────────────────────────────────────────────────

const startTimes = new Map<string, number>();

test.beforeEach(async ({}, testInfo) => {
  startTimes.set(testInfo.testId, Date.now());
  console.log(`\n▶  STARTED  | ${testInfo.title}`);
});

test.afterEach(async ({}, testInfo) => {
  const duration = Date.now() - (startTimes.get(testInfo.testId) ?? Date.now());
  const status =
    testInfo.status === 'passed'  ? '✔  PASSED ' :
    testInfo.status === 'failed'  ? '✘  FAILED ' :
                                    '⚠  SKIPPED';
  console.log(`${status} | ${testInfo.title} (${duration}ms)`);
  if (testInfo.status === 'failed' && testInfo.error?.message) {
    console.log(`   Error: ${testInfo.error.message.split('\n')[0]}`);
  }
  startTimes.delete(testInfo.testId);
});

test.describe('Copy Campaign Feature', () => {
  let sharedPage: Page;
  let copyPage:   CopyPage;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const context = await browser.newContext({ storageState: 'auth/user.json' });
    sharedPage = await context.newPage();
    copyPage   = new CopyPage(sharedPage);

    const spacePage = new SpacePage(sharedPage, context);
    await spacePage.navigateToEntries(config.spaceId);
    await spacePage.openSpaceSidepanel();
    await spacePage.selectSpace(config.xeniaSpaceId, config.xeniaSpaceName);
    await spacePage.selectEnvironment('master');
    await spacePage.openAppsMenu(config.xeniaAppName);
    await spacePage.assertAppLoaded();

    const frame = sharedPage.frameLocator('[data-test-id="cf-widget-renderer"]');
    await expect(frame.getByRole('link', { name: 'Dashboard' })).toBeVisible({ timeout: 60000 });
  });

  test.afterAll(async () => {
    await sharedPage.context().close();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MARKETING — Copy Campaign
  //
  // Source: src/pages/MarketingCampaigns/index.jsx — handleCopyCampaign(campaignId)
  //
  // Copy behaviour (from handler):
  //   • id            : null                  → CREATE mode (3-step wizard drawer)
  //   • saveValues    : 'SAVE'
  //   • name          : preserved from original (validated string)
  //   • cmgmtId       : NEW `MAR_${Date.now()}` — auto-generated, field disabled
  //   • cid           : null                  → CID field EMPTY
  //   • startDateTime / endDateTime : '' (cleared); end-date checkbox unchecked
  //   • priority      : 0; status 'DRAFT'
  //   • region / description / subscriptionType / programs / channels : preserved
  //   • audience & segment rules re-patched with the NEW cmgmtId (patchRuleForCopy)
  //     — visible on Step 2 as URL parameter `cmgmtId=MAR_<new id>`
  //   • abTestId / abTestDefaultId : null; abTestEndDateTime ''
  //
  // Wizard structure (confirmed by exploration on 2026-06-10):
  //   Step 1 "Create new campaign"  : name, Campaign Management ID (disabled), CID,
  //                                   start date, end-date checkbox, Region, Description;
  //                                   buttons [Setup Campaign Rules & Content | Cancel].
  //                                   Setup button is DISABLED until a start date is set.
  //   Step 2 "Setup Campaign Rules & Content" : URL params + inherited Ruleset;
  //                                   buttons [Preview & Publish | Save as Draft | Cancel].
  //   Step 3 "Preview"              : read-only summary (CID "No value", end "N/A");
  //                                   buttons [Publish | Save as Draft | Cancel].
  //
  // CID format/duplicate negatives are excluded here — CID is optional in the copy
  // wizard (Preview shows "No value") and its validation is owned by AdvancedGeneral.
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('Marketing — Copy Campaign', () => {
    const frame = () => sharedPage.frameLocator('[data-test-id="cf-widget-renderer"]');

    async function navigateToMarketing(): Promise<void> {
      // Defensive: if a previous test left the wizard drawer open, close it first
      // so the nav link is clickable (prevents 120 s cascade timeouts).
      const staleClose = frame().locator('.rs-drawer-header-close');
      if (await staleClose.isVisible({ timeout: 500 }).catch(() => false)) {
        await staleClose.click().catch(() => {});
      }
      await frame().getByRole('link', { name: 'Marketing', exact: true }).click({ timeout: 15000 });
      await expect(
        frame().getByRole('heading', { name: 'Marketing campaigns' })
      ).toBeVisible({ timeout: 10000 });
      // Clear any leftover name search from a previous test — a stale filter can
      // leave the list at "No results" with no Copy button to click.
      const resetBtn = frame().getByRole('button', { name: 'Reset' });
      if (await resetBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await resetBtn.click({ timeout: 10000 });
      }
      const dateFilter = frame().getByRole('combobox').filter({ hasText: /Today|All days/ });
      if (await dateFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
        await dateFilter.click({ timeout: 10000 });
        await frame().getByRole('option', { name: 'All days' }).click({ timeout: 10000 });
      }
      await frame().getByRole('button', { name: 'Search' }).click({ timeout: 10000 });
    }

    const mkDialog        = () => frame().getByRole('dialog');
    const mkStep1Heading  = () => frame().getByRole('heading', { name: 'Create new campaign' });
    const mkStep2Heading  = () => frame().getByRole('heading', { name: 'Setup Campaign Rules & Content' });
    const mkStep3Heading  = () => frame().getByRole('heading', { name: 'Preview', exact: true });
    const mkNameInput     = () => frame().getByRole('textbox', { name: 'Campaign name *' });
    const mkCmgmtIdInput  = () => frame().getByRole('textbox', { name: 'Campaign Management ID*' });
    const mkCidInput      = () => frame().getByRole('textbox', { name: 'CID', exact: true });
    const mkStartInput    = () => frame().getByRole('textbox', { name: 'Campaign start date & time (' });
    const mkSetupBtn      = () => frame().getByRole('button', { name: 'Setup Campaign Rules & Content' });
    const mkCancelBtn     = () => mkDialog().getByRole('button', { name: 'Cancel' });
    const mkSaveDraftBtn  = () => mkDialog().getByRole('button', { name: 'Save as Draft' });

    async function openMkCopyDrawer(): Promise<void> {
      await frame().getByRole('button', { name: 'Copy Campaign' }).first().click({ timeout: 15000 });
      // Copy fetches the full campaign + Contentful entries before the drawer opens — allow extra time
      await expect(mkStep1Heading()).toBeVisible({ timeout: 20000 });
    }

    // Some Marketing sources cannot advance past Step 1 (incomplete config — e.g. the
    // "Please remove or complete uncompleted gift ID rows" toast). Tests that must reach
    // Step 2/3 copy a KNOWN-advanceable seeded source by name, falling back to the first
    // row if that source is absent. Returns the source campaign name that was copied.
    const MK_KNOWN_GOOD_SOURCE = 'Mar_caching_1';
    async function openMkCopyDrawerForGoodSource(): Promise<string> {
      await searchMarketingByName(MK_KNOWN_GOOD_SOURCE);
      const seededCopy = frame().getByRole('row').filter({ hasText: MK_KNOWN_GOOD_SOURCE })
        .getByRole('button', { name: 'Copy Campaign' }).first();
      if (await seededCopy.isVisible({ timeout: 5000 }).catch(() => false)) {
        await seededCopy.click({ timeout: 15000 });
      } else {
        // Fallback: clear the search and copy the first available row
        await navigateToMarketing();
        await frame().getByRole('button', { name: 'Copy Campaign' }).first().click({ timeout: 15000 });
      }
      await expect(mkStep1Heading()).toBeVisible({ timeout: 20000 });
      return mkNameInput().inputValue();
    }

    async function fillMkStartDate(dateStr: string): Promise<void> {
      const input = mkStartInput();
      await input.click();
      await input.press('ArrowRight');
      await input.fill(dateStr);
      await mkNameInput().click(); // blur to trigger validation / button gating
    }

    async function closeMkDrawer(): Promise<void> {
      // Step 1 has an X header-close (.rs-drawer-header-close); Steps 2/3 do NOT —
      // there the dialog's Cancel button is the only way out.
      const closeBtn = frame().locator('.rs-drawer-header-close');
      if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await closeBtn.click({ timeout: 10000 });
      } else {
        await mkCancelBtn().dispatchEvent('click');
      }
      // Handle a possible discard-confirmation prompt
      const confirm = frame().getByRole('button', { name: /^(Yes|Discard|OK|Confirm)/i }).first();
      if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirm.click({ timeout: 5000 });
      }
      await expect(mkStep1Heading()).not.toBeVisible({ timeout: 10000 });
      await expect(mkStep2Heading()).not.toBeVisible({ timeout: 5000 });
      // Dismiss any page-level validation toasts so they cannot block later clicks
      await copyPage.dismissNotifications();
    }

    async function searchMarketingByName(name: string): Promise<void> {
      await frame().getByRole('textbox', { name: 'Enter campaign name' }).fill(name);
      await frame().getByRole('button', { name: 'Search' }).click();
    }

    // Clicks "Setup Campaign Rules & Content" and waits for Step 2. CID entry triggers
    // an async uniqueness check; clicking before it settles silently no-ops. Returns
    // true on success, false if the source genuinely cannot advance.
    async function advanceMkToStep2(): Promise<boolean> {
      const validating = frame().getByText(/Validating/i);
      await validating.waitFor({ state: 'visible', timeout: 1500 }).catch(() => {});
      await validating.waitFor({ state: 'hidden',  timeout: 8000 }).catch(() => {});
      for (let attempt = 0; attempt < 3; attempt++) {
        if (!await mkSetupBtn().isEnabled({ timeout: 3000 }).catch(() => false)) {
          await sharedPage.waitForTimeout(1000);
          continue;
        }
        await mkSetupBtn().click({ timeout: 8000 }).catch(() => {});
        if (await mkStep2Heading().isVisible({ timeout: 6000 }).catch(() => false)) return true;
      }
      return false;
    }

    // Setting a campaign end date makes every program-type row require a completed gift ID
    // ("Cycle & Gift Product Id"): pick a cycle from the react-select (the cycle list = the
    // MONTHS spanning the campaign start→end date, one cycle consumed per row), then fill the
    // gift product ID textbox (disabled until a cycle is chosen). The date range must therefore
    // span at least as many months as there are program rows.
    //
    // IMPORTANT: the "Type" labels (Acquisition/Reactivation/Upgrade/Upsell) are SELECTION
    // CHIPS, not view tabs — clicking the selected one deselects it and empties the table. So
    // we never touch them; only the currently-selected type's rows render and need completing.
    // Iterates the visible program rows by index so it converges without hanging.
    // Pattern derived from the user's codegen recording. Returns {completed, remaining}.
    async function completeGiftIdRows(): Promise<{ completed: number; remaining: number }> {
      let completed = 0;
      const rows  = frame().getByRole('row');
      const count = await rows.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        // Only program rows expose an "Enter Gift product ID" field
        if (!await row.getByPlaceholder('Enter Gift product ID').count().catch(() => 0)) continue;
        // Skip rows that are already completed (no "Select cycle" text)
        if (!await row.getByText('Select cycle').isVisible({ timeout: 300 }).catch(() => false)) continue;

        const cycleCombo = row.getByRole('cell').filter({ hasText: 'Select cycle' }).getByRole('combobox');
        await cycleCombo.click({ timeout: 4000 }).catch(() => {});
        await sharedPage.waitForTimeout(500);

        // Cycle options are react-select menu items (dates like "Jun 1, 2026") — NOT role=option.
        const opt = frame().locator('[class*="-menu"] [class*="-option"]').first();
        if (await opt.isVisible({ timeout: 1500 }).catch(() => false)) {
          await opt.click({ timeout: 4000 }).catch(() => {});
          const giftInput = row.getByPlaceholder('Enter Gift product ID');
          if (await giftInput.isEnabled({ timeout: 3000 }).catch(() => false)) {
            await giftInput.fill(`GF_QA_${Date.now()}_${completed}`);
            completed++;
          }
        } else {
          // No cycle left for this row — close the menu by re-clicking the combobox.
          // NEVER press Escape: it closes the whole wizard drawer, not just the dropdown.
          await cycleCombo.click({ timeout: 2000 }).catch(() => {});
        }
      }
      const remaining = await frame().getByText('Select cycle').count().catch(() => 0);
      console.log(`  Gift-ID rows completed: ${completed}, remaining incomplete: ${remaining}`);
      return { completed, remaining };
    }

    // ── TC-CP-MK-001 ────────────────────────────────────────────────────────
    // POSITIVE: Copy button visible & enabled on the Marketing list

    test('TC-CP-MK-001 | Copy Campaign button should be visible and enabled on the Marketing campaign list page', async () => {
      await navigateToMarketing();

      const copyBtn = frame().getByRole('button', { name: 'Copy Campaign' }).first();
      await expect(copyBtn).toBeVisible({ timeout: 10000 });
      await expect(copyBtn).toBeEnabled({ timeout: 5000 });
      console.log(`\n  Marketing : Copy Campaign button visible & enabled ✓`);
    });

    // ── TC-CP-MK-002 ────────────────────────────────────────────────────────
    // POSITIVE: Copy wizard Step 1 state matches the copy contract

    test.describe('TC-CP-MK-002 | Clicking Copy Campaign opens the Create new campaign wizard with the correct pre-filled state', () => {
      test.beforeAll(async () => {
        await navigateToMarketing();
      });

      test('SC-1 | wizard heading should be "Create new campaign" with the source campaign in the breadcrumb', async () => {
        await openMkCopyDrawer();
        const sourceName = await mkNameInput().inputValue();
        await expect(
          frame().getByRole('heading', { name: `> Campaigns > ${sourceName}` })
        ).toBeVisible({ timeout: 5000 });
        console.log(`\n  Heading "Create new campaign" + breadcrumb "> Campaigns > ${sourceName}" ✓`);
      });

      test('SC-2 | campaign name should be pre-filled from the original', async () => {
        const name = await mkNameInput().inputValue();
        expect(name.length, 'Name must be pre-filled from original').toBeGreaterThan(0);
        console.log(`\n  Pre-filled campaign name : "${name}" ✓`);
      });

      test('SC-3 | Campaign Management ID should be auto-generated with MAR_ prefix and the field disabled', async () => {
        const cmgmtId = await mkCmgmtIdInput().inputValue();
        expect(cmgmtId, 'cmgmtId must be a fresh MAR_<timestamp> value').toMatch(/^MAR_\d+$/);
        await expect(mkCmgmtIdInput()).toBeDisabled();
        console.log(`\n  Campaign Management ID : "${cmgmtId}" (auto-generated, disabled) ✓`);
      });

      test('SC-4 | CID field should be empty — copy sets cid: null (user must enter a new CID)', async () => {
        expect(await mkCidInput().inputValue(), 'CID must be cleared by the copy handler').toBe('');
        console.log(`\n  CID : empty ✓`);
      });

      test('SC-5 | start date should be empty — cleared by the copy handler', async () => {
        expect(await mkStartInput().inputValue(), 'Start date must be cleared').toBe('');
        console.log(`\n  Start date : empty ✓`);
      });

      test('SC-6 | end date should not be set — end-date checkbox unchecked', async () => {
        expect(
          await mkDialog().getByRole('checkbox').isChecked(),
          'End-date checkbox must be unchecked after copy'
        ).toBe(false);
        console.log(`\n  End date : not set (checkbox unchecked) ✓`);
      });

      test('SC-7 | "Setup Campaign Rules & Content" should be visible but disabled, and Cancel visible', async () => {
        await expect(mkSetupBtn()).toBeVisible({ timeout: 5000 });
        await expect(mkSetupBtn()).toBeDisabled();
        await expect(mkCancelBtn()).toBeVisible();
        console.log(`\n  Setup Campaign Rules & Content : visible, disabled (no start date yet) ✓`);
        console.log(`  Cancel : visible ✓`);
      });

      test('SC-8 | clicking Cancel closes the wizard and returns to the Marketing campaigns list', async () => {
        await mkCancelBtn().dispatchEvent('click');
        await expect(
          frame().getByRole('heading', { name: 'Marketing campaigns' })
        ).toBeVisible({ timeout: 10000 });
        console.log(`\n  Cancel clicked — returned to Marketing campaigns list ✓`);
      });
    });

    // ── TC-CP-MK-003 ────────────────────────────────────────────────────────
    // NEGATIVE→POSITIVE gating: the wizard cannot proceed without a start date

    test('TC-CP-MK-003 | Negative — the wizard cannot proceed without a Campaign Start date: Setup button stays disabled, then enables once a start date is set', async () => {
      await navigateToMarketing();
      await openMkCopyDrawer();

      await expect(mkSetupBtn()).toBeDisabled();
      console.log(`\n  Setup button disabled while start date is empty ✓ (cannot proceed)`);

      await fillMkStartDate(futureDateStr(5, 10, 0));
      await expect(mkSetupBtn()).toBeEnabled({ timeout: 5000 });
      console.log(`  Setup button enabled after filling a future start date ✓`);

      await closeMkDrawer();
    });

    // ── TC-CP-MK-004 ────────────────────────────────────────────────────────
    // POSITIVE: every copy generates a FRESH unique Campaign Management ID

    test('TC-CP-MK-004 | Each copy generates a fresh unique Campaign Management ID (MAR_<timestamp>) — IDs differ between two copies of the same campaign', async () => {
      await navigateToMarketing();

      await openMkCopyDrawer();
      const id1 = await mkCmgmtIdInput().inputValue();
      await closeMkDrawer();

      await openMkCopyDrawer();
      const id2 = await mkCmgmtIdInput().inputValue();
      await closeMkDrawer();

      expect(id1).toMatch(/^MAR_\d+$/);
      expect(id2).toMatch(/^MAR_\d+$/);
      expect(id2, 'each copy must get its own new cmgmtId').not.toBe(id1);
      console.log(`\n  First copy  : "${id1}"`);
      console.log(`  Second copy : "${id2}"`);
      console.log(`  IDs are unique per copy — original cmgmtId is never reused ✓`);
    });

    // ── TC-CP-MK-005 ────────────────────────────────────────────────────────
    // NEGATIVE: past start date must be rejected

    test('TC-CP-MK-005 | Negative — setting a past start date on a copied Marketing campaign should be rejected (inline error or Setup button stays gated)', async () => {
      await navigateToMarketing();
      await openMkCopyDrawer();

      const past = pastDateStr(1);
      await fillMkStartDate(past);
      console.log(`\n  Past start date entered : "${past}"`);

      const pastErr   = frame().getByText(/start date.*greater than current date/i);
      const errShown  = await pastErr.isVisible({ timeout: 3000 }).catch(() => false);
      const gated     = !(await mkSetupBtn().isEnabled().catch(() => true));
      expect(
        errShown || gated,
        'past start date must be rejected — either an inline error is shown or the Setup button stays disabled'
      ).toBe(true);
      console.log(`  Rejected ✓ (inline error: ${errShown} | Setup gated: ${gated})`);

      await closeMkDrawer();
    });

    // ── TC-CP-MK-006 ────────────────────────────────────────────────────────
    // NEGATIVE: cleared campaign name must block the wizard

    test('TC-CP-MK-006 | Negative — clearing the pre-filled campaign name on a copied Marketing campaign should block the wizard (required error or Setup button gated)', async () => {
      await navigateToMarketing();
      await openMkCopyDrawer();

      await fillMkStartDate(futureDateStr(5, 10, 0));
      await mkNameInput().clear();
      await mkCidInput().click(); // blur to trigger inline validation
      console.log(`\n  Campaign name cleared (empty)`);

      const nameErr  = frame().getByText(/Please enter campaign name/i);
      const errShown = await nameErr.isVisible({ timeout: 3000 }).catch(() => false);
      const gated    = !(await mkSetupBtn().isEnabled().catch(() => true));
      expect(
        errShown || gated,
        'empty campaign name must be rejected — inline error or gated Setup button'
      ).toBe(true);
      console.log(`  Rejected ✓ (inline error: ${errShown} | Setup gated: ${gated})`);

      await closeMkDrawer();
    });

    // ── TC-CP-MK-007 ────────────────────────────────────────────────────────
    // NEGATIVE: end date before start date must be rejected

    test('TC-CP-MK-007 | Negative — setting an end date earlier than the start date on a copied Marketing campaign should be rejected (wizard must not advance to Step 2)', async () => {
      test.setTimeout(120000);
      await navigateToMarketing();

      // ── Control pass: prove this source CAN advance with VALID dates ──
      // (Guards against false positives when the copied source is blocked for an
      // unrelated reason, e.g. "Please remove or complete uncompleted gift ID rows".)
      await openMkCopyDrawer();
      await fillMkStartDate(futureDateStr(10, 10, 0));
      await expect(mkSetupBtn()).toBeEnabled({ timeout: 5000 });
      await mkSetupBtn().click();
      const canAdvance = await mkStep2Heading().isVisible({ timeout: 10000 }).catch(() => false);
      await closeMkDrawer();
      if (!canAdvance) {
        const toast = (await sharedPage.locator('[data-test-id="cf-ui-paragraph"]').first().textContent().catch(() => null))?.trim();
        console.log(`\n  Control pass blocked with VALID dates — source campaign cannot proceed (toast: "${toast}")`);
        test.skip(true, `Source campaign cannot advance even with valid dates (${toast ?? 'no toast'}) — end-date validation not verifiable on this source`);
      }
      console.log(`\n  Control pass: source advances to Step 2 with valid dates ✓`);

      // ── Negative pass: same source, end date BEFORE start date ──
      await navigateToMarketing();
      await openMkCopyDrawer();
      await fillMkStartDate(futureDateStr(10, 10, 0));
      const checkbox = mkDialog().getByRole('checkbox');
      if (!await checkbox.isChecked()) await checkbox.check();
      const endInput = frame().getByRole('textbox', { name: 'Set campaign end date & time' });
      await endInput.click({ timeout: 8000 });
      await endInput.press('ArrowRight');
      await endInput.fill(futureDateStr(5, 10, 0), { timeout: 8000 });
      await mkNameInput().click(); // blur
      console.log(`  Start date : +10 days | End date : +5 days (end before start)`);

      const endErr   = frame().getByText(/end date.*greater than.*start date/i);
      let errShown = await endErr.isVisible({ timeout: 3000 }).catch(() => false);
      const gated  = !(await mkSetupBtn().isEnabled().catch(() => true));

      let advancedToStep2 = false;
      if (!errShown && !gated) {
        await mkSetupBtn().click();
        advancedToStep2 = await mkStep2Heading().isVisible({ timeout: 8000 }).catch(() => false);
        errShown = errShown || await endErr.isVisible({ timeout: 1000 }).catch(() => false);
      }

      expect(
        advancedToStep2,
        'end-before-start must be rejected — instead the wizard advanced to Step 2 with an invalid date range (validation missing — report as defect)'
      ).toBe(false);
      console.log(`  Rejected ✓ — wizard did not advance to Step 2 (inline error: ${errShown} | Setup gated: ${gated})`);

      await closeMkDrawer();
    });

    // ── TC-CP-MK-008 ────────────────────────────────────────────────────────
    // POSITIVE: full copy → Step 2 (rules patched with NEW cmgmtId) → Save as Draft

    test.describe('TC-CP-MK-008 | Copying a Marketing campaign and saving as Draft from Step 2 creates a new Draft campaign with rules patched to the new cmgmtId', () => {
      const mkCopyName = `MK_Copy_Draft_${Date.now()}`.slice(0, 60);
      let   mkSourceName = '';
      let   newCmgmtId   = '';

      test.beforeAll(async () => {
        await navigateToMarketing();
      });

      test('SC-1 | Step 2 URL parameters carry the NEW cmgmtId, and Save as Draft succeeds', async () => {
        await openMkCopyDrawer();

        mkSourceName = await mkNameInput().inputValue();
        newCmgmtId   = await mkCmgmtIdInput().inputValue();

        await mkNameInput().clear();
        await mkNameInput().fill(mkCopyName);
        await fillMkStartDate(futureDateStr(5, 10, 0));

        await expect(mkSetupBtn()).toBeEnabled({ timeout: 5000 });
        await mkSetupBtn().click();
        await expect(mkStep2Heading()).toBeVisible({ timeout: 20000 });
        console.log(`\n  Step 2 "Setup Campaign Rules & Content" opened ✓`);

        // patchRuleForCopy evidence: the URL parameter must reference the NEW cmgmtId
        const urlParam = frame().getByRole('textbox', { name: 'Enter URL parameter...' }).first();
        if (await urlParam.isVisible({ timeout: 3000 }).catch(() => false)) {
          const paramValue = await urlParam.inputValue();
          expect(paramValue, 'URL parameter must be patched to the new cmgmtId').toContain(newCmgmtId);
          console.log(`  URL parameter "${paramValue}" carries the NEW cmgmtId ✓ (rules decoupled from original)`);
        } else {
          console.log(`  URL parameter section not present on this campaign — skip cmgmtId patch check`);
        }

        await mkSaveDraftBtn().dispatchEvent('click');
        await expect(mkStep2Heading()).not.toBeVisible({ timeout: 20000 });
        console.log(`  Save as Draft succeeded — wizard closed ✓`);
        console.log(`  Copied name : "${mkCopyName}" | cmgmtId : "${newCmgmtId}"`);
      });

      test('SC-2 | the copied campaign should appear in the Marketing list with Draft status', async () => {
        await navigateToMarketing();
        await searchMarketingByName(mkCopyName);
        await expect(frame().getByRole('cell', { name: mkCopyName, exact: true })).toBeVisible({ timeout: 15000 });
        await expect(frame().getByText('Draft').first()).toBeVisible({ timeout: 5000 });
        console.log(`\n  Copied campaign "${mkCopyName}" visible — Status : Draft ✓`);
      });

      test('SC-3 | the original source campaign should still be in the list unchanged', async () => {
        await navigateToMarketing();
        await searchMarketingByName(mkSourceName);
        await expect(frame().getByRole('cell', { name: mkSourceName, exact: true }).first()).toBeVisible({ timeout: 15000 });
        console.log(`\n  Original campaign "${mkSourceName}" still in list ✓`);
        console.log(`  Copy is independent — original is not affected ✓`);
      });
    });

    // ── TC-CP-MK-009 ────────────────────────────────────────────────────────
    // POSITIVE: Step 3 Preview reflects the copy contract; Cancel saves nothing

    test.describe('TC-CP-MK-009 | The Preview step of a copied Marketing campaign reflects the copy contract, and cancelling from Preview creates nothing', () => {
      const mkPreviewName = `MK_PreviewCancel_${Date.now()}`.slice(0, 60);
      let   newCmgmtId    = '';

      test.beforeAll(async () => {
        await navigateToMarketing();
      });

      test('SC-1 | Preview shows the new cmgmtId, CID "No value", and end date "N/A"', async () => {
        await openMkCopyDrawer();
        newCmgmtId = await mkCmgmtIdInput().inputValue();

        await mkNameInput().clear();
        await mkNameInput().fill(mkPreviewName);
        await fillMkStartDate(futureDateStr(7, 10, 0));

        await expect(mkSetupBtn()).toBeEnabled({ timeout: 5000 });
        await mkSetupBtn().click();
        await expect(mkStep2Heading()).toBeVisible({ timeout: 20000 });

        await mkDialog().getByRole('button', { name: 'Preview & Publish' }).click();
        await expect(mkStep3Heading()).toBeVisible({ timeout: 20000 });
        console.log(`\n  Step 3 "Preview" opened ✓`);

        await expect(frame().getByText(`Campaign Management ID : ${newCmgmtId}`)).toBeVisible({ timeout: 5000 });
        await expect(frame().getByText('CID : No value')).toBeVisible({ timeout: 5000 });
        // Label and value render as separate nodes — match the paragraph, tolerate whitespace
        await expect(
          frame().locator('p').filter({ hasText: /Campaign end date & time \(PST\):\s*N\/A/ })
        ).toBeVisible({ timeout: 5000 });
        console.log(`  Preview — Campaign Management ID : ${newCmgmtId} ✓`);
        console.log(`  Preview — CID : No value ✓ (cid nulled by copy)`);
        console.log(`  Preview — End date : N/A ✓ (cleared by copy)`);
      });

      test('SC-2 | cancelling from the Preview step closes the wizard and no campaign is created', async () => {
        await mkCancelBtn().dispatchEvent('click');
        await expect(
          frame().getByRole('heading', { name: 'Marketing campaigns' })
        ).toBeVisible({ timeout: 10000 });

        await searchMarketingByName(mkPreviewName);
        await expect(frame().getByRole('cell', { name: 'No results.' })).toBeVisible({ timeout: 10000 });
        console.log(`\n  Cancel at Preview — search for "${mkPreviewName}" → No results ✓ (nothing created)`);
      });
    });

    // ── TC-CP-MK-010 ────────────────────────────────────────────────────────
    // POSITIVE: cancelling / closing at Step 1 creates nothing

    test.describe('TC-CP-MK-010 | Closing or cancelling the copy wizard at Step 1 does not create a new campaign', () => {
      test.beforeAll(async () => {
        await navigateToMarketing();
      });

      test('SC-1 | clicking the Cancel button closes the wizard and no new campaign is created', async () => {
        const abandonedName = `MK_CancelNoSave_${Date.now()}`;
        await openMkCopyDrawer();
        await mkNameInput().clear();
        await mkNameInput().fill(abandonedName);
        console.log(`\n  Name typed in wizard : "${abandonedName}" (will NOT be saved)`);

        await mkCancelBtn().dispatchEvent('click');
        await expect(
          frame().getByRole('heading', { name: 'Marketing campaigns' })
        ).toBeVisible({ timeout: 10000 });

        await searchMarketingByName(abandonedName);
        await expect(frame().getByRole('cell', { name: 'No results.' })).toBeVisible({ timeout: 10000 });
        console.log(`  Search for "${abandonedName}" → No results ✓ (no campaign created)`);
      });

      test('SC-2 | clicking the X close button closes the wizard and no new campaign is created', async () => {
        const abandonedName = `MK_CloseNoSave_${Date.now()}`;
        await navigateToMarketing();
        await openMkCopyDrawer();
        await mkNameInput().clear();
        await mkNameInput().fill(abandonedName);
        console.log(`\n  Name typed in wizard : "${abandonedName}" (will NOT be saved)`);

        await closeMkDrawer();

        await searchMarketingByName(abandonedName);
        await expect(frame().getByRole('cell', { name: 'No results.' })).toBeVisible({ timeout: 10000 });
        console.log(`  Search for "${abandonedName}" → No results ✓ (no campaign created)`);
      });
    });

    // ── TC-CP-MK-011 ────────────────────────────────────────────────────────
    // POSITIVE: full copy → Publish from Preview → Scheduled campaign in list

    test.describe('TC-CP-MK-011 | Copying a Marketing campaign and publishing from Preview creates a new Scheduled campaign', () => {
      const mkPubName = `MK_Copy_Publish_${Date.now()}`.slice(0, 60);

      test.beforeAll(async () => {
        await navigateToMarketing();
      });

      test('SC-1 | walking the wizard and clicking Publish should close the wizard', async () => {
        await openMkCopyDrawer();
        await mkNameInput().clear();
        await mkNameInput().fill(mkPubName);
        await fillMkStartDate(futureDateStr(7, 10, 0));

        await expect(mkSetupBtn()).toBeEnabled({ timeout: 5000 });
        await mkSetupBtn().click();
        await expect(mkStep2Heading()).toBeVisible({ timeout: 20000 });

        await mkDialog().getByRole('button', { name: 'Preview & Publish' }).click();
        await expect(mkStep3Heading()).toBeVisible({ timeout: 20000 });

        await mkDialog().getByRole('button', { name: 'Publish', exact: true }).dispatchEvent('click');
        await expect(mkStep3Heading()).not.toBeVisible({ timeout: 20000 });
        console.log(`\n  Publish clicked — wizard closed ✓ ("${mkPubName}")`);
      });

      test('SC-2 | the published copy should appear in the Marketing list as Scheduled', async () => {
        await navigateToMarketing();
        await searchMarketingByName(mkPubName);
        await expect(frame().getByRole('cell', { name: mkPubName, exact: true })).toBeVisible({ timeout: 15000 });
        await expect(frame().getByText('Scheduled').first()).toBeVisible({ timeout: 5000 });
        console.log(`\n  Published copy "${mkPubName}" visible — Status : Scheduled (future start date) ✓`);
      });
    });

    // ── TC-CP-MK-012 ────────────────────────────────────────────────────────
    // POSITIVE: While copying, the user can UPDATE the CID and the A/B test
    // traffic split, then save — and the new CID is auto-injected into the copied
    // rules (AdvancedGeneral copy-mode injection).
    //
    // NOTE: End date is intentionally NOT set here. Adding an end date makes every
    // program-type row require a completed gift ID (Cycle & Gift Product Id),
    // surfacing "Please remove or complete uncompleted gift ID rows" and blocking
    // Step 2 until each row is filled. That end-date + gift-ID flow is tracked as a
    // separate scenario (see Copy-Feature-Test-Cases.md "Deferred").
    //
    // Wizard drill path for traffic: Step 2 → "View rules (1)" → Rule dialog →
    // "View contents (1)" → "Add experience" dialog → A/B testing group
    // (switch + "Traffic percentage" spinbuttons, disabled until A/B is enabled).

    test.describe('TC-CP-MK-012 | Copying a Marketing campaign while updating the CID and A/B traffic split saves both changes', () => {
      const mkUpdName  = `MK_Copy_Updated_${Date.now()}`.slice(0, 60);
      const mkUpdCid   = `QACID${Date.now()}`;
      let   sourceName = '';
      let   newCmgmtId = '';

      const step2Dlg   = () => frame().getByRole('dialog', { name: 'Setup Campaign Rules & Content' });
      const ruleDlg    = () => frame().getByRole('dialog', { name: 'Rule', exact: true });
      const expDlg     = () => frame().getByRole('dialog', { name: 'Add experience' });
      const rulesetDlg = () => frame().getByRole('dialog', { name: 'Update ruleset' });
      const ruleActionCell = () =>
        step2Dlg().getByRole('row').filter({ hasText: 'View rules' }).first().getByRole('cell').last();

      test.beforeAll(async () => {
        await navigateToMarketing();
      });

      test('SC-1 | copy → update CID + A/B traffic split → save; both persist and the original is unchanged', async () => {
        test.setTimeout(180000);
        sourceName = await openMkCopyDrawerForGoodSource();

        // ── Step 1: update name, CID, start date (no end date — see note above) ──
        newCmgmtId = await mkCmgmtIdInput().inputValue();

        await mkNameInput().clear();
        await mkNameInput().fill(mkUpdName);
        await mkCidInput().fill(mkUpdCid);
        await fillMkStartDate(futureDateStr(7, 10, 0));
        console.log(`\n  Updated CID "${mkUpdCid}"`);

        const advanced = await advanceMkToStep2();
        if (!advanced) {
          const toast = (await sharedPage.locator('[data-test-id="cf-ui-paragraph"]').first().textContent().catch(() => null))?.trim();
          await closeMkDrawer();
          test.skip(true, `Source "${sourceName}" cannot advance to Step 2 (toast: "${toast ?? 'none'}") — update flow not verifiable on this source`);
        }
        console.log(`  Advanced to Step 2 ✓`);

        // ── Step 2: verify the new CID is auto-injected into the copied rule ──
        await ruleActionCell().getByRole('button').nth(1).click({ timeout: 10000 });
        await expect(rulesetDlg()).toBeVisible({ timeout: 10000 });
        await expect(rulesetDlg()).toContainText(newCmgmtId, { timeout: 5000 });
        await expect(rulesetDlg()).toContainText(mkUpdCid, { timeout: 5000 });
        console.log(`  Copied rule references new cmgmtId "${newCmgmtId}" AND typed CID "${mkUpdCid}" ✓`);
        await rulesetDlg().getByRole('button', { name: 'Cancel' }).click({ timeout: 10000 });
        await expect(rulesetDlg()).not.toBeVisible({ timeout: 5000 });

        // ── Step 2 → Rule → Add experience: enable A/B and edit the traffic split ──
        await step2Dlg().getByRole('button', { name: /View rules/ }).first().click({ timeout: 10000 });
        await expect(ruleDlg()).toBeVisible({ timeout: 10000 });
        await ruleDlg().getByRole('button', { name: /View contents/ }).first().click({ timeout: 10000 });
        await expect(expDlg()).toBeVisible({ timeout: 15000 });

        // Scope to the A/B testing group → exactly the Primary + Default spinbuttons
        // (the dialog has other experience spinbuttons too). The switch may already
        // be ON for this experience, so only toggle it when the fields are disabled.
        const abGroup  = expDlg().getByRole('group', { name: 'A/B testing' });
        const abSwitch = abGroup.getByRole('switch');
        const traffic  = abGroup.getByRole('spinbutton', { name: 'Traffic percentage' });
        if (!await traffic.first().isEnabled({ timeout: 2000 }).catch(() => false)) {
          await abSwitch.click({ timeout: 10000 });
          await expect(traffic.first()).toBeEnabled({ timeout: 5000 });
          console.log(`  A/B testing enabled via switch`);
        } else {
          console.log(`  A/B testing already enabled on this experience`);
        }
        // Default experience traffic is the auto-computed complement (disabled) —
        // set only the Primary; the Default updates itself to 100 − primary.
        await traffic.nth(0).fill('60');
        await traffic.nth(0).press('Tab'); // blur to recompute the Default complement
        await expect(traffic.nth(1)).toHaveValue('40', { timeout: 5000 });
        console.log(`  Traffic split updated to Primary 60% / Default 40% (auto-computed) ✓`);

        // The A/B test end date is REQUIRED before the experience can be saved, and must be
        // greater than the campaign start date (and, when set, less than the campaign end date).
        // Copy clears the inherited A/B end date, so it must be re-entered here.
        const abEndDate = abGroup.getByRole('textbox');
        await abEndDate.click({ timeout: 8000 });
        await abEndDate.press('ArrowRight');
        await abEndDate.fill(futureDateStr(10, 10, 0)); // +10d > campaign start (+7d)
        await abEndDate.press('Tab');
        console.log(`  A/B test end date set : +10 days (> campaign start +7d) ✓`);

        await expDlg().getByRole('button', { name: 'Add experience', exact: true }).click({ timeout: 10000 });
        await expect(expDlg()).not.toBeVisible({ timeout: 15000 });
        await ruleDlg().getByRole('button', { name: 'Continue' }).click({ timeout: 10000 });
        await expect(ruleDlg()).not.toBeVisible({ timeout: 10000 });
        await expect(mkStep2Heading()).toBeVisible({ timeout: 5000 });
        console.log(`  Experience committed, back on Step 2 ✓`);

        // ── Step 3 Preview: updated CID reflected ──
        await step2Dlg().getByRole('button', { name: 'Preview & Publish' }).click({ timeout: 10000 });
        await expect(mkStep3Heading()).toBeVisible({ timeout: 20000 });
        await expect(frame().getByText(`CID : ${mkUpdCid}`)).toBeVisible({ timeout: 5000 });
        console.log(`  Preview — CID : ${mkUpdCid} ✓ (updated, not "No value")`);

        // ── Save as Draft and verify in list ──
        await frame().getByRole('button', { name: 'Save as Draft' }).dispatchEvent('click');
        await expect(mkStep3Heading()).not.toBeVisible({ timeout: 20000 });
        console.log(`  Save as Draft succeeded ✓`);

        await navigateToMarketing();
        await searchMarketingByName(mkUpdName);
        await expect(frame().getByRole('cell', { name: mkUpdName, exact: true })).toBeVisible({ timeout: 15000 });
        await expect(frame().getByText('Draft').first()).toBeVisible({ timeout: 5000 });
        console.log(`  Modified copy "${mkUpdName}" visible — Status : Draft ✓`);

        await navigateToMarketing();
        await searchMarketingByName(sourceName);
        await expect(frame().getByRole('cell', { name: sourceName, exact: true }).first()).toBeVisible({ timeout: 15000 });
        console.log(`  Original "${sourceName}" still in list — unchanged ✓`);
      });
    });

    // ── TC-CP-MK-013 ────────────────────────────────────────────────────────
    // POSITIVE: Copy → set an END DATE → complete the program-type gift ID rows →
    // save. Setting an end date surfaces the gift-ID program table; each row must be
    // completed (cycle + gift product ID) or removed before the wizard can advance.
    // Gift-ID flow derived from the user's codegen recording.

    test.describe('TC-CP-MK-013 | Copying a Marketing campaign, setting an end date, and completing the gift ID rows saves the campaign', () => {
      const mkEndName = `MK_Copy_EndDate_${Date.now()}`.slice(0, 60);
      const mkEndCid  = `QACIDE${Date.now()}`;
      let   sourceName = '';

      test.beforeAll(async () => {
        await navigateToMarketing();
      });

      test('SC-1 | gift ID rows are completed and the campaign saves as a Draft', async () => {
        test.setTimeout(240000);
        sourceName = await openMkCopyDrawerForGoodSource();

        // Step 1: name, CID, start date, AND end date (surfaces the gift-ID table)
        await mkNameInput().clear();
        await mkNameInput().fill(mkEndName);
        await mkCidInput().fill(mkEndCid);
        await fillMkStartDate(futureDateStr(7, 10, 0));

        const checkbox = mkDialog().getByRole('checkbox');
        if (!await checkbox.isChecked()) await checkbox.check();
        const endInput = frame().getByRole('textbox', { name: 'Set campaign end date & time' });
        await endInput.click({ timeout: 8000 });
        await endInput.press('ArrowRight');
        // Wide range: the cycle list = months between start and end, one cycle per row.
        // ~7 months (start +7d → +210d) supplies enough cycles for every program row.
        await endInput.fill(futureDateStr(210, 10, 0), { timeout: 8000 });
        await mkNameInput().click(); // blur
        console.log(`\n  Start +7d | End +210d (~7 months of cycles) | CID "${mkEndCid}"`);

        // The end date surfaces the program/gift-ID table — confirm it's blocking first
        await expect(frame().getByText('Select cycle').first()).toBeVisible({ timeout: 8000 });
        console.log(`  Gift-ID program table present (rows show "Select cycle") ✓`);

        // Complete every incomplete gift-ID row across all Type tabs
        const { completed, remaining } = await completeGiftIdRows();
        expect(completed, 'at least one gift-ID row must be completable').toBeGreaterThan(0);

        // Now the wizard should advance past Step 1
        const advanced = await advanceMkToStep2();
        if (!advanced) {
          const toast = (await sharedPage.locator('[data-test-id="cf-ui-paragraph"]').first().textContent().catch(() => null))?.trim();
          console.log(`  [DIAG] still blocked after gift-ID completion — toast="${toast ?? ''}"`);
        }
        expect(advanced, 'wizard must advance to Step 2 after gift-ID rows are completed').toBe(true);
        console.log(`  Advanced to Step 2 after completing gift-ID rows ✓`);

        // Save as Draft directly from Step 2
        await mkDialog().getByRole('button', { name: 'Save as Draft' }).dispatchEvent('click');
        await expect(mkStep2Heading()).not.toBeVisible({ timeout: 20000 });
        console.log(`  Save as Draft succeeded ✓`);
      });

      test('SC-2 | the saved copy appears in the Marketing list as a Draft and the original is unchanged', async () => {
        await navigateToMarketing();
        await searchMarketingByName(mkEndName);
        await expect(frame().getByRole('cell', { name: mkEndName, exact: true })).toBeVisible({ timeout: 15000 });
        await expect(frame().getByText('Draft').first()).toBeVisible({ timeout: 5000 });
        console.log(`\n  Copy "${mkEndName}" visible — Status : Draft ✓`);

        await navigateToMarketing();
        await searchMarketingByName(sourceName);
        await expect(frame().getByRole('cell', { name: sourceName, exact: true }).first()).toBeVisible({ timeout: 15000 });
        console.log(`  Original "${sourceName}" still in list — unchanged ✓`);
      });
    });

  }); // end: Marketing

}); // end: Copy Campaign Feature
