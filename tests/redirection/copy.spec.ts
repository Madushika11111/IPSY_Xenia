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
  // REDIRECTION — Copy Campaign
  //
  // Source: src/pages/RedirectionV2/index.jsx — handleCopyCampaign(campaignId)
  //
  // Copy behaviour (key differences from Gradual Rollout):
  //   • id            : uuidv4()  (new UUID, not null)
  //   • saveValues    : 'SAVE'    → save component creates, does not update
  //   • campaignId    : NOT set   → Campaign ID field is EMPTY (user must fill)
  //   • name          : preserved from original
  //   • startDateTime / endDateTime : '' (cleared)
  //   • priority      : 0 (reset)
  //   • status        : 'Draft'
  //   • channels / audiences / segments : pre-populated from API response
  //   • abTestEnable  : preserved (boolean)
  //   • abTestDefaultId / abTestId per experience : null (cleared)
  //   • abTestEndDateTime : '' (cleared)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('Redirection — Copy Campaign', () => {
    const frame = () => sharedPage.frameLocator('[data-test-id="cf-widget-renderer"]');

    async function navigateToRedirection(): Promise<void> {
      await frame().getByRole('link', { name: 'Redirection', exact: true }).click();
      await expect(
        frame().getByRole('heading', { name: 'Redirection campaigns' })
      ).toBeVisible({ timeout: 10000 });
      const dateFilter = frame().getByRole('combobox').filter({ hasText: /Today|All days/ });
      if (await dateFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
        await dateFilter.click();
        await frame().getByRole('option', { name: 'All days' }).click();
      }
      await frame().getByRole('button', { name: 'Search' }).click();
    }

    async function filterRedirectionByStatus(status: string): Promise<void> {
      const statusButton = frame().getByRole('button', { name: /All statuses|Live|Scheduled|Paused|Draft|Expired/ }).first();
      await statusButton.click();
      await frame().locator('div').filter({ hasText: new RegExp(`^${status}$`) }).first().click();
      await frame().getByRole('button', { name: 'Search' }).click();
    }

    async function getRedirectionResultsCount(): Promise<number> {
      try {
        const el   = frame().getByRole('heading', { name: /Results \(/ });
        await expect(el).toBeVisible({ timeout: 10000 });
        const text = (await el.textContent()) ?? '';
        const m    = text.match(/\((\d+)\)/);
        return m ? parseInt(m[1], 10) : 0;
      } catch {
        return 0;
      }
    }

    async function getCampaignIdFromDetailsModal(): Promise<string> {
      const modal = frame().locator('[data-test-id="cf-ui-modal-content"]');
      await expect(modal).toBeVisible({ timeout: 5000 });
      const raw        = ((await modal.textContent()) ?? '').replace(/\s+/g, ' ').trim();
      const labelStart = raw.indexOf('Campaign ID');
      if (labelStart === -1) return '';
      const valueStart = labelStart + 'Campaign ID'.length;
      const nextStart  = raw.indexOf('Description', valueStart);
      return raw.slice(valueStart, nextStart === -1 ? undefined : nextStart).trim();
    }

    async function closeDetailsModal(): Promise<void> {
      try {
        await frame().getByRole('button').filter({ hasText: '×' }).first().click({ timeout: 3000 });
      } catch {
        await sharedPage.keyboard.press('Escape');
      }
    }

    // ── TC-CP-RD-001 ────────────────────────────────────────────────────────
    // POSITIVE: Copy button visible — verified against the default "All statuses" view.
    // Per-status looping is not used here because the Redirection status dropdown
    // uses div-text matching ambiguous with campaign row badges (same issue as PE-001).

    test('TC-CP-RD-001 | Copy Campaign button should be visible and enabled on the Redirection campaign list page', async () => {
      await navigateToRedirection();

      const copyBtn = frame().getByRole('button', { name: 'Copy Campaign' }).first();
      await expect(copyBtn).toBeVisible({ timeout: 10000 });
      await expect(copyBtn).toBeEnabled({ timeout: 5000 });
      console.log(`\n  Redirection : Copy Campaign button visible & enabled ✓`);
    });

    // ── TC-CP-RD-002 ────────────────────────────────────────────────────────
    // POSITIVE: Copy form state
    // Key: Campaign ID is EMPTY — Redirection copy uses saveValues:'SAVE' and
    //      does NOT set campaignId in setCampaignDetail.

    test.describe('TC-CP-RD-002 | Clicking Copy Campaign on a Redirection campaign opens the Create campaign drawer with the correct pre-filled state', () => {
      test.beforeAll(async () => {
        await navigateToRedirection();
      });

      test('SC-1 | drawer heading should be "Create campaign", not "Update campaign"', async () => {
        await frame().getByRole('button', { name: 'Copy Campaign' }).first().click();
        await copyPage.assertCreateDrawerVisible();
        await copyPage.assertNotUpdateDrawer();
      });

      test('SC-2 | campaign name should be pre-filled from the original', async () => {
        const name = await copyPage.getNameValue();
        expect(name.length, 'Name must be pre-filled from original').toBeGreaterThan(0);
        console.log(`\n  Pre-filled campaign name : "${name}" ✓`);
      });

      test('SC-3 | start date should be empty — Redirection copy clears startDateTime', async () => {
        await copyPage.assertStartDateEmpty();
        console.log(`\n  Start date : empty ✓`);
      });

      test('SC-4 | Campaign ID field should be empty — Redirection copy does not pre-fill it (user must enter a new unique ID)', async () => {
        await copyPage.assertCampaignIdEmpty();
        console.log(`\n  Campaign ID : empty ✓`);
        console.log(`  User must enter a new Campaign ID before saving ✓`);
      });

      test('SC-5 | Save & Activate, Save as Draft, and Cancel buttons should be visible', async () => {
        await copyPage.assertActionButtonsVisible();
        console.log(`\n  Action buttons visible ✓`);
      });

      test('SC-6 | clicking Cancel should return to the Redirection campaigns list', async () => {
        await copyPage.closeDrawer();
        await expect(
          frame().getByRole('heading', { name: 'Redirection campaigns' })
        ).toBeVisible({ timeout: 10000 });
        console.log(`\n  Cancel clicked — returned to Redirection campaigns list ✓`);
      });
    });

    // ── TC-CP-RD-003 ────────────────────────────────────────────────────────
    // POSITIVE: Full copy → Save as Draft → Draft in list

    test.describe('TC-CP-RD-003 | Copying a Redirection campaign and saving as Draft creates a new Draft campaign', () => {
      const copyId   = `CPRD_D_${Date.now()}`;
      const copyName = `RD_Copy_Draft_${Date.now()}`.slice(0, 60);
      let   sourceName    = '';
      let   rd003HasIdField = false;

      test.beforeAll(async () => {
        await navigateToRedirection();
      });

      test('SC-1 | filling name, start date, and a new Campaign ID then saving as Draft should close the drawer', async () => {
        await frame().getByRole('button', { name: 'Copy Campaign' }).first().click();
        await copyPage.assertCreateDrawerVisible();

        // Capture the pre-filled name (= original source campaign) before overwriting
        sourceName = await copyPage.getNameValue();

        await copyPage.fillName(copyName);
        await copyPage.fillStartDate(futureDateStr(5, 10, 0));
        rd003HasIdField = await copyPage.clearAndFillCampaignId(copyId);
        if (!rd003HasIdField) {
          await copyPage.closeDrawer();
          test.skip(true, 'Campaign ID field absent in RD copy form — skipping Draft save with Campaign ID');
        }

        console.log(`\n  Copied name    : "${copyName}"`);
        console.log(`  Campaign ID    : "${copyId}"`);
        console.log(`  Source         : "${sourceName}"`);

        await copyPage.clickSaveDraft();
        await copyPage.assertSaveSuccess();
        console.log(`  Save as Draft succeeded ✓`);
      });

      test('SC-2 | copied campaign should appear in the Redirection list as Draft', async () => {
        test.skip(!rd003HasIdField, 'Campaign ID field absent in RD copy form — no campaign was saved in SC-1');
        await navigateToRedirection();
        await frame().getByRole('textbox', { name: 'Enter campaign name' }).fill(copyName);
        await frame().getByRole('button', { name: 'Search' }).click();
        await expect(frame().getByRole('cell', { name: copyName, exact: true })).toBeVisible({ timeout: 15000 });
        await expect(frame().getByText('Draft').first()).toBeVisible({ timeout: 5000 });
        console.log(`\n  Copied campaign "${copyName}" visible ✓`);
        console.log(`  Status : Draft ✓`);
      });

      test('SC-3 | the original source campaign should still be in the Redirection list unchanged', async () => {
        test.skip(!sourceName, 'sourceName not captured — SC-1 was skipped or did not read the drawer');
        await navigateToRedirection();
        await frame().getByRole('textbox', { name: 'Enter campaign name' }).fill(sourceName);
        await frame().getByRole('button', { name: 'Search' }).click();
        await expect(frame().getByRole('cell', { name: sourceName, exact: true })).toBeVisible({ timeout: 15000 });
        console.log(`\n  Original campaign "${sourceName}" still in list ✓`);
        console.log(`  Copy is independent — original is not affected ✓`);
      });
    });

    // ── TC-CP-RD-004 ────────────────────────────────────────────────────────
    // POSITIVE: Full copy → Save & Activate → Scheduled

    test.describe('TC-CP-RD-004 | Copying a Redirection campaign and saving as Scheduled creates a new Scheduled campaign', () => {
      const copyId       = `CPRD_S_${Date.now()}`;
      const copyName     = `RD_Copy_Sched_${Date.now()}`.slice(0, 60);
      let   rd004HasIdField = false;

      test.beforeAll(async () => {
        await navigateToRedirection();
      });

      test('SC-1 | filling required fields and clicking Save & Activate should close the drawer', async () => {
        await frame().getByRole('button', { name: 'Copy Campaign' }).first().click();
        await copyPage.assertCreateDrawerVisible();

        await copyPage.fillName(copyName);
        await copyPage.fillStartDate(futureDateStr(7, 10, 0));
        rd004HasIdField = await copyPage.clearAndFillCampaignId(copyId);
        if (!rd004HasIdField) {
          await copyPage.closeDrawer();
          test.skip(true, 'Campaign ID field absent in RD copy form — skipping Scheduled save with Campaign ID');
        }

        console.log(`\n  Copied name : "${copyName}" | Campaign ID : "${copyId}"`);

        await copyPage.clickSaveActivate();
        await copyPage.assertSaveSuccess();
        console.log(`  Save & Activate succeeded ✓`);
      });

      test('SC-2 | the copied campaign should appear in the Redirection list as Scheduled', async () => {
        test.skip(!rd004HasIdField, 'Campaign ID field absent in RD copy form — no campaign was saved in SC-1');
        await navigateToRedirection();
        await frame().getByRole('textbox', { name: 'Enter campaign name' }).fill(copyName);
        await frame().getByRole('button', { name: 'Search' }).click();
        await expect(frame().getByRole('cell', { name: copyName, exact: true })).toBeVisible({ timeout: 15000 });
        await expect(frame().getByText('Scheduled').first()).toBeVisible({ timeout: 5000 });
        console.log(`\n  Copied campaign "${copyName}" — Status : Scheduled ✓`);
      });
    });

    // ── TC-CP-RD-005 ────────────────────────────────────────────────────────
    // NEGATIVE: Save without start date → validation error

    test('TC-CP-RD-005 | Negative — saving a copied Redirection campaign without filling the start date should show a validation error', async () => {
      await navigateToRedirection();
      await frame().getByRole('button', { name: 'Copy Campaign' }).first().click();
      await copyPage.assertCreateDrawerVisible();

      await copyPage.fillName(`RD_NoDate_${Date.now()}`);
      await copyPage.clearAndFillCampaignId(`CPRD_ND_${Date.now()}`);
      console.log(`\n  Start date intentionally left empty`);

      await copyPage.clickSaveActivate();
      await copyPage.assertStartDateRequiredError();
      console.log(`  "Please select campaign start..." error shown ✓`);

      await copyPage.closeDrawer();
    });

    // ── TC-CP-RD-006 ────────────────────────────────────────────────────────
    // NEGATIVE: Past start date → validation error

    test('TC-CP-RD-006 | Negative — setting a past start date on a copied Redirection campaign should show a validation error', async () => {
      await navigateToRedirection();
      await frame().getByRole('button', { name: 'Copy Campaign' }).first().click();
      await copyPage.assertCreateDrawerVisible();

      const past = pastDateStr(1);
      await copyPage.fillName(`RD_Past_${Date.now()}`);
      await copyPage.fillStartDate(past);
      await copyPage.clearAndFillCampaignId(`CPRD_PD_${Date.now()}`);
      console.log(`\n  Past start date : "${past}"`);

      await copyPage.clickSaveActivate();
      await copyPage.assertStartDatePastError();
      console.log(`  "Campaign start date...should be greater than current date" shown ✓`);

      await copyPage.closeDrawer();
    });

    // ── TC-CP-RD-007 ────────────────────────────────────────────────────────
    // NEGATIVE: End date before start date → validation error

    test('TC-CP-RD-007 | Negative — setting an end date earlier than the start date on a copied Redirection campaign should show a validation error', async () => {
      await navigateToRedirection();
      await frame().getByRole('button', { name: 'Copy Campaign' }).first().click();
      await copyPage.assertCreateDrawerVisible();

      await copyPage.fillName(`RD_BadEnd_${Date.now()}`);
      await copyPage.fillStartDate(futureDateStr(10, 10, 0));
      await copyPage.fillEndDate(futureDateStr(5, 10, 0));
      console.log(`\n  End date set before start date`);

      await copyPage.assertEndDateBeforeStartError();
      console.log(`  "Campaign end date...should be greater than campaign start date" shown ✓`);

      await copyPage.closeDrawer();
    });

    // ── TC-CP-RD-008 ────────────────────────────────────────────────────────
    // NEGATIVE: Invalid Campaign ID format → format error

    test('TC-CP-RD-008 | Negative — entering a Campaign ID with invalid characters on a copied Redirection campaign should show a format validation error', async () => {
      await navigateToRedirection();
      await frame().getByRole('button', { name: 'Copy Campaign' }).first().click();
      await copyPage.assertCreateDrawerVisible();

      const filled = await copyPage.fillInvalidCampaignId('bad@id#here');
      test.skip(!filled, 'Campaign ID field not present in this Redirection copy form — skipping format-validation test');
      console.log(`\n  Campaign ID "bad@id#here" entered`);

      await copyPage.assertCampaignIdFormatError();
      console.log(`  "Campaign ID can only contain..." format error shown ✓`);

      await copyPage.closeDrawer();
    });

    // ── TC-CP-RD-009 ────────────────────────────────────────────────────────
    // NEGATIVE: Duplicate Campaign ID → duplicate error

    test.describe('TC-CP-RD-009 | Negative — using an already-registered Campaign ID on a copied Redirection campaign should show a duplicate error', () => {
      const duplicateId = `CPRDDUP${Date.now()}`;
      let rdHasCampaignIdField = false;

      test.beforeAll(async () => {
        await navigateToRedirection();
        await frame().getByRole('button', { name: 'Copy Campaign' }).first().click();
        await copyPage.assertCreateDrawerVisible();
        await copyPage.fillName(`RD_DupSrc_${Date.now()}`);
        await copyPage.fillStartDate(futureDateStr(3, 10, 0));
        rdHasCampaignIdField = await copyPage.clearAndFillCampaignId(duplicateId);
        if (rdHasCampaignIdField) {
          await copyPage.clickSaveDraft();
          await copyPage.assertSaveSuccess();
          console.log(`\n  [Setup] Redirection Campaign ID "${duplicateId}" registered ✓`);
        } else {
          await copyPage.closeDrawer();
          console.log(`\n  [Setup] Redirection copy form has no Campaign ID field — test will be skipped`);
        }
      });

      test('SC-1 | saving a copy with the already-registered Campaign ID should be rejected with a duplicate error', async () => {
        test.skip(!rdHasCampaignIdField, 'Campaign ID field not present in this Redirection copy form');

        await navigateToRedirection();
        await frame().getByRole('button', { name: 'Copy Campaign' }).first().click();
        await copyPage.assertCreateDrawerVisible();

        try {
          // The duplicate check no longer fires inline on field blur — the ID
          // is only rejected when the campaign is actually saved.
          await copyPage.clearAndFillCampaignId(duplicateId);
          await copyPage.fillName(`RD_DupAttempt_${Date.now()}`);
          await copyPage.fillStartDate(futureDateStr(4, 10, 0));

          await copyPage.waitForNotificationsToClear();
          await copyPage.clickSaveDraft();

          const notification = await copyPage.assertDuplicateIdSaveRejected();
          console.log(`\n  Save rejected for "${duplicateId}" — notification: "${notification}" ✓`);
        } finally {
          await copyPage.closeDrawer();
        }
      });
    });

    // ── TC-CP-RD-010 ────────────────────────────────────────────────────────
    // Campaign ID reuse rules based on source Redirection campaign status.
    //
    // SC-1 : Scheduled / Paused / Live → ID still in use → duplicate error
    // SC-2 : Expired → ID is released → reuse succeeds (first time only)
    // SC-3 : Second reuse of the same Expired ID → duplicate error

    test.describe('TC-CP-RD-010 | Campaign ID reuse rules when copying a Redirection campaign depend on the source campaign status', () => {
      let scheduledCampaignId  = '';
      let expiredCampaignId    = '';
      let rd010HasCampaignIdField = false;

      test.beforeAll(async () => {
        // Probe whether the RD copy form exposes a Campaign ID field
        await navigateToRedirection();
        await frame().getByRole('button', { name: 'Copy Campaign' }).first().click();
        await copyPage.assertCreateDrawerVisible();
        const probeInput = copyPage.frame.getByRole('textbox', { name: 'Campaign ID *' });
        rd010HasCampaignIdField = await probeInput.isVisible({ timeout: 8000 }).catch(() => false);
        await copyPage.closeDrawer();
        console.log(`\n  [Setup] Campaign ID field present : ${rd010HasCampaignIdField}`);

        if (!rd010HasCampaignIdField) return;

        // Collect a Scheduled Redirection campaign's Campaign ID
        await navigateToRedirection();
        await filterRedirectionByStatus('Scheduled');
        if ((await getRedirectionResultsCount()) > 0) {
          await frame().getByRole('button', { name: 'View Details' }).first().click();
          scheduledCampaignId = await getCampaignIdFromDetailsModal();
          await closeDetailsModal();
        }

        // Collect an Expired Redirection campaign's Campaign ID
        await navigateToRedirection();
        await filterRedirectionByStatus('Expired');
        if ((await getRedirectionResultsCount()) > 0) {
          await frame().getByRole('button', { name: 'View Details' }).first().click();
          expiredCampaignId = await getCampaignIdFromDetailsModal();
          await closeDetailsModal();
        }

        console.log(`  [Setup] Scheduled Campaign ID : "${scheduledCampaignId}"`);
        console.log(`  [Setup] Expired  Campaign ID  : "${expiredCampaignId}"`);
      });

      test('SC-1 | using a Scheduled Redirection campaign\'s Campaign ID in a copy should be rejected — the ID is still in use', async () => {
        test.skip(!rd010HasCampaignIdField, 'Campaign ID field absent in RD copy form — skipping reuse-rules test');
        test.skip(!scheduledCampaignId, 'No Scheduled Redirection campaign found — skipping');

        await navigateToRedirection();
        await filterRedirectionByStatus('Scheduled');
        await frame().getByRole('button', { name: 'Copy Campaign' }).first().click();
        await copyPage.assertCreateDrawerVisible();

        try {
          // Rejection now happens at save time, not on field blur
          await copyPage.clearAndFillCampaignId(scheduledCampaignId);
          await copyPage.fillName(`RD_DupSched_${Date.now()}`);
          await copyPage.fillStartDate(futureDateStr(4, 10, 0));

          await copyPage.waitForNotificationsToClear();
          await copyPage.clickSaveDraft();

          const notification = await copyPage.assertDuplicateIdSaveRejected();
          console.log(`\n  Scheduled ID "${scheduledCampaignId}" rejected — still in use ✓`);
          console.log(`  Save rejected — notification: "${notification}" ✓`);
          console.log(`  Active Redirection campaign IDs cannot be reused ✓`);
        } finally {
          await copyPage.closeDrawer();
        }
      });

      test('SC-2 | using an Expired Redirection campaign\'s Campaign ID in a copy should be accepted — expired IDs are released for one reuse', async () => {
        test.skip(!rd010HasCampaignIdField, 'Campaign ID field absent in RD copy form — skipping reuse-rules test');
        test.skip(!expiredCampaignId, 'No Expired Redirection campaign found — skipping');

        await navigateToRedirection();
        await filterRedirectionByStatus('Expired');
        await frame().getByRole('button', { name: 'Copy Campaign' }).first().click();
        await copyPage.assertCreateDrawerVisible();

        // The uniqueness check now fires at save time, so acceptance is proven
        // by the save succeeding rather than by the absence of an inline error.
        await copyPage.clearAndFillCampaignId(expiredCampaignId);
        await copyPage.fillName(`RD_ReusedExp_${Date.now()}`);

        await copyPage.fillStartDate(futureDateStr(5, 10, 0));
        await copyPage.clickSaveDraft();
        await copyPage.assertSaveSuccess();
        console.log(`  Campaign saved using Expired campaign's ID ✓`);
        console.log(`  Expired Redirection campaign IDs are released and can be reused once ✓`);
      });

      test('SC-3 | attempting to use the same Expired Campaign ID a second time should be rejected — the ID is now registered by SC-2', async () => {
        test.skip(!rd010HasCampaignIdField, 'Campaign ID field absent in RD copy form — skipping reuse-rules test');
        test.skip(!expiredCampaignId, 'No Expired Redirection campaign found — skipping');

        await navigateToRedirection();
        await frame().getByRole('button', { name: 'Copy Campaign' }).first().click();
        await copyPage.assertCreateDrawerVisible();

        try {
          // Attempt the same ID that SC-2 just registered — rejection now
          // happens at save time, not on field blur
          await copyPage.clearAndFillCampaignId(expiredCampaignId);
          await copyPage.fillName(`RD_SecondReuse_${Date.now()}`);
          await copyPage.fillStartDate(futureDateStr(4, 10, 0));

          await copyPage.waitForNotificationsToClear();
          await copyPage.clickSaveDraft();

          const notification = await copyPage.assertDuplicateIdSaveRejected();
          console.log(`\n  Campaign ID "${expiredCampaignId}" rejected on second attempt ✓`);
          console.log(`  Save rejected — notification: "${notification}" ✓`);
          console.log(`  Expired Redirection campaign ID can only be reused ONCE ✓`);
        } finally {
          await copyPage.closeDrawer();
        }
      });
    });

    // ── TC-CP-RD-011 ────────────────────────────────────────────────────────
    // NEGATIVE: Clearing the pre-filled campaign name → required validation error

    test('TC-CP-RD-011 | Negative — clearing the pre-filled campaign name on a copied Redirection campaign and clicking Save & Activate should show a required name validation error', async () => {
      await navigateToRedirection();
      await frame().getByRole('button', { name: 'Copy Campaign' }).first().click();
      await copyPage.assertCreateDrawerVisible();

      // Fill valid start date and Campaign ID; clear the pre-filled name
      await copyPage.fillStartDate(futureDateStr(5, 10, 0));
      await copyPage.clearAndFillCampaignId(`CPRD_NN_${Date.now()}`);
      const rdNameInput = copyPage.frame.getByRole('textbox', { name: 'Campaign name *' });
      await rdNameInput.clear();
      // Blur by clicking the start date field to trigger inline name validation
      await frame().getByRole('textbox', { name: 'Campaign start date & time (' }).click();
      console.log(`\n  Campaign name cleared (empty)`);

      await copyPage.clickSaveActivate();
      await copyPage.assertNameRequiredError();
      console.log(`  "Please enter campaign name" validation error shown ✓`);
      console.log(`  Save blocked — campaign name is required ✓`);

      await copyPage.closeDrawer();
    });

    // ── TC-CP-RD-012 ────────────────────────────────────────────────────────
    // NEGATIVE: No Campaign ID entered → required validation error
    // Redirection copy form leaves Campaign ID empty by default (user must supply a new ID).

    test('TC-CP-RD-012 | Negative — saving a copied Redirection campaign without entering a Campaign ID should show a required Campaign ID validation error', async () => {
      await navigateToRedirection();
      await frame().getByRole('button', { name: 'Copy Campaign' }).first().click();
      await copyPage.assertCreateDrawerVisible();

      // Skip if RD copy form (V1) does not expose a Campaign ID field at all
      const rdIdInput = copyPage.frame.getByRole('textbox', { name: 'Campaign ID *' });
      const hasField  = await rdIdInput.isVisible({ timeout: 8000 }).catch(() => false);
      if (!hasField) {
        await copyPage.closeDrawer();
        test.skip(true, 'Campaign ID field absent in RD copy form — no required-validation to test');
      }

      // Fill valid name and start date; leave Campaign ID empty (empty by default in RD copy)
      await copyPage.fillName(`RD_NoCampaignId_${Date.now()}`);
      await copyPage.fillStartDate(futureDateStr(5, 10, 0));
      // Click the empty Campaign ID field and blur to surface inline required validation
      await rdIdInput.click();
      await copyPage.frame.getByRole('textbox', { name: 'Campaign name *' }).click();
      console.log(`\n  Campaign ID not filled (empty by default in Redirection copy form)`);

      await copyPage.clickSaveActivate();
      await copyPage.assertCampaignIdRequiredError();
      console.log(`  "Please enter campaign ID" validation error shown ✓`);
      console.log(`  Save blocked — Campaign ID is required ✓`);

      await copyPage.closeDrawer();
    });

    // ── TC-CP-RD-013 ────────────────────────────────────────────────────────
    // POSITIVE: Save as Draft without start date — Draft campaigns do not require a start date

    test.describe('TC-CP-RD-013 | Copying a Redirection campaign and saving as Draft without a start date should succeed — Draft campaigns do not require a start date', () => {
      const rdNoDatesId   = `CPRD_ND_${Date.now()}`;
      const rdNoDatesName = `RD_NoDates_Draft_${Date.now()}`.slice(0, 60);

      test.beforeAll(async () => {
        await navigateToRedirection();
      });

      test('SC-1 | filling only name and Campaign ID (no start date) and clicking Save as Draft should close the drawer', async () => {
        await frame().getByRole('button', { name: 'Copy Campaign' }).first().click();
        await copyPage.assertCreateDrawerVisible();

        // Fill name and Campaign ID but intentionally leave start date empty
        await copyPage.fillName(rdNoDatesName);
        await copyPage.clearAndFillCampaignId(rdNoDatesId);

        console.log(`\n  Campaign name  : "${rdNoDatesName}"`);
        console.log(`  Campaign ID    : "${rdNoDatesId}"`);
        console.log(`  Start date     : intentionally left empty`);

        await copyPage.clickSaveDraft();
        await copyPage.assertSaveSuccess();
        console.log(`  Save as Draft succeeded without a start date ✓`);
      });

      test('SC-2 | the copied Draft campaign should appear in the Redirection list with Draft status', async () => {
        await navigateToRedirection();
        await frame().getByRole('textbox', { name: 'Enter campaign name' }).fill(rdNoDatesName);
        await frame().getByRole('button', { name: 'Search' }).click();
        await expect(frame().getByRole('cell', { name: rdNoDatesName, exact: true })).toBeVisible({ timeout: 15000 });
        await expect(frame().getByText('Draft').first()).toBeVisible({ timeout: 5000 });
        console.log(`\n  Copied campaign "${rdNoDatesName}" visible in list ✓`);
        console.log(`  Status : Draft ✓`);
        console.log(`  Redirection Draft campaigns do not require a start date ✓`);
      });
    });

  }); // end: Redirection

}); // end: Copy Campaign Feature
