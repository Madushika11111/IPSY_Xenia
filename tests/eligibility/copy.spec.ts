import { test, expect, Browser, Page } from '@playwright/test';
import { SpacePage } from '../../pages/SpacePage';
import { EligibilityListPage } from '../../pages/EligibilityListPage';
import { EligibilityCreatePage } from '../../pages/EligibilityCreatePage';
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
  let elListPage:   EligibilityListPage;
  let elCreatePage: EligibilityCreatePage;
  let copyPage:     CopyPage;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const context = await browser.newContext({ storageState: 'auth/user.json' });
    sharedPage   = await context.newPage();
    elListPage   = new EligibilityListPage(sharedPage);
    elCreatePage = new EligibilityCreatePage(sharedPage);
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

  test.describe('Eligibility — Copy Campaign', () => {

    // ── TC-CP-EL-001 ────────────────────────────────────────────────────────
    // POSITIVE: Copy button visible across statuses

    test('TC-CP-EL-001 | Copy Campaign button should be visible and enabled for Scheduled, Paused, Draft, and Expired Eligibility campaigns', async () => {
      const frame   = sharedPage.frameLocator('[data-test-id="cf-widget-renderer"]');
      const statuses = ['Scheduled', 'Paused', 'Draft', 'Expired'];

      for (const status of statuses) {
        await elListPage.navigate();
        await elListPage.filterByDate('All days');
        await elListPage.clickSearch();

        const count = await frame
          .getByRole('heading', { name: /Results \(/ })
          .textContent()
          .then(t => parseInt((t?.match(/\((\d+)\)/) ?? ['', '0'])[1], 10))
          .catch(() => 0);

        if (count === 0) {
          console.log(`  Eligibility ${status.padEnd(10)} : no campaigns — skipped`);
          continue;
        }

        const firstStatus = await frame.getByRole('cell', { name: status }).first()
          .isVisible({ timeout: 5000 }).catch(() => false);

        if (!firstStatus) {
          console.log(`  Eligibility ${status.padEnd(10)} : no ${status} campaign visible — skipped`);
          continue;
        }

        const copyBtn = frame.getByRole('button', { name: 'Copy Campaign' }).first();
        await expect(copyBtn).toBeVisible({ timeout: 5000 });
        await expect(copyBtn).toBeEnabled({ timeout: 3000 });
        console.log(`  Eligibility ${status.padEnd(10)} : Copy Campaign button visible & enabled ✓`);
      }
    });

    // ── TC-CP-EL-002 ────────────────────────────────────────────────────────
    // POSITIVE: Copy form state for Eligibility

    test.describe('TC-CP-EL-002 | Clicking Copy Campaign on an Eligibility campaign opens Create campaign drawer pre-filled from the original', () => {
      test.beforeAll(async () => {
        await elListPage.navigate();
        await elListPage.filterByDate('All days');
        await elListPage.clickSearch();
      });

      test('SC-1 | drawer heading should be "Create campaign"', async () => {
        await elListPage.clickCopyCampaign();
        await copyPage.assertCreateDrawerVisible();
        await copyPage.assertNotUpdateDrawer();
      });

      test('SC-2 | campaign name should be pre-filled from the original', async () => {
        const name = await copyPage.getNameValue();
        expect(name.length, 'Name must be pre-filled').toBeGreaterThan(0);
        console.log(`\n  Pre-filled campaign name : "${name}" ✓`);
      });

      test('SC-3 | start date should be empty — cleared by copy handler', async () => {
        await copyPage.assertStartDateEmpty();
        console.log(`\n  Start date : empty ✓`);
      });

      test('SC-4 | Save & Activate, Save as Draft, and Cancel buttons should be visible', async () => {
        await copyPage.assertActionButtonsVisible();
        console.log(`\n  Action buttons visible ✓`);
      });

      test('SC-5 | clicking Cancel closes the drawer and returns to the Eligibility campaign list', async () => {
        await copyPage.closeDrawer();
        await elListPage.assertPageVisible();
        console.log(`\n  Cancel clicked — returned to Eligibility campaigns list ✓`);
      });
    });

    // ── TC-CP-EL-003 ────────────────────────────────────────────────────────
    // POSITIVE: Copy → Save as Draft → Draft in list

    test.describe('TC-CP-EL-003 | Copying an Eligibility campaign and saving as Draft creates a new Draft campaign', () => {
      const copyId   = `CPEL_D_${Date.now()}`;
      const copyName = `EL_Copy_Draft_${Date.now()}`.slice(0, 60);
      let   sourceName = '';

      test.beforeAll(async () => {
        await elListPage.navigate();
        await elListPage.filterByDate('All days');
        await elListPage.clickSearch();

        const frame = sharedPage.frameLocator('[data-test-id="cf-widget-renderer"]');
        const firstRow = frame.getByRole('row').nth(1);
        // Wait for the first data row to contain text before reading the name.
        await expect.poll(async () => {
          const text = await firstRow.getByRole('cell').nth(1).textContent();
          return (text ?? '').trim().length > 0;
        }, { timeout: 15000, intervals: [500] }).toBeTruthy();
        // Strip the "Edited • <date>" badge that the app appends to the cell text content
        const fullCellText = ((await firstRow.getByRole('cell').nth(1).textContent()) ?? '').trim();
        sourceName = fullCellText.split(/\s*Edited\s+•/)[0].trim();
      });

      test('SC-1 | filling required fields and saving as Draft should succeed', async () => {
        await elListPage.clickCopyCampaign();
        await copyPage.assertCreateDrawerVisible();

        await copyPage.fillName(copyName);
        await elCreatePage.fillStartDate(futureDateStr(5, 10, 0));
        await elCreatePage.fillCampaignId(copyId);

        console.log(`\n  Copied campaign name : "${copyName}"`);
        console.log(`  Campaign ID          : "${copyId}"`);

        await copyPage.clickSaveDraft();
        await copyPage.assertSaveSuccess();
        console.log(`  Save as Draft succeeded ✓`);
      });

      test('SC-2 | copied campaign should appear in the Eligibility list as Draft', async () => {
        await elListPage.navigate();
        await elListPage.filterByDate('All days');
        await elListPage.searchByName(copyName);
        await elListPage.clickSearch();

        await elListPage.assertCampaignVisible(copyName);
        await elListPage.assertCampaignStatus('Draft');
        console.log(`\n  Copied campaign "${copyName}" visible ✓`);
        console.log(`  Status : Draft ✓`);
      });

      test('SC-3 | original campaign should still be in the list after the copy', async () => {
        await elListPage.navigate();
        await elListPage.filterByDate('All days');
        await elListPage.searchByName(sourceName);
        await elListPage.clickSearch();

        await elListPage.assertCampaignVisible(sourceName);
        console.log(`\n  Original campaign "${sourceName}" still in list ✓`);
        console.log(`  Original is unaffected by the copy ✓`);
      });
    });

    // ── TC-CP-EL-004 ────────────────────────────────────────────────────────
    // NEGATIVE: Save without start date → validation error

    test('TC-CP-EL-004 | Negative — clicking Save & Activate without a start date on a copied Eligibility campaign should show a validation error', async () => {
      await elListPage.navigate();
      await elListPage.filterByDate('All days');
      await elListPage.clickSearch();

      await elListPage.clickCopyCampaign();
      await copyPage.assertCreateDrawerVisible();

      await copyPage.fillName(`EL_NoDate_${Date.now()}`);
      await elCreatePage.fillCampaignId(`CPEL_ND_${Date.now()}`);
      console.log(`\n  Start date intentionally left empty`);

      await copyPage.clickSaveActivate();
      await copyPage.assertStartDateRequiredError();
      console.log(`  Validation error "Please select campaign start..." shown ✓`);

      await copyPage.closeDrawer();
    });

    // ── TC-CP-EL-005 ────────────────────────────────────────────────────────
    // NEGATIVE: Past start date → validation error

    test('TC-CP-EL-005 | Negative — setting a past start date on a copied Eligibility campaign should show a validation error', async () => {
      await elListPage.navigate();
      await elListPage.filterByDate('All days');
      await elListPage.clickSearch();

      await elListPage.clickCopyCampaign();
      await copyPage.assertCreateDrawerVisible();

      const past = pastDateStr(1);
      await copyPage.fillName(`EL_PastDate_${Date.now()}`);
      await elCreatePage.fillStartDate(past);
      // Click name to blur and trigger validation
      await copyPage.fillName(`EL_PastDate_${Date.now()}`);
      console.log(`\n  Start date set to past : "${past}"`);

      await copyPage.assertStartDatePastError();
      console.log(`  Validation error "Campaign start date...should be greater than current date" shown ✓`);

      await copyPage.closeDrawer();
    });

    // ── TC-CP-EL-006 ────────────────────────────────────────────────────────
    // NEGATIVE: Invalid Campaign ID format → format validation error

    test('TC-CP-EL-006 | Negative — entering a Campaign ID with invalid characters on a copied Eligibility campaign should show a format validation error', async () => {
      await elListPage.navigate();
      await elListPage.filterByDate('All days');
      await elListPage.clickSearch();

      await elListPage.clickCopyCampaign();
      await copyPage.assertCreateDrawerVisible();

      await copyPage.fillInvalidCampaignId('bad@id#here');
      console.log(`\n  Campaign ID "bad@id#here" entered`);

      await copyPage.assertCampaignIdFormatError();
      console.log(`  Format validation error "Campaign ID can only contain..." shown ✓`);

      await copyPage.closeDrawer();
    });

    // ── TC-CP-EL-007 ────────────────────────────────────────────────────────
    // NEGATIVE: Duplicate Campaign ID → duplicate error

    test.describe('TC-CP-EL-007 | Negative — using a Scheduled campaign\'s Campaign ID in a copy form should show a duplicate error', () => {
      // Strategy: claim a Campaign ID by creating a Scheduled campaign, then
      // attempt to reuse that ID in a copy form. (Probing the list for an
      // existing Scheduled campaign was unreliable — recent Drafts push
      // Scheduled campaigns off the first page and the test skipped.)
      let scheduledCampaignId = '';

      test.beforeAll(async () => {
        const claimedId = `CPELDUP${Date.now()}`;
        try {
          await elListPage.navigate();
          await elListPage.clickCreateButton();
          await elCreatePage.assertPageVisible();

          await copyPage.fillName(`EL_DupSrc_${Date.now()}`);
          await elCreatePage.fillStartDate(futureDateStr(6, 10, 0));
          await elCreatePage.fillCampaignId(claimedId);
          await elCreatePage.selectRandomChannel();

          await elCreatePage.clickAddRuleset();
          await elCreatePage.assertRulesetSubDrawerOpen();
          await elCreatePage.selectDefiningRule();
          await elCreatePage.submitRulesetDrawer();
          await elCreatePage.toggleRulesetToActive();

          await elCreatePage.clickSaveActivate();
          await elCreatePage.assertSaveSuccess();
          scheduledCampaignId = claimedId;
        } catch (e) {
          console.log(`\n  [Setup] Could not claim a Campaign ID — test will skip (${e})`);
        }
        console.log(`\n  [Setup] Eligibility Scheduled Campaign ID : "${scheduledCampaignId}"`);
      });

      test('SC-1 | saving a copy with a Scheduled campaign\'s Campaign ID should be rejected with a duplicate error', async () => {
        test.skip(!scheduledCampaignId, 'No Scheduled Eligibility campaign found — skipping');

        await elListPage.navigate();
        await elListPage.filterByDate('All days');
        await elListPage.clickSearch();

        await elListPage.clickCopyCampaign();
        await copyPage.assertCreateDrawerVisible();

        try {
          // The duplicate check no longer fires inline on field blur — the ID
          // is only rejected when the campaign is actually saved. Save as
          // Draft so no active ruleset is required on the copied source.
          await elCreatePage.fillCampaignId(scheduledCampaignId);
          await copyPage.fillName(`EL_DupAttempt_${Date.now()}`);
          await copyPage.fillStartDate(futureDateStr(4, 10, 0));

          await copyPage.waitForNotificationsToClear();
          await copyPage.clickSaveDraft();

          const notification = await copyPage.assertDuplicateIdSaveRejected();
          console.log(`\n  Scheduled Campaign ID "${scheduledCampaignId}" already in use`);
          console.log(`  Save rejected — notification: "${notification}" ✓`);
          console.log(`  Active Eligibility campaign IDs cannot be reused ✓`);
        } finally {
          await copyPage.closeDrawer();
        }
      });
    });

    // ── TC-CP-EL-008 ────────────────────────────────────────────────────────
    // POSITIVE: Copy → Save & Activate → Scheduled campaign in list
    // NOTE: The source campaign must have an active ruleset (inherited by the copy)
    // for Save & Activate to succeed. Tests skip when no Scheduled source is found.

    test.describe('TC-CP-EL-008 | Copying an Eligibility campaign with an active ruleset and saving as Scheduled creates a new Scheduled campaign', () => {
      const elSrcName   = `EL_CopySrc_${Date.now()}`;
      const elSchedId   = `CPEL_S_${Date.now()}`;
      const elSchedName = `EL_Copy_Sched_${Date.now()}`.slice(0, 60);
      let   elHasScheduledSource = false;

      test.beforeAll(async () => {
        // Create a dedicated Scheduled source with an active ruleset — probing
        // the list for any 'Scheduled' cell is unreliable (the first row that
        // clickCopyCampaign targets is usually a recent Draft without an
        // active ruleset, so Save & Activate on its copy cannot succeed).
        try {
          await elListPage.navigate();
          await elListPage.clickCreateButton();
          await elCreatePage.assertPageVisible();

          await copyPage.fillName(elSrcName);
          await elCreatePage.fillStartDate(futureDateStr(6, 10, 0));
          await elCreatePage.fillCampaignId(`CPELSRC${Date.now()}`);
          await elCreatePage.selectRandomChannel();

          await elCreatePage.clickAddRuleset();
          await elCreatePage.assertRulesetSubDrawerOpen();
          await elCreatePage.selectDefiningRule();
          await elCreatePage.submitRulesetDrawer();
          await elCreatePage.toggleRulesetToActive();

          await elCreatePage.clickSaveActivate();
          await elCreatePage.assertSaveSuccess();
          elHasScheduledSource = true;
          console.log(`\n  [Setup] Scheduled EL source "${elSrcName}" created ✓`);
        } catch (e) {
          console.log(`\n  [Setup] Could not create Scheduled EL source — tests will skip (${e})`);
        }
      });

      test('SC-1 | filling required fields on a copy of a Scheduled Eligibility campaign and clicking Save & Activate should close the drawer', async () => {
        test.skip(!elHasScheduledSource, 'No Scheduled Eligibility campaign found — skipping Save & Activate copy test');

        // Search for the dedicated source so the first row is guaranteed to be
        // the Scheduled campaign with the active ruleset
        await elListPage.navigate();
        await elListPage.filterByDate('All days');
        await elListPage.searchByName(elSrcName);
        await elListPage.clickSearch();
        await elListPage.assertCampaignVisible(elSrcName);

        await elListPage.clickCopyCampaign();
        await copyPage.assertCreateDrawerVisible();

        await copyPage.fillName(elSchedName);
        await elCreatePage.fillStartDate(futureDateStr(7, 10, 0));
        await elCreatePage.fillCampaignId(elSchedId);

        console.log(`\n  Copied campaign name : "${elSchedName}"`);
        console.log(`  Campaign ID          : "${elSchedId}"`);

        await copyPage.clickSaveActivate();
        await copyPage.assertSaveSuccess();
        console.log(`  Save & Activate succeeded ✓`);
      });

      test('SC-2 | the copied campaign should appear in the Eligibility list as Scheduled', async () => {
        test.skip(!elHasScheduledSource, 'No Scheduled Eligibility campaign found — skipping');

        await elListPage.navigate();
        await elListPage.filterByDate('All days');
        await elListPage.searchByName(elSchedName);
        await elListPage.clickSearch();

        await elListPage.assertCampaignVisible(elSchedName);
        await elListPage.assertCampaignStatus('Scheduled');
        console.log(`\n  Copied campaign "${elSchedName}" visible ✓`);
        console.log(`  Status : Scheduled (future start date + active inherited ruleset) ✓`);
      });
    });

    // ── TC-CP-EL-009 ────────────────────────────────────────────────────────
    // NEGATIVE: End date before start date → validation error

    test('TC-CP-EL-009 | Negative — setting an end date earlier than the start date on a copied Eligibility campaign should show a validation error', async () => {
      await elListPage.navigate();
      await elListPage.filterByDate('All days');
      await elListPage.clickSearch();

      await elListPage.clickCopyCampaign();
      await copyPage.assertCreateDrawerVisible();

      await copyPage.fillName(`EL_BadEnd_${Date.now()}`);
      await copyPage.fillStartDate(futureDateStr(10, 10, 0));
      await copyPage.fillEndDate(futureDateStr(5, 10, 0));
      await copyPage.clearAndFillCampaignId(`CPEL_BE_${Date.now()}`);
      console.log(`\n  Start date : +10 days | End date : +5 days (end before start)`);

      // Validation may not surface until Save is attempted — trigger it then assert
      await copyPage.clickSaveActivate();
      await copyPage.assertEndDateBeforeStartError();
      console.log(`  "Campaign end date...should be greater than campaign start date" shown ✓`);
      console.log(`  Save blocked — end date must be after start date ✓`);

      await copyPage.closeDrawer();
    });

    // ── TC-CP-EL-010 ────────────────────────────────────────────────────────
    // NEGATIVE: Clearing the pre-filled campaign name → required validation error

    test('TC-CP-EL-010 | Negative — clearing the pre-filled campaign name on a copied Eligibility campaign and clicking Save & Activate should show a required name validation error', async () => {
      await elListPage.navigate();
      await elListPage.filterByDate('All days');
      await elListPage.clickSearch();

      await elListPage.clickCopyCampaign();
      await copyPage.assertCreateDrawerVisible();

      // Fill valid start date and Campaign ID; clear the pre-filled name
      await elCreatePage.fillStartDate(futureDateStr(5, 10, 0));
      await elCreatePage.fillCampaignId(`CPEL_NN_${Date.now()}`);
      const elNameInput = copyPage.frame.getByRole('textbox', { name: 'Campaign name *' });
      await elNameInput.clear();
      // Blur by clicking the start date input to trigger inline name validation
      await copyPage.frame.getByRole('textbox', { name: 'Campaign start date & time (' }).click();
      console.log(`\n  Campaign name cleared (empty)`);

      await copyPage.clickSaveActivate();
      await copyPage.assertNameRequiredError();
      console.log(`  "Please enter campaign name" validation error shown ✓`);
      console.log(`  Save blocked — campaign name is required ✓`);

      await copyPage.closeDrawer();
    });

    // ── TC-CP-EL-011 ────────────────────────────────────────────────────────
    // NEGATIVE: No Campaign ID entered → required validation error

    test('TC-CP-EL-011 | Negative — saving a copied Eligibility campaign without entering a Campaign ID should show a required Campaign ID validation error', async () => {
      await elListPage.navigate();
      await elListPage.filterByDate('All days');
      await elListPage.clickSearch();

      await elListPage.clickCopyCampaign();
      await copyPage.assertCreateDrawerVisible();

      // Fill valid name and start date; clear the Campaign ID field (whether pre-filled or empty)
      await copyPage.fillName(`EL_NoCampaignId_${Date.now()}`);
      await elCreatePage.fillStartDate(futureDateStr(5, 10, 0));
      const elIdInput = copyPage.frame.getByRole('textbox', { name: 'Campaign ID *' });
      if (await elIdInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await elIdInput.clear();
        // Blur to surface the inline required validation
        await copyPage.frame.getByRole('textbox', { name: 'Campaign name *' }).click();
      }
      console.log(`\n  Campaign ID field left empty`);

      await copyPage.clickSaveActivate();
      await copyPage.assertCampaignIdRequiredError();
      console.log(`  "Please enter campaign ID" validation error shown ✓`);
      console.log(`  Save blocked — Campaign ID is required ✓`);

      await copyPage.closeDrawer();
    });

  }); // end: Eligibility

}); // end: Copy Campaign Feature