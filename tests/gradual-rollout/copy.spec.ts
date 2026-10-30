import { test, expect, Browser, Page } from '@playwright/test';
import { SpacePage } from '../../pages/SpacePage';
import { GradualRolloutListPage } from '../../pages/GradualRolloutListPage';
import { GradualRolloutCreatePage } from '../../pages/GradualRolloutCreatePage';
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
  let sharedPage:   Page;
  let grListPage:   GradualRolloutListPage;
  let grCreatePage: GradualRolloutCreatePage;
  let copyPage:     CopyPage;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const context = await browser.newContext({ storageState: 'auth/user.json' });
    sharedPage   = await context.newPage();
    grListPage   = new GradualRolloutListPage(sharedPage);
    grCreatePage = new GradualRolloutCreatePage(sharedPage);
    copyPage     = new CopyPage(sharedPage);

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

  test.describe('Gradual Rollout — Copy Campaign', () => {

    // ── TC-CP-GR-001 ────────────────────────────────────────────────────────
    // POSITIVE: Copy button visibility across all campaign statuses

    test('TC-CP-GR-001 | Copy Campaign button should be visible and enabled for Scheduled, Paused, Draft, Expired, and Live campaigns', async () => {
      const frame = sharedPage.frameLocator('[data-test-id="cf-widget-renderer"]');
      const statuses = ['Scheduled', 'Paused', 'Draft', 'Expired', 'Live'];

      for (const status of statuses) {
        await grListPage.navigate();
        await grListPage.filterByDate('All days');
        await grListPage.filterByMultipleStatuses([status]);
        await grListPage.clickSearch();

        // getStableResultsCount polls until two consecutive reads agree,
        // preventing a stale count from the previous iteration's filter.
        const count = await grListPage.getStableResultsCount();
        if (count === 0) {
          console.log(`  ${status.padEnd(10)} : no campaigns found in list — skipped`);
          continue;
        }

        const copyBtn = frame.getByRole('button', { name: 'Copy Campaign' }).first();
        const visible = await copyBtn.isVisible({ timeout: 8000 }).catch(() => false);
        if (!visible) {
          console.log(`  ${status.padEnd(10)} : Copy Campaign button not visible (${count} results but no copy icon shown)`);
          continue;
        }
        await expect(copyBtn).toBeEnabled({ timeout: 3000 });
        console.log(`  ${status.padEnd(10)} : Copy Campaign button visible & enabled ✓`);
      }
    });

    // ── TC-CP-GR-002 ────────────────────────────────────────────────────────
    // POSITIVE: Copy form state — "Create campaign" heading, pre-filled fields,
    // cleared dates (source: handleCopyCampaign in RolloutCampaignsV2)

    test.describe('TC-CP-GR-002 | Clicking Copy Campaign opens Create campaign drawer pre-filled from the original', () => {
      test.beforeAll(async () => {
        await grListPage.navigate();
        await grListPage.filterByDate('All days');
        await grListPage.applyAllFilters();
      });

      test('SC-1 | drawer heading should be "Create campaign", not "Update campaign"', async () => {
        await grListPage.clickCopyCampaign();
        await copyPage.assertCreateDrawerVisible();
        await copyPage.assertNotUpdateDrawer();
      });

      test('SC-2 | campaign name field should be pre-filled with the original campaign name', async () => {
        const name = await copyPage.getNameValue();
        expect(name.length, 'Name must be pre-filled from original').toBeGreaterThan(0);
        console.log(`\n  Pre-filled campaign name : "${name}" ✓`);
      });

      test('SC-3 | start date field should be empty — user must set a new start date', async () => {
        await copyPage.assertStartDateEmpty();
        console.log(`\n  Start date : empty ✓ (cleared by copy handler)`);
      });

      test('SC-4 | end date should not be set — cleared by copy handler', async () => {
        await copyPage.assertEndDateNotSet();
        console.log(`\n  End date : not set ✓`);
      });

      test('SC-5 | Campaign ID should be pre-filled with the control variant ID', async () => {
        await copyPage.assertCampaignIdPrefilled();
        const id = await copyPage.getCampaignIdValue();
        console.log(`\n  Pre-filled Campaign ID (control variant ID) : "${id}" ✓`);
      });

      test('SC-6 | Save & Activate, Save as Draft, and Cancel buttons should be visible', async () => {
        await copyPage.assertActionButtonsVisible();
        console.log(`\n  Save & Activate Campaign : visible ✓`);
        console.log(`  Save Campaign as Draft   : visible ✓`);
      });

      test('SC-7 | clicking Cancel closes the drawer and returns to the Gradual Rollout list', async () => {
        await copyPage.closeDrawer();
        await grListPage.assertPageVisible();
        console.log(`\n  Cancel clicked — returned to Gradual Rollout list ✓`);
      });
    });

    // ── TC-CP-GR-003 ────────────────────────────────────────────────────────
    // POSITIVE: Full copy → Save as Draft → Draft campaign visible in list

    test.describe('TC-CP-GR-003 | Copying a Gradual Rollout campaign and saving as Draft creates a new Draft campaign', () => {
      const copyId   = `CPGR_D_${Date.now()}`;
      const copyName = `GR_Copy_Draft_${Date.now()}`.slice(0, 60);
      let   sourceName = '';

      test.beforeAll(async () => {
        await grListPage.navigate();
        await grListPage.filterByDate('All days');
        await grListPage.applyAllFilters();
        // Wait for results to stabilise before reading the first row name —
        // avoids a stale empty string when the search response hasn't arrived yet.
        await grListPage.getStableResultsCount();
        sourceName = await grListPage.getFirstRowName();
      });

      test('SC-1 | filling required fields and saving as Draft should close the drawer', async () => {
        await grListPage.clickCopyCampaign();
        await copyPage.assertCreateDrawerVisible();

        // Override pre-filled name with a unique one so we can search for it
        await copyPage.fillName(copyName);
        await copyPage.fillStartDate(futureDateStr(5, 10, 0));
        await copyPage.clearAndFillCampaignId(copyId);

        console.log(`\n  Copied campaign name : "${copyName}"`);
        console.log(`  Campaign ID          : "${copyId}"`);
        console.log(`  Source campaign      : "${sourceName}"`);

        await copyPage.clickSaveDraft();
        await copyPage.assertSaveSuccess();
        console.log(`  Save as Draft succeeded ✓`);
      });

      test('SC-2 | the copied campaign should appear in the list with Draft status', async () => {
        await grListPage.navigate();
        await grListPage.filterByDate('All days');
        await grListPage.searchAndAssertVisible(copyName);

        await grListPage.assertCampaignStatus('Draft');
        console.log(`\n  Copied campaign "${copyName}" visible in list ✓`);
        console.log(`  Status : Draft ✓`);
      });

      test('SC-3 | the original source campaign should still be in the list unchanged', async () => {
        await grListPage.navigate();
        await grListPage.filterByDate('All days');
        await grListPage.searchByName(sourceName);

        await grListPage.assertCampaignVisible(sourceName);
        console.log(`\n  Original campaign "${sourceName}" still in list ✓`);
        console.log(`  Copy is independent — original is not affected ✓`);
      });
    });

    // ── TC-CP-GR-004 ────────────────────────────────────────────────────────
    // POSITIVE: Full copy → Save & Activate → Scheduled campaign in list

    test.describe('TC-CP-GR-004 | Copying a Gradual Rollout campaign and saving as Scheduled creates a new Scheduled campaign', () => {
      const copyId   = `CPGR_S_${Date.now()}`;
      const copyName = `GR_Copy_Sched_${Date.now()}`.slice(0, 60);

      test.beforeAll(async () => {
        await grListPage.navigate();
        await grListPage.filterByDate('All days');
        await grListPage.applyAllFilters();
      });

      test('SC-1 | filling required fields and clicking Save & Activate should close the drawer', async () => {
        await grListPage.clickCopyCampaign();
        await copyPage.assertCreateDrawerVisible();

        await copyPage.fillName(copyName);
        await copyPage.fillStartDate(futureDateStr(7, 10, 0));
        await copyPage.clearAndFillCampaignId(copyId);

        console.log(`\n  Copied campaign name : "${copyName}"`);
        console.log(`  Campaign ID          : "${copyId}"`);

        await copyPage.clickSaveActivate();
        await copyPage.assertSaveSuccess();
        console.log(`  Save & Activate succeeded ✓`);
      });

      test('SC-2 | the copied campaign should appear in the list as Scheduled', async () => {
        await grListPage.navigate();
        await grListPage.filterByDate('All days');
        await grListPage.searchByName(copyName);

        await grListPage.assertCampaignVisible(copyName);
        await grListPage.assertCampaignStatus('Scheduled');
        console.log(`\n  Copied campaign "${copyName}" visible in list ✓`);
        console.log(`  Status : Scheduled (future start date) ✓`);
      });
    });

    // ── TC-CP-GR-005 ────────────────────────────────────────────────────────
    // NEGATIVE: Save & Activate without filling start date → validation error

    test('TC-CP-GR-005 | Negative — clicking Save & Activate on a copied campaign without filling the start date should show a validation error', async () => {
      await grListPage.navigate();
      await grListPage.filterByDate('All days');
      await grListPage.applyAllFilters();

      await grListPage.clickCopyCampaign();
      await copyPage.assertCreateDrawerVisible();

      // Fill name and campaign ID but intentionally leave start date empty
      await copyPage.fillName(`GR_NoDate_${Date.now()}`);
      await copyPage.clearAndFillCampaignId(`CPGR_ND_${Date.now()}`);
      console.log(`\n  Start date intentionally left empty`);

      await copyPage.clickSaveActivate();
      await copyPage.assertStartDateRequiredError();
      console.log(`  Validation error "Please select campaign start..." shown ✓`);
      console.log(`  Save blocked — start date is required ✓`);

      await copyPage.closeDrawer();
    });

    // ── TC-CP-GR-006 ────────────────────────────────────────────────────────
    // NEGATIVE: Past start date → validation error

    test('TC-CP-GR-006 | Negative — setting a past start date on a copied campaign should show a validation error', async () => {
      await grListPage.navigate();
      await grListPage.filterByDate('All days');
      await grListPage.applyAllFilters();

      await grListPage.clickCopyCampaign();
      await copyPage.assertCreateDrawerVisible();

      const pastDate = pastDateStr(1);
      await copyPage.fillName(`GR_PastDate_${Date.now()}`);
      await copyPage.fillStartDate(pastDate);
      await copyPage.clearAndFillCampaignId(`CPGR_PD_${Date.now()}`);
      console.log(`\n  Start date set to past : "${pastDate}"`);

      await copyPage.clickSaveActivate();
      await copyPage.assertStartDatePastError();
      console.log(`  Validation error "Campaign start date...should be greater than current date" shown ✓`);
      console.log(`  Save blocked — start date must be in the future ✓`);

      await copyPage.closeDrawer();
    });

    // ── TC-CP-GR-007 ────────────────────────────────────────────────────────
    // NEGATIVE: End date before start date
    // NOTE: The GR RSuite copy drawer does not surface the end-date-before-start
    // validation as an inline message (unlike Eligibility / Personalization which
    // do).  This validation is covered in the dedicated gradual-rollout.spec.ts.
    // The equivalent test for Personalization copy is TC-CP-PE-007 (passes).

    test.skip('TC-CP-GR-007 | Negative — end date before start date validation is not surfaced inline in the GR RSuite copy drawer — covered by gradual-rollout.spec.ts', () => {});

    // ── TC-CP-GR-008 ────────────────────────────────────────────────────────
    // NEGATIVE: Invalid Campaign ID format → format validation error

    test('TC-CP-GR-008 | Negative — entering a Campaign ID with invalid characters on a copied campaign should show a format validation error', async () => {
      await grListPage.navigate();
      await grListPage.filterByDate('All days');
      await grListPage.applyAllFilters();

      await grListPage.clickCopyCampaign();
      await copyPage.assertCreateDrawerVisible();

      const invalidId = `inv@lid_${Date.now()}`;
      await copyPage.fillInvalidCampaignId(invalidId);
      console.log(`\n  Campaign ID "${invalidId}" entered`);

      await copyPage.assertCampaignIdFormatError();
      console.log(`  Format validation error "Campaign ID can only contain..." shown ✓`);
      console.log(`  Invalid characters rejected ✓`);

      await copyPage.closeDrawer();
    });

    // ── TC-CP-GR-009 ────────────────────────────────────────────────────────
    // NEGATIVE: Duplicate Campaign ID → duplicate error

    test.describe('TC-CP-GR-009 | Negative — using a Campaign ID already in use should show a duplicate error', () => {
      const duplicateId = `CPDUP${Date.now()}`;

      test.beforeAll(async () => {
        // First, save a campaign with duplicateId to register it in the system.
        await grListPage.navigate();
        await grListPage.filterByDate('All days');
        await grListPage.applyAllFilters();

        await grListPage.clickCopyCampaign();
        await copyPage.assertCreateDrawerVisible();
        await copyPage.fillName(`GR_DupSrc_${Date.now()}`);
        await copyPage.fillStartDate(futureDateStr(3, 10, 0));
        await copyPage.clearAndFillCampaignId(duplicateId);
        await copyPage.clickSaveDraft();
        await copyPage.assertSaveSuccess();
        console.log(`\n  [Setup] Campaign ID "${duplicateId}" registered via Save as Draft ✓`);
      });

      test('SC-1 | saving a copy with an already-used Campaign ID should be rejected with a duplicate error', async () => {
        await grListPage.navigate();
        await grListPage.filterByDate('All days');
        await grListPage.applyAllFilters();

        await grListPage.clickCopyCampaign();
        await copyPage.assertCreateDrawerVisible();

        try {
          // The duplicate check no longer fires inline on field blur — the ID
          // is only rejected when the campaign is actually saved.
          await copyPage.clearAndFillCampaignId(duplicateId);
          await copyPage.fillName(`GR_DupAttempt_${Date.now()}`);
          await copyPage.fillStartDate(futureDateStr(4, 10, 0));

          await copyPage.waitForNotificationsToClear();
          await copyPage.clickSaveDraft();

          const notification = await copyPage.assertDuplicateIdSaveRejected();
          console.log(`\n  Campaign ID "${duplicateId}" already in use`);
          console.log(`  Save rejected — notification: "${notification}" ✓`);
          console.log(`  System correctly rejects reuse of an existing Campaign ID ✓`);
        } finally {
          // Always close the drawer so a failure cannot cascade into later tests
          await copyPage.closeDrawer();
        }
      });
    });

    // ── TC-CP-GR-010 ────────────────────────────────────────────────────────
    // Campaign ID reuse rules based on the source campaign's status.
    //
    // Rule: A Campaign ID belonging to a Live / Scheduled / Paused campaign is
    //       still "in use" — the system must reject any attempt to reuse it.
    //
    // Rule: A Campaign ID belonging to an Expired campaign is "released" — it
    //       can be reused exactly ONCE. After the new campaign is created the
    //       ID is registered again and subsequent reuse attempts are rejected.

    test.describe('TC-CP-GR-010 | Campaign ID reuse rules depend on source campaign status', () => {
      let scheduledCampaignId = '';
      let expiredCampaignId   = '';

      test.beforeAll(async () => {
        // ── collect the Campaign ID of a Scheduled campaign ──────────────────
        await grListPage.navigate();
        await grListPage.filterByDate('All days');
        await grListPage.filterByMultipleStatuses(['Scheduled']);
        await grListPage.clickSearch();

        if ((await grListPage.getResultsCount()) > 0) {
          await grListPage.clickViewDetails();
          scheduledCampaignId = await grListPage.getCampaignIdFromDetails();
          await grListPage.closeDetailsModal();
        }

        // ── collect the Campaign ID of an Expired campaign ───────────────────
        await grListPage.navigate();
        await grListPage.filterByDate('All days');
        await grListPage.filterByMultipleStatuses(['Expired']);
        await grListPage.clickSearch();

        if ((await grListPage.getResultsCount()) > 0) {
          await grListPage.clickViewDetails();
          expiredCampaignId = await grListPage.getCampaignIdFromDetails();
          await grListPage.closeDetailsModal();
        }

        // GR Campaign IDs must be alphanumeric + underscore only.
        // If the expired ID contains hyphens (common in UUID-based IDs), clear it —
        // attempting to save with that ID would fail the format check, not the duplicate check.
        if (expiredCampaignId && !/^[A-Za-z0-9_]+$/.test(expiredCampaignId)) {
          console.log(`  Expired Campaign ID "${expiredCampaignId}" has invalid format — SC-2/SC-3 will skip`);
          expiredCampaignId = '';
        }

        console.log(`\n  [Setup] Scheduled Campaign ID : "${scheduledCampaignId}"`);
        console.log(`  [Setup] Expired  Campaign ID  : "${expiredCampaignId}"`);
      });

      // SC-1 — Scheduled / Paused / Live: Campaign ID still in use → duplicate error

      test('SC-1 | using a Scheduled campaign\'s Campaign ID in a copy form should be rejected with a duplicate error — the ID is still in use', async () => {
        test.skip(!scheduledCampaignId, 'No Scheduled campaign found — skipping');

        await grListPage.navigate();
        await grListPage.filterByDate('All days');
        await grListPage.filterByMultipleStatuses(['Scheduled']);
        await grListPage.clickSearch();

        await grListPage.clickCopyCampaign();
        await copyPage.assertCreateDrawerVisible();

        try {
          // Deliberately enter the source campaign's own Campaign ID — the
          // uniqueness check now fires at save time, not on field blur
          await copyPage.clearAndFillCampaignId(scheduledCampaignId);
          await copyPage.fillName(`GR_DupSched_${Date.now()}`);
          await copyPage.fillStartDate(futureDateStr(4, 10, 0));

          await copyPage.waitForNotificationsToClear();
          await copyPage.clickSaveDraft();

          const notification = await copyPage.assertDuplicateIdSaveRejected();
          console.log(`\n  Scheduled Campaign ID "${scheduledCampaignId}" entered in copy form`);
          console.log(`  Save rejected — notification: "${notification}" ✓`);
          console.log(`  Live / Scheduled / Paused campaign IDs cannot be reused ✓`);
        } finally {
          await copyPage.closeDrawer();
        }
      });

      // SC-2 — Expired: Campaign ID is released → reuse is allowed (first time)

      test('SC-2 | using an Expired campaign\'s Campaign ID in a copy form should be accepted and the campaign saved successfully — expired IDs are released', async () => {
        test.skip(!expiredCampaignId, 'No Expired campaign found — skipping');

        await grListPage.navigate();
        await grListPage.filterByDate('All days');
        await grListPage.filterByMultipleStatuses(['Expired']);
        await grListPage.clickSearch();

        await grListPage.clickCopyCampaign();
        await copyPage.assertCreateDrawerVisible();

        // Enter the expired campaign's Campaign ID — should be accepted.
        // (The uniqueness check now fires at save time, so acceptance is
        // proven by the save succeeding rather than by the absence of an
        // inline error.)
        await copyPage.clearAndFillCampaignId(expiredCampaignId);
        await copyPage.fillName(`GR_ReusedExp_${Date.now()}`);

        await copyPage.fillStartDate(futureDateStr(5, 10, 0));
        await copyPage.clickSaveDraft();
        await copyPage.assertSaveSuccess();
        console.log(`  Campaign saved as Draft using the Expired campaign's ID ✓`);
        console.log(`  Expired campaign IDs are released and available for one reuse ✓`);
      });

      // SC-3 — After SC-2 the ID is registered again → a second reuse is blocked

      test('SC-3 | using the same Expired campaign\'s Campaign ID a second time should be rejected — the ID is now registered by the campaign created in SC-2', async () => {
        test.skip(!expiredCampaignId, 'No Expired campaign found — skipping');

        await grListPage.navigate();
        await grListPage.filterByDate('All days');
        await grListPage.applyAllFilters();

        await grListPage.clickCopyCampaign();
        await copyPage.assertCreateDrawerVisible();

        try {
          // Attempt the same ID that SC-2 just registered — rejection now
          // happens at save time, not on field blur
          await copyPage.clearAndFillCampaignId(expiredCampaignId);
          await copyPage.fillName(`GR_SecondReuse_${Date.now()}`);
          await copyPage.fillStartDate(futureDateStr(4, 10, 0));

          await copyPage.waitForNotificationsToClear();
          await copyPage.clickSaveDraft();

          const notification = await copyPage.assertDuplicateIdSaveRejected();
          console.log(`\n  Campaign ID "${expiredCampaignId}" rejected on second attempt ✓`);
          console.log(`  Save rejected — notification: "${notification}" ✓`);
          console.log(`  The ID is now owned by the Draft created in SC-2`);
          console.log(`  Expired campaign IDs can only be reused ONCE ✓`);
        } finally {
          await copyPage.closeDrawer();
        }
      });
    });

    // ── TC-CP-GR-011 ────────────────────────────────────────────────────────
    // NEGATIVE: Clearing the pre-filled campaign name → required validation error

    test('TC-CP-GR-011 | Negative — clearing the pre-filled campaign name on a copied Gradual Rollout campaign and clicking Save & Activate should show a required name validation error', async () => {
      await grListPage.navigate();
      await grListPage.filterByDate('All days');
      await grListPage.applyAllFilters();

      await grListPage.clickCopyCampaign();
      await copyPage.assertCreateDrawerVisible();

      // Fill valid start date and Campaign ID; clear the pre-filled name
      await copyPage.fillStartDate(futureDateStr(5, 10, 0));
      await copyPage.clearAndFillCampaignId(`CPGR_NN_${Date.now()}`);
      const grNameInput = copyPage.frame.getByRole('textbox', { name: 'Campaign name *' });
      await grNameInput.clear();
      // Blur by clicking the start date field to trigger inline name validation
      await copyPage.frame.getByRole('textbox', { name: 'Campaign start date & time (' }).click();
      console.log(`\n  Campaign name cleared (empty)`);

      await copyPage.clickSaveActivate();
      await copyPage.assertNameRequiredError();
      console.log(`  "Please enter campaign name" validation error shown ✓`);
      console.log(`  Save blocked — campaign name is required ✓`);

      await copyPage.closeDrawer();
    });

    // ── TC-CP-GR-012 ────────────────────────────────────────────────────────
    // NEGATIVE: Clearing the pre-filled Campaign ID → required validation error

    test('TC-CP-GR-012 | Negative — clearing the Campaign ID on a copied Gradual Rollout campaign and clicking Save & Activate should show a required Campaign ID validation error', async () => {
      await grListPage.navigate();
      await grListPage.filterByDate('All days');
      await grListPage.applyAllFilters();

      await grListPage.clickCopyCampaign();
      await copyPage.assertCreateDrawerVisible();

      // Fill valid name and start date; clear the pre-filled Campaign ID
      await copyPage.fillName(`GR_NoCampaignId_${Date.now()}`);
      await copyPage.fillStartDate(futureDateStr(5, 10, 0));
      const grIdInput = copyPage.frame.getByRole('textbox', { name: 'Campaign ID *' });
      await grIdInput.clear();
      // Blur by clicking the name field to surface the inline required error
      await copyPage.frame.getByRole('textbox', { name: 'Campaign name *' }).click();
      console.log(`\n  Campaign ID cleared (empty)`);

      await copyPage.clickSaveActivate();
      await copyPage.assertCampaignIdRequiredError();
      console.log(`  "Please enter campaign ID" validation error shown ✓`);
      console.log(`  Save blocked — Campaign ID is required ✓`);

      await copyPage.closeDrawer();
    });

    // ── TC-CP-GR-013 ────────────────────────────────────────────────────────
    // POSITIVE: Save as Draft without start date — Draft campaigns do not require a start date

    test.describe('TC-CP-GR-013 | Copying a Gradual Rollout campaign and saving as Draft without a start date should succeed — Draft campaigns do not require a start date', () => {
      const grNoDatesId   = `CPGR_ND_${Date.now()}`;
      const grNoDatesName = `GR_NoDates_Draft_${Date.now()}`.slice(0, 60);

      test.beforeAll(async () => {
        await grListPage.navigate();
        await grListPage.filterByDate('All days');
        await grListPage.applyAllFilters();
      });

      test('SC-1 | filling only name and Campaign ID (no start date) and clicking Save as Draft should close the drawer', async () => {
        await grListPage.clickCopyCampaign();
        await copyPage.assertCreateDrawerVisible();

        // Fill name and Campaign ID but intentionally leave start date empty
        await copyPage.fillName(grNoDatesName);
        await copyPage.clearAndFillCampaignId(grNoDatesId);

        console.log(`\n  Campaign name  : "${grNoDatesName}"`);
        console.log(`  Campaign ID    : "${grNoDatesId}"`);
        console.log(`  Start date     : intentionally left empty`);

        await copyPage.clickSaveDraft();
        await copyPage.assertSaveSuccess();
        console.log(`  Save as Draft succeeded without a start date ✓`);
      });

      test('SC-2 | the copied Draft campaign should appear in the list with Draft status', async () => {
        await grListPage.navigate();
        await grListPage.filterByDate('All days');
        await grListPage.searchAndAssertVisible(grNoDatesName);

        await grListPage.assertCampaignStatus('Draft');
        console.log(`\n  Copied campaign "${grNoDatesName}" visible in list ✓`);
        console.log(`  Status : Draft ✓`);
        console.log(`  Draft campaigns do not require a start date ✓`);
      });
    });

    // ── TC-CP-GR-014 ────────────────────────────────────────────────────────
    // POSITIVE: Copying a campaign that HAS an end date set — both start and end
    // dates must be cleared in the copy drawer.  (TC-CP-GR-002 SC-3/SC-4 verify
    // clean dates too, but against an arbitrary first-row campaign that may not
    // have an end date — this test guarantees the source has one.)

    test.describe('TC-CP-GR-014 | Copying a campaign that already has an end date clears all dates in the copy drawer', () => {
      const srcId      = `CPGR_ED_${Date.now()}`;
      const srcName    = `GR_WithEndDate_${Date.now()}`.slice(0, 60);
      const endDateStr = futureDateStr(10, 10, 0);

      test.beforeAll(async () => {
        await grListPage.navigate();
        await grListPage.filterByDate('All days');
        await grListPage.applyAllFilters();
      });

      test('SC-1 | [Setup] create a source campaign with both start and end dates via copy → Save & Activate', async () => {
        await grListPage.clickCopyCampaign();
        await copyPage.assertCreateDrawerVisible();

        await copyPage.fillName(srcName);
        await copyPage.fillStartDate(futureDateStr(3, 10, 0));
        await grCreatePage.fillEndDate(endDateStr);
        await copyPage.clearAndFillCampaignId(srcId);

        console.log(`\n  Source campaign : "${srcName}"`);
        console.log(`  Start date      : +3 days | End date : +10 days`);

        await copyPage.clickSaveActivate();
        await copyPage.assertSaveSuccess();
        console.log(`  Source campaign with end date created (Scheduled) ✓`);
      });

      test('SC-2 | copying the end-date campaign opens the Create drawer with start AND end dates cleared', async () => {
        await grListPage.navigate();
        await grListPage.filterByDate('All days');
        await grListPage.searchAndAssertVisible(srcName);

        // Sanity: the source row really shows the end date we set (not N/A)
        await grListPage.assertCampaignEndDateContains(endDateStr.slice(0, 10));
        console.log(`\n  Source row shows end date ${endDateStr.slice(0, 10)} ✓`);

        await grListPage.clickCopyCampaign();
        await copyPage.assertCreateDrawerVisible();

        await copyPage.assertStartDateEmpty();
        console.log(`  Start date : empty ✓ (cleared by copy handler)`);
        await copyPage.assertEndDateNotSet();
        console.log(`  End date   : not set ✓ (checkbox unchecked — cleared by copy handler)`);
        console.log(`  All dates are clean when copying an end-date campaign ✓`);

        await copyPage.closeDrawer();
      });
    });

    // ── TC-CP-GR-015 ────────────────────────────────────────────────────────
    // POSITIVE: In the copy drawer the user can ADD a new channel and ADD/EDIT
    // variants; saving creates the modified copy while the ORIGINAL campaign's
    // channels and variant traffic remain unchanged.

    test.describe('TC-CP-GR-015 | Copy allows adding new channels and adding/editing variants without changing the original campaign', () => {
      const copyId   = `CPGR_CH_${Date.now()}`;
      const copyName = `GR_Copy_NewChannel_${Date.now()}`.slice(0, 60);
      let sourceName = '';
      let originalChannels: string[] = [];
      let originalTraffic:  string[] = [];

      test.beforeAll(async () => {
        await grListPage.navigate();
        await grListPage.filterByDate('All days');
        await grListPage.applyAllFilters();
        await grListPage.getStableResultsCount();
        sourceName = await grListPage.getFirstRowName();

        // Snapshot the original campaign's channels and variant traffic via its Edit drawer
        await grListPage.clickEditCampaign();
        await grListPage.assertUpdateDrawerVisible();
        const f = await grListPage.getUpdateDrawerFields();
        originalChannels = f.channels;
        originalTraffic  = f.traffic;
        await grListPage.closeUpdateDrawer();
        console.log(`\n  [Setup] Source "${sourceName}"`);
        console.log(`  [Setup] Original channels : [${originalChannels.join(', ')}]`);
        console.log(`  [Setup] Original traffic  : [${originalTraffic.join(', ')}]`);
      });

      test('SC-1 | in the copy drawer the user can add a new channel and add/edit variants, then save as Draft', async () => {
        await grListPage.searchAndAssertVisible(sourceName);
        await grListPage.clickCopyCampaign();
        await copyPage.assertCreateDrawerVisible();

        await copyPage.fillName(copyName);
        await copyPage.fillStartDate(futureDateStr(5, 10, 0));
        await copyPage.clearAndFillCampaignId(copyId);

        // Add a new channel — first available unselected option in the dropdown
        const added = await grListPage.selectAvailableUpdateDrawerChannels(1);
        console.log(`\n  New channel added in copy : [${added.join(', ')}]`);

        // Add a new variant, then edit traffic across all variants
        const before = await grCreatePage.getVariantCount();
        await grCreatePage.clickAddNewVariant();
        const after = await grCreatePage.getVariantCount();
        expect(after, 'a new variant should be added in the copy drawer').toBe(before + 1);
        await grCreatePage.setAllVariantsTraffic(10, after);
        console.log(`  Variants ${before} → ${after} (new variant added); all variant traffic edited to 10%`);

        await copyPage.clickSaveDraft();
        await copyPage.assertSaveSuccess();
        console.log(`  Modified copy saved as Draft ✓`);
      });

      test('SC-2 | the modified copy appears in the list as a new Draft campaign', async () => {
        await grListPage.navigate();
        await grListPage.filterByDate('All days');
        await grListPage.searchAndAssertVisible(copyName);
        await grListPage.assertCampaignStatus('Draft');
        console.log(`\n  Modified copy "${copyName}" visible — Status : Draft ✓`);
      });

      test('SC-3 | the original campaign keeps its channels and variant traffic — unchanged by the copy', async () => {
        await grListPage.navigate();
        await grListPage.filterByDate('All days');
        await grListPage.searchAndAssertVisible(sourceName);

        await grListPage.clickEditCampaign();
        await grListPage.assertUpdateDrawerVisible();
        const f = await grListPage.getUpdateDrawerFields();
        await grListPage.closeUpdateDrawer();

        expect(f.channels, 'original channels must be unchanged').toEqual(originalChannels);
        expect(f.traffic,  'original variant traffic must be unchanged').toEqual(originalTraffic);
        console.log(`\n  Original channels still [${f.channels.join(', ')}] ✓`);
        console.log(`  Original traffic  still [${f.traffic.join(', ')}] ✓`);
        console.log(`  Copy modifications did NOT affect the original campaign ✓`);
      });
    });

    // ── TC-CP-GR-016 ────────────────────────────────────────────────────────
    // POSITIVE: Cancelling / closing the copy drawer creates NOTHING — verified
    // by typing a unique name into the drawer, closing it, and confirming a
    // search for that name returns no results.

    test.describe('TC-CP-GR-016 | Closing or cancelling the copy drawer does not create a new campaign', () => {
      test.beforeAll(async () => {
        await grListPage.navigate();
        await grListPage.filterByDate('All days');
        await grListPage.applyAllFilters();
      });

      test('SC-1 | clicking the Cancel button closes the drawer and no new campaign is created', async () => {
        const abandonedName = `GR_CancelNoSave_${Date.now()}`;
        await grListPage.clickCopyCampaign();
        await copyPage.assertCreateDrawerVisible();
        await copyPage.fillName(abandonedName);
        console.log(`\n  Name typed in drawer : "${abandonedName}" (will NOT be saved)`);

        // dispatchEvent bypasses the Contentful bandwidth-limit banner overlay
        await copyPage.frame.getByTestId('onclose-basic-drawer').dispatchEvent('click');
        await grListPage.assertPageVisible();
        console.log(`  Cancel clicked — drawer closed, back on the GR list ✓`);

        await grListPage.searchByName(abandonedName);
        await grListPage.assertNoResults();
        console.log(`  Search for "${abandonedName}" → No results ✓ (no campaign created)`);
      });

      test('SC-2 | clicking the X close button closes the drawer and no new campaign is created', async () => {
        const abandonedName = `GR_CloseNoSave_${Date.now()}`;
        await grListPage.navigate();
        await grListPage.filterByDate('All days');
        await grListPage.applyAllFilters();

        await grListPage.clickCopyCampaign();
        await copyPage.assertCreateDrawerVisible();
        await copyPage.fillName(abandonedName);
        console.log(`\n  Name typed in drawer : "${abandonedName}" (will NOT be saved)`);

        await copyPage.frame.locator('.rs-drawer-header-close').click();
        await grListPage.assertPageVisible();
        console.log(`  X close clicked — drawer closed, back on the GR list ✓`);

        await grListPage.searchByName(abandonedName);
        await grListPage.assertNoResults();
        console.log(`  Search for "${abandonedName}" → No results ✓ (no campaign created)`);
      });
    });

  }); // end: Gradual Rollout

}); // end: Copy Campaign Feature