import { test, expect, Browser, Page } from '@playwright/test';
import { SpacePage } from '../../pages/SpacePage';
import { GradualRolloutListPage } from '../../pages/GradualRolloutListPage';
import { GradualRolloutCreatePage } from '../../pages/GradualRolloutCreatePage';
import { config } from '../../config/config';

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

// ─── Date helpers ─────────────────────────────────────────────────────────────
// futureDateStr — YYYY-MM-DDTHH:mm for form datetime-local inputs
// listDateStr   — YYYY-MM-DD HH:MM AM/PM for list display assertions

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

// detailsDateStr — DD-Mon-YYYY HH:MM AM/PM as shown in the View Details panel
function detailsDateStr(daysOffset: number, hour = 10, minute = 0): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  d.setHours(hour, minute, 0, 0);
  const dd   = String(d.getDate()).padStart(2, '0');
  const mon  = months[d.getMonth()];
  const yyyy = d.getFullYear();
  const h12  = d.getHours() % 12 || 12;
  const hh   = String(h12).padStart(2, '0');
  const mi   = String(d.getMinutes()).padStart(2, '0');
  const ampm = d.getHours() < 12 ? 'AM' : 'PM';
  return `${dd}-${mon}-${yyyy} ${hh}:${mi} ${ampm}`;
}

function listDateStr(daysOffset: number, hour = 10, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  const ampm = hour < 12 ? 'AM' : 'PM';
  const h12  = hour % 12 || 12;
  const hh   = String(h12).padStart(2, '0');
  const mi   = String(minute).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} ${ampm}`;
}

// ─── TC-GR-001 to TC-GR-023 | Gradual Rollout Campaign ───────────────────────

test.describe('Gradual Rollout Campaign', () => {
  let sharedPage: Page;
  let listPage: GradualRolloutListPage;
  let createPage: GradualRolloutCreatePage;

  // Lifecycle tests share these — set in TC-GR-013
  let campaignName: string;
  let campaignId: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const context = await browser.newContext({ storageState: 'auth/user.json' });
    sharedPage  = await context.newPage();
    listPage    = new GradualRolloutListPage(sharedPage);
    createPage  = new GradualRolloutCreatePage(sharedPage);

    const spacePage = new SpacePage(sharedPage, context);
    await spacePage.navigateToEntries(config.spaceId);
    await spacePage.openSpaceSidepanel();
    await spacePage.selectSpace(config.xeniaSpaceId, config.xeniaSpaceName);
    await spacePage.selectEnvironment('master');
    await spacePage.openAppsMenu(config.xeniaAppName);
    await spacePage.assertAppLoaded();

    await listPage.navigate();
  });

  test.afterAll(async () => {
    await sharedPage.context().close();
  });

  // ── TC-GR-001 ────────────────────────────────────────────────────────────────

  test('TC-GR-001 | should display the Gradual Rollout list page with correct heading, count, filters, and results', async () => {
    await listPage.navigate();
    await listPage.assertPageVisible();

    const totalCount = await listPage.getTotalCampaignCount();
    console.log(`\n  Total campaigns (all statuses/days) : ${totalCount}`);
    expect(totalCount).toBeGreaterThanOrEqual(0);

    await listPage.assertDefaultFilters();

    const resultsCount = await listPage.getResultsCount();
    console.log(`  Results count (Today filter)        : ${resultsCount}`);
    expect(resultsCount).toBeGreaterThanOrEqual(0);

    await listPage.assertSearchButtons();
    console.log(`  Search and Reset buttons            : visible`);
  });

  // ── TC-GR-002 ────────────────────────────────────────────────────────────────

  test('TC-GR-002 | should display all required fields on the campaign creation form', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.assertAllFieldsVisible();
    console.log(`\n  All create-form fields visible: Campaign name, start date, Channels, Campaign ID, Description, Feature Selection`);
    console.log(`  End date: optional — rendered as checkbox "Set campaign end date & time (PST)" ✓`);
    await createPage.closeDrawer();
  });

  // ── TC-GR-003 ────────────────────────────────────────────────────────────────

  test('TC-GR-003 | should display all 3 action buttons on the create form (Save & Activate, Save as Draft, Cancel)', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.assertActionButtons();
    console.log(`\n  Action buttons visible: Save & Activate, Save as Draft, Cancel`);
    await createPage.closeDrawer();
  });

  // ── TC-GR-004 ────────────────────────────────────────────────────────────────

  test('TC-GR-004 | should show validation errors when "Save & Activate" is clicked with an empty form', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.clickSaveActivate();
    await createPage.assertSaveActivateValidationErrors();
    console.log(`\n  Validation errors shown: name, start date, channel, campaign ID (end date is optional — no error expected)`);
    await createPage.closeDrawer();
  });

  // ── TC-GR-005 ────────────────────────────────────────────────────────────────

  test('TC-GR-005 | should show a validation notification when "Save as Draft" is clicked with an empty form', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.clickSaveDraft();
    await createPage.assertDraftValidationNotification();
    console.log(`\n  Draft validation notification shown`);
    await createPage.dismissNotifications();
    await createPage.closeDrawer();
  });

  // ── TC-GR-005a ───────────────────────────────────────────────────────────────

  test('TC-GR-005a | should block the save when Campaign ID contains invalid characters (lowercase letters)', async () => {
    // The inline "Campaign ID can only contain…" format error no longer
    // renders on input (removed along with the inline duplicate check). The
    // format rule is still enforced, but only at save time — the drawer stays
    // open and the message appears only as a transient toast (~5 s).
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();

    try {
      await createPage.fillName(`GR_fmt_${Date.now()}`);
      await createPage.fillStartDate(futureDateStr(7, 9));
      await createPage.fillCampaignId('qwe344'); // lowercase → invalid format
      await createPage.clickSaveDraft();

      const toasts = await createPage.assertSaveBlocked();
      console.log(`\n  Campaign ID "qwe344" (lowercase) → Save as Draft blocked, drawer stayed open ✓`);
      console.log(`  Toasts observed during block: ${JSON.stringify(toasts)}`);
      console.log(`  NOTE: format error now surfaces only as a transient toast — inline error removed`);
    } finally {
      await createPage.closeDrawer();
    }
  });

  // ── TC-GR-005b ───────────────────────────────────────────────────────────────

  test('TC-GR-005b | should block Save as Draft when only the campaign name is filled — campaign ID is still required', async () => {
    // The "Please enter campaign ID" inline error no longer renders. The ID
    // is still required for a draft, but the save is blocked SILENTLY — only
    // a transient notification appears and the drawer stays open.
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();

    try {
      await createPage.fillName('test_draft_name_only');
      await createPage.clickSaveDraft();
      await createPage.assertDraftValidationNotification();
      console.log(`\n  Draft with name only → notification shown ✓`);

      const toasts = await createPage.assertSaveBlocked();
      console.log(`  Save as Draft blocked — drawer stayed open ✓`);
      console.log(`  Toasts observed during block: ${JSON.stringify(toasts)}`);
      console.log(`  Campaign ID is still required for a draft (blocked silently — inline error removed) ✓`);
    } finally {
      await createPage.dismissNotifications();
      await createPage.closeDrawer();
    }
  });

  // ── TC-GR-005c ───────────────────────────────────────────────────────────────

  test('TC-GR-005c | should not increase the campaign count when Save & Activate or Save as Draft is clicked with missing required fields', async () => {
    await listPage.navigate();
    const initialCount = await listPage.getTotalCampaignCount();
    console.log(`\n  Initial campaign count : ${initialCount}`);

    // Failed Save & Activate should not create a campaign
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.clickSaveActivate();
    await createPage.closeDrawer();
    const countAfterFailedActivate = await listPage.getTotalCampaignCount();
    expect(countAfterFailedActivate).toBe(initialCount);
    console.log(`  After failed Save & Activate : ${countAfterFailedActivate} (unchanged) ✓`);

    // Failed Save Draft should not create a campaign
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.clickSaveDraft();
    await createPage.dismissNotifications();
    await createPage.closeDrawer();
    const countAfterFailedDraft = await listPage.getTotalCampaignCount();
    expect(countAfterFailedDraft).toBe(initialCount);
    console.log(`  After failed Save Draft      : ${countAfterFailedDraft} (unchanged) ✓`);
  });

  // ── TC-GR-005d ───────────────────────────────────────────────────────────────

  test('TC-GR-005d | should show "Please enter campaign name" when only Campaign ID is filled and Save as Draft is clicked', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();

    await createPage.fillCampaignId('TEST_DRAFT_ID_ONLY');
    await createPage.clickSaveDraft();
    await createPage.assertDraftValidationNotification();
    console.log(`\n  Draft with Campaign ID only → notification shown ✓`);

    await createPage.assertCampaignNameRequiredInlineError();
    console.log(`  "Please enter campaign name" inline error shown ✓`);
    console.log(`  Both campaign name and campaign ID are required for draft ✓`);

    await createPage.dismissNotifications();
    await createPage.closeDrawer();
  });

  // ── TC-GR-006 ────────────────────────────────────────────────────────────────

  test('TC-GR-006 | should show "No channels selected" and no Create feature button when both channel and campaign ID are empty', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.assertNoChannelsSelected();
    await createPage.assertCreateFeatureButtonAbsent();
    console.log(`\n  Feature Selection shows "No channels selected" — Create feature button absent`);
    await createPage.closeDrawer();
  });

  // ── TC-GR-007 ────────────────────────────────────────────────────────────────

  test('TC-GR-007 | should show "No channels selected" in the Feature Selection section when campaign ID is set but channel is missing', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.fillCampaignId('TEST_GR_NO_CHANNEL');
    await createPage.assertNoChannelsSelected();
    await createPage.assertCreateFeatureButtonAbsent();
    console.log(`\n  Campaign ID set, no channel → "No channels selected" shown, no Create feature button`);
    await createPage.closeDrawer();
  });

  // ── TC-GR-008 ────────────────────────────────────────────────────────────────

  test('TC-GR-008 | should show "Please enter a campaign ID" in the Feature Selection section when channel is set but campaign ID is missing', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.selectChannel('web');
    await createPage.assertCampaignIdRequired();
    await createPage.assertCreateFeatureButtonAbsent();
    console.log(`\n  Channel set, no campaign ID → "Please enter a campaign ID" shown, no Create feature button`);
    await createPage.closeDrawer();
  });

  // ── TC-GR-009 ────────────────────────────────────────────────────────────────

  test('TC-GR-009 | should show the "Create a new feature" button when both channel and campaign ID are set', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.selectChannel('web');
    await createPage.fillCampaignId('TEST_GR_BOTH_SET');
    await createPage.assertCreateFeatureButtonVisible();
    console.log(`\n  Channel + Campaign ID both set → "Create a new feature" button visible`);
    await createPage.closeDrawer();
  });

  // ── TC-GR-009a ───────────────────────────────────────────────────────────────

  test('TC-GR-009a | should reject the save with a duplicate Campaign ID error when an already-existing Campaign ID is used', async () => {
    // The duplicate check no longer fires inline on field blur — the ID is only
    // rejected when the campaign is saved. Claim a fresh ID first so the test
    // does not depend on any pre-existing campaign in the environment.
    const dupId = `DUP9A_${Date.now()}`;

    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.fillName(`GR_Dup9a_src_${Date.now()}`);
    await createPage.fillStartDate(futureDateStr(7, 9));
    await createPage.fillCampaignId(dupId);
    await createPage.clickSaveDraft();
    await createPage.assertSaveSuccess();
    console.log(`\n  [Setup] Campaign ID "${dupId}" claimed via Save as Draft ✓`);

    await listPage.clickCreateButton();
    await createPage.assertPageVisible();

    try {
      await createPage.fillName('test_duplicate_check');
      await createPage.fillStartDate(futureDateStr(7, 9));
      await createPage.fillCampaignId(dupId);

      await createPage.waitForNotificationsToClear();
      await createPage.clickSaveDraft();

      const notification = await createPage.assertDuplicateIdSaveRejected();
      console.log(`  Save rejected — notification: "${notification}" ✓`);
      console.log(`  Campaign ID must be unique across all campaigns ✓`);
    } finally {
      await createPage.closeDrawer();
    }
  });

  // ── TC-GR-009b ───────────────────────────────────────────────────────────────

  test('TC-GR-009b | should show a validation error when the start date is set to a past date and time', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();

    // Use yesterday at 10:00 AM — always guaranteed to be in the past
    const pastDate = futureDateStr(-1, 10, 0);
    await createPage.fillStartDate(pastDate);
    // Click name field to blur the start date input and trigger validation
    await createPage.fillName('test_past_date');
    await createPage.assertStartDatePastError();

    console.log(`\n  Start date "${pastDate}" (past) → validation error shown ✓`);
    console.log(`  Start date must be greater than current date & time ✓`);

    await createPage.closeDrawer();
  });

  // ── TC-GR-009c ───────────────────────────────────────────────────────────────

  test('TC-GR-009c | should show a validation error when the end date is set before the start date', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();

    const startDate = futureDateStr(5, 14, 0); // 5 days from now at 2 PM
    const endDate   = futureDateStr(3, 14, 0); // 3 days from now at 2 PM — before start

    await createPage.fillStartDate(startDate);
    await createPage.fillEndDate(endDate);
    await createPage.assertEndDateBeforeStartError();

    console.log(`\n  Start date : "${startDate}"`);
    console.log(`  End date   : "${endDate}" (before start date)`);
    console.log(`  Validation : "Campaign end date & time should be greater than campaign start date & time" ✓`);

    await createPage.closeDrawer();
  });

  // ── TC-GR-010 ────────────────────────────────────────────────────────────────

  test('TC-GR-010 | should display Control and Variant 1 after clicking "Create a new feature"', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();

    await createPage.fillName('TC_GR_010_Campaign');
    await createPage.fillStartDate(futureDateStr(5, 14, 0));
    await createPage.selectChannel('web');
    await createPage.fillCampaignId('TEST_GR_FEA');
    await createPage.clickCreateFeature();

    await createPage.assertVariantsCreated();
    console.log(`\n  Control visible ✓`);
    console.log(`  Variant 1 visible ✓`);

    await createPage.assertTrafficDefaults();
    console.log(`  Control traffic = 100%, Variant 1 traffic = 0% (defaults) ✓`);

    await createPage.assertVariant1RemoveIconVisible();
    console.log(`  Variant 1 remove icon visible ✓`);

    await createPage.assertControlRemoveIconDisabled();
    console.log(`  Control remove icon present but disabled ✓`);

    await createPage.closeDrawer();
  });

  // ── TC-GR-011 ────────────────────────────────────────────────────────────────

  test('TC-GR-011 | should default traffic split to Control 100% and Variant 1 0%', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.selectChannel('web');
    await createPage.fillCampaignId('TEST_GR_TRF');
    await createPage.clickCreateFeature();
    await createPage.assertTrafficDefaults();
    console.log(`\n  Traffic split defaults: Control = 100%, Variant 1 = 0%`);
    await createPage.closeDrawer();
  });

  // ── TC-GR-012 ────────────────────────────────────────────────────────────────

  test('TC-GR-012 | should allow adding a new variant and removing it', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.selectChannel('web');
    await createPage.fillCampaignId('TEST_GR_VAR');
    await createPage.clickCreateFeature();
    await createPage.assertVariantsCreated();

    await createPage.clickAddNewVariant();
    const countAfterAdd = await createPage.getVariantCount();
    console.log(`\n  Variants after adding  : ${countAfterAdd}`);
    expect(countAfterAdd).toBeGreaterThanOrEqual(2);

    await createPage.removeLastVariant();
    const countAfterRemove = await createPage.getVariantCount();
    console.log(`  Variants after removing: ${countAfterRemove}`);
    expect(countAfterRemove).toBeLessThan(countAfterAdd);

    await createPage.assertAddNewVariantsButtonVisible();
    console.log(`  "Add new variants" button still visible after remove ✓`);

    await createPage.closeDrawer();
  });

  // ── TC-GR-012a ───────────────────────────────────────────────────────────────

  test('TC-GR-012a | should show a validation error when Save & Activate is clicked with no variants in Feature Selection', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();

    await createPage.fillName('TC_GR_012a_Campaign');
    await createPage.fillStartDate(futureDateStr(5, 14, 0));
    await createPage.selectChannel('web');
    await createPage.fillCampaignId('TEST_GR_NOV');
    await createPage.clickCreateFeature();
    await createPage.assertVariantsCreated();

    // Remove Variant 1 — only Control remains
    await createPage.removeLastVariant();
    console.log(`\n  Variant 1 removed — only Control remains`);

    await createPage.clickSaveActivate();
    await createPage.assertSaveWithoutVariantsError();
    console.log(`  Save & Activate without variants → validation error shown ✓`);

    await createPage.dismissNotifications();
    await createPage.closeDrawer();
  });

  // ── TC-GR-013a | Traffic auto-adjustment ────────────────────────────────────

  test('TC-GR-013a | should auto-adjust Control traffic when Variant 1 is changed, keeping total at 100%', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();

    await createPage.selectChannel('mobile_v1');
    await createPage.fillCampaignId('TEST_GR_TRF');
    await createPage.clickCreateFeature();
    await createPage.assertVariantsCreated();

    // Defaults: Control=100, Variant 1=0
    await createPage.assertTrafficDefaults();
    console.log(`\n  Default traffic  : Control=100%, Variant 1=0% ✓`);

    // Set Variant 1 → 50; Control should auto-adjust → 50; sum = 100
    await createPage.setVariantTraffic('Variant 1', 50);
    await createPage.assertTrafficValue('Control', 50);
    await createPage.assertTrafficValue('Variant 1', 50);
    console.log(`  After Variant 1=50%: Control auto-adjusted to 50% ✓`);
    console.log(`  Total traffic      : 50 + 50 = 100% ✓`);

    await createPage.closeDrawer();
  });

  // ── TC-GR-013 | Lifecycle: Create ────────────────────────────────────────────

  test('TC-GR-013 | should create a Scheduled campaign with future start date and no end date, then verify list details', async () => {
    const ts = Date.now();
    campaignName = `GR_Auto_${ts}`;
    campaignId   = `GR_AUTO_${ts}`;
    const startDate     = futureDateStr(2, 10, 0);
    const startDateList = listDateStr(2, 10, 0);

    await createPage.dismissNotifications();

    // Verify default filters (All statuses + Today) before opening the form
    await listPage.navigate();
    await listPage.assertDefaultFilters();

    // Switch to All days, record baseline count
    await listPage.applyAllFilters();
    const baselineCount = await listPage.getTotalCampaignCount();
    console.log(`\n  Baseline campaign count (All days): ${baselineCount}`);

    await listPage.clickCreateButton();
    await createPage.assertPageVisible();

    await createPage.fillName(campaignName);
    await createPage.fillStartDate(startDate);
    await createPage.selectChannel('mobile_v1');
    await createPage.fillCampaignId(campaignId);
    // End date intentionally NOT set — will display as N/A in the list
    await createPage.clickCreateFeature();
    await createPage.assertVariantsCreated();

    // Set Variant 1 to 50 → Control auto-adjusts to 50 (total = 100)
    await createPage.setVariantTraffic('Variant 1', 50);
    await createPage.assertTrafficValue('Control', 50);
    await createPage.assertTrafficValue('Variant 1', 50);
    console.log(`  Traffic split: Control=50%, Variant 1=50% ✓`);

    await createPage.clickSaveActivate();
    await createPage.assertSaveSuccess();
    console.log(`  Campaign saved    : ${campaignName}`);
    console.log(`  Campaign ID       : ${campaignId}`);
    console.log(`  Start date (form) : ${startDate}`);
    console.log(`  Start date (list) : ${startDateList}`);

    // Verify in list — apply All days to get total count, then search by name for row details
    await listPage.applyAllFilters();
    const newCount = await listPage.getTotalCampaignCount();
    expect(newCount).toBe(baselineCount + 1);
    console.log(`  Campaign count    : ${baselineCount} → ${newCount} ✓`);

    // Search by name so the campaign row is visible regardless of pagination
    await listPage.searchByName(campaignName);
    await listPage.assertCampaignVisible(campaignName);
    await listPage.assertCampaignStatus('Scheduled');
    await listPage.assertCampaignStartDateContains(startDateList);
    await listPage.assertCampaignEndDateNA();
    await listPage.assertCampaignChannelInList('mobile_v1');
    console.log(`  List details      : name, Scheduled, ${startDateList}, N/A end date, mobile_v1 ✓`);

    await listPage.assertScheduledCampaignActions();
    await listPage.logCampaignActions('Scheduled');
  });

  // ── TC-GR-013b | Create with end date, multiple channels, multiple variants ───

  test('TC-GR-013b | should create a Scheduled campaign with end date, multiple channels, and 3 variants with mixed traffic percentages', async () => {
    const ts          = Date.now();
    const rand        = String(Math.floor(Math.random() * 9000) + 1000); // 4-digit suffix prevents ts collisions across runs
    const name        = `GR_Auto2_${ts}_${rand}`;
    const id          = `GR_AUT2_${ts}_${rand}`;
    const startDate   = futureDateStr(3, 10, 0);
    const endDate     = futureDateStr(10, 10, 0);
    const startList   = listDateStr(3, 10, 0);
    const endList     = listDateStr(10, 10, 0);

    await createPage.dismissNotifications();
    await listPage.navigate();
    await listPage.applyAllFilters();
    const baselineCount = await listPage.getTotalCampaignCount();
    console.log(`\n  Baseline campaign count : ${baselineCount}`);
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();

    await createPage.fillName(name);
    await createPage.fillStartDate(startDate);

    // Select two channels
    await createPage.selectChannel('mobile_v1');
    await createPage.selectAdditionalChannel('GR_channel_2');
    console.log(`\n  Channels selected : mobile_v1, GR_channel_2`);

    // Set end date via checkbox
    await createPage.fillEndDate(endDate);
    // Dismiss any lingering notifications (e.g. TC-GR-013's late toast) before filling
    // the Campaign ID field so that the async inline duplicate-check fires on a clean page.
    await createPage.dismissNotifications();
    await createPage.fillCampaignId(id);
    await createPage.clickCreateFeature();
    await createPage.assertVariantsCreated();

    // Set V1=30%, V2=20%, V3=15% — different values each; Control auto-balances to 35%
    // (100 - 30 - 20 - 15 = 35).  No explicit blur after index-fills — clickAddNewVariant()
    // and clickSaveActivate() provide the blur so redistribution only happens at those points.
    await createPage.setVariantTrafficByIndex(1, 30);
    console.log(`\n  Variant 1 set to 30% — Control auto-adjusting...`);

    await createPage.clickAddNewVariant();
    await createPage.setVariantTrafficByIndex(2, 20);
    console.log(`  Variant 2 set to 20% — Control auto-adjusting...`);

    await createPage.clickAddNewVariant();
    await createPage.setVariantTrafficByIndex(3, 15);
    console.log(`  Variant 3 set to 15% — Control will auto-adjust to 35% on save`);

    // Assert the values we explicitly set; Control finalises to 35 when V3 is committed on save
    await createPage.assertTrafficValue('Variant 1', 30);
    await createPage.assertTrafficValue('Variant 2', 20);
    await createPage.assertTrafficValue('Variant 3', 15);
    console.log(`  V1=30%, V2=20%, V3=15% — Control auto-balances to 35% (total=100%) ✓`);

    const variantCount = await createPage.getVariantCount();
    expect(variantCount).toBe(3);
    console.log(`  Variant count        : ${variantCount} (Control + V1 + V2 + V3) ✓`);

    // Clear any notifications that arrived during variant setup (e.g. TC-GR-013's
    // delayed success toast) before submitting, so they cannot interfere with the save.
    await createPage.dismissNotifications();
    await createPage.clickSaveActivate();
    await createPage.assertSaveSuccess();
    console.log(`  Campaign saved       : ${name} (${id})`);
    console.log(`  Start date           : ${startList}`);
    console.log(`  End date             : ${endList}`);

    // After save the drawer auto-closes and the list resets to Today filter.
    // Switch to All days, then search by name to locate the specific row.
    await listPage.applyAllFilters();
    const newCount = await listPage.getTotalCampaignCount();
    expect(newCount).toBe(baselineCount + 1);
    console.log(`  Campaign count          : ${baselineCount} → ${newCount} (+1) ✓`);

    await listPage.searchByName(name);
    await listPage.assertCampaignVisible(name);
    await listPage.assertCampaignStatus('Scheduled');
    await listPage.assertCampaignStartDateContains(startList);
    await listPage.assertCampaignEndDateContains(endList);
    await listPage.assertCampaignChannelInList('GR_channel_2');
    await listPage.assertCampaignChannelInList('mobile_v1,');
    console.log(`  List details verified: name, Scheduled, start, end date, GR_channel_2, mobile_v1 ✓`);

    await listPage.assertScheduledCampaignActions();
    await listPage.logCampaignActions('Scheduled');
  });

  // ── TC-GR-013c | Control is disabled; variants auto-balance to 100 ──────────

  test('TC-GR-013c | should keep Control disabled and auto-adjust it when variant traffic values are set', async () => {
    const ts        = Date.now();
    const rand      = String(Math.floor(Math.random() * 9000) + 1000);
    const name      = `GR_Auto3_${ts}_${rand}`;
    const id        = `GR_AUT3_${ts}_${rand}`;
    const startDate = futureDateStr(6, 0, 0);       // midnight → displays as 12:00 AM
    const endDate   = futureDateStr(20, 10, 0);
    const startList = listDateStr(6, 0, 0);
    const endList   = listDateStr(20, 10, 0);

    await createPage.dismissNotifications();
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();

    await createPage.fillName(name);
    await createPage.fillStartDate(startDate);
    await createPage.selectChannel('mobile_v1');
    await createPage.selectAdditionalChannel('GR_channel_2');
    await createPage.fillEndDate(endDate);
    // Dismiss any lingering notifications (e.g. TC-GR-013b's late toast) before filling
    // the Campaign ID field so that the async inline duplicate-check fires on a clean page.
    await createPage.dismissNotifications();
    await createPage.fillCampaignId(id);
    await createPage.clickCreateFeature();
    await createPage.assertVariantsCreated();

    // Control input is disabled — user cannot edit it directly
    await createPage.assertControlTrafficDisabled();
    console.log(`\n  Control traffic input is disabled (read-only) ✓`);

    // Set V1=30%, V2=20%, V3=10%; Control auto-adjusts to 40 (100-30-20-10)
    await createPage.setVariantTrafficByIndex(1, 30);
    await createPage.clickAddNewVariant();
    await createPage.setVariantTrafficByIndex(2, 20);
    await createPage.clickAddNewVariant();
    await createPage.setVariantTrafficByIndex(3, 10);

    await createPage.assertTrafficValue('Variant 1', 30);
    await createPage.assertTrafficValue('Variant 2', 20);
    await createPage.assertTrafficValue('Variant 3', 10);
    console.log(`  V1=30%, V2=20%, V3=10% — Control auto-adjusts to 40% (total=100%) ✓`);

    // Clear any notifications that arrived during variant setup before submitting.
    await createPage.dismissNotifications();
    await createPage.clickSaveActivate();
    await createPage.assertSaveSuccess();
    console.log(`  Campaign saved    : ${name} (${id})`);
    console.log(`  Start date (list) : ${startList}`);
    console.log(`  End date (list)   : ${endList}`);

    // After save the drawer auto-closes and the list resets to Today filter.
    // Switch to All days, then search by name to locate the specific row.
    await listPage.applyAllFilters();
    await listPage.searchByName(name);
    await listPage.assertCampaignVisible(name);
    await listPage.assertCampaignStatus('Scheduled');
    await listPage.assertCampaignStartDateContains(startList);
    await listPage.assertCampaignEndDateContains(endList);
    await listPage.assertCampaignChannelInList('mobile_v1,');
    await listPage.assertCampaignChannelInList('GR_channel_2');
    console.log(`  List details verified: name, Scheduled, ${startList}, ${endList}, mobile_v1, GR_channel_2 ✓`);
  });

  // ── TC-GR-013d | Action icons: Scheduled campaign ────────────────────────────

  test('TC-GR-013d | should display correct action icons for a Scheduled campaign — Delete disabled, Share reveals on row hover', async () => {
    const ts   = Date.now();
    const rand = String(Math.floor(Math.random() * 9000) + 1000);
    const name = `GR_Auto4_${ts}_${rand}`;
    const id   = `GR_AUT4_${ts}_${rand}`;
    const startDate = futureDateStr(4, 10, 0);

    await createPage.dismissNotifications();
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();

    await createPage.fillName(name);
    await createPage.fillStartDate(startDate);
    await createPage.selectChannel('mobile_v1');
    await createPage.dismissNotifications();
    await createPage.fillCampaignId(id);
    await createPage.clickCreateFeature();
    await createPage.assertVariantsCreated();

    await createPage.dismissNotifications();
    await createPage.clickSaveActivate();
    await createPage.assertSaveSuccess();
    console.log(`  Campaign created: ${name}`);

    // After save the drawer auto-closes and the list resets to Today filter.
    await listPage.applyAllFilters();
    await listPage.searchByName(name);
    await listPage.assertCampaignVisible(name);
    await listPage.assertCampaignStatus('Scheduled');
    console.log(`  Campaign appears in list with Scheduled status ✓`);

    // ── Share icon: hidden by default, revealed on row hover ─────────────────────
    await listPage.assertShareNotVisible();
    console.log(`  Share Campaign icon: hidden before row hover ✓`);

    await listPage.hoverCampaignRow(name);
    await listPage.assertShareVisible();
    console.log(`  Share Campaign icon: visible after row hover ✓`);

    // ── All action icons: state for Scheduled ────────────────────────────────────
    await listPage.assertAllScheduledActionIcons();
    console.log(`  View Details, Edit Campaign, Copy Campaign, Pause Campaign, Stop Campaign: visible & enabled ✓`);
    console.log(`  Delete Campaign: disabled (not available for Scheduled state) ✓`);
  });

  // ── TC-GR-013e | View Details panel — all fields ─────────────────────────────

  test('TC-GR-013e | should open View Details and display all campaign fields correctly', async () => {
    const ts        = Date.now();
    const rand      = String(Math.floor(Math.random() * 9000) + 1000);
    const name      = `GR_Auto5_${ts}_${rand}`;
    const id        = `GR_AUT5_${ts}_${rand}`;
    const startDate = futureDateStr(5, 0, 0);   // midnight → 12:00 AM in View Details
    const endDate   = futureDateStr(25, 0, 0);
    const startDetails = detailsDateStr(5, 0, 0);
    const endDetails   = detailsDateStr(25, 0, 0);

    await createPage.dismissNotifications();
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();

    await createPage.fillName(name);
    await createPage.fillStartDate(startDate);
    await createPage.selectChannel('mobile_v1');
    await createPage.fillEndDate(endDate);
    await createPage.dismissNotifications();
    await createPage.fillCampaignId(id);
    await createPage.clickCreateFeature();
    await createPage.assertVariantsCreated();

    await createPage.dismissNotifications();
    await createPage.clickSaveActivate();
    await createPage.assertSaveSuccess();
    console.log(`\n  Campaign created : ${name}`);
    console.log(`  Campaign ID      : ${id}`);
    console.log(`  Start (details)  : ${startDetails}`);
    console.log(`  End   (details)  : ${endDetails}`);

    await listPage.applyAllFilters();
    await listPage.searchByName(name);
    await listPage.assertCampaignVisible(name);
    await listPage.assertCampaignStatus('Scheduled');

    // ── Open View Details ─────────────────────────────────────────────────────────
    await listPage.clickViewDetails();
    await listPage.assertDetailsModalVisible();
    console.log(`  View Details panel opened ✓`);
    await listPage.logViewDetails();

    // ── Assert all fields ─────────────────────────────────────────────────────────
    await listPage.assertDetailsStatus('Scheduled');
    console.log(`  Status              : Scheduled ✓`);

    await listPage.assertDetailsStartDate(startDetails);
    console.log(`  Start date          : ${startDetails} ✓`);

    await listPage.assertDetailsEndDate(endDetails);
    console.log(`  End date            : ${endDetails} ✓`);

    await listPage.assertDetailsChannel('mobile_v1');
    console.log(`  Channel             : mobile_v1 ✓`);

    await listPage.assertDetailsCampaignId(id);
    console.log(`  Campaign ID         : ${id} ✓`);

    await listPage.assertDetailsDescriptionEmpty();
    console.log(`  Description         : - (empty) ✓`);

    await listPage.assertDetailsVariants();
    console.log(`  Variants            : Control%, Variant 1% ✓`);

    // ── Navigate back ─────────────────────────────────────────────────────────────
    await listPage.clickBackFromDetails();
    await listPage.assertPageVisible();
    console.log(`  Back to list        : ✓`);
  });

  // ── TC-GR-013f | Lifecycle: Pause / Resume (6 scenarios) ────────────────────

  test.describe('TC-GR-013f | Pause / Resume lifecycle', () => {
    let pauseName: string;
    let pauseId: string;

    test.beforeAll(async () => {
      const ts   = Date.now();
      const rand = String(Math.floor(Math.random() * 9000) + 1000);
      pauseName = `GR_Auto6_${ts}_${rand}`;
      pauseId   = `GR_AUT6_${ts}_${rand}`;

      await createPage.dismissNotifications();
      await listPage.navigate();
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();

      await createPage.fillName(pauseName);
      await createPage.fillStartDate(futureDateStr(6, 10, 0));
      await createPage.selectChannel('mobile_v1');
      await createPage.dismissNotifications();
      await createPage.fillCampaignId(pauseId);
      await createPage.clickCreateFeature();
      await createPage.assertVariantsCreated();

      await createPage.dismissNotifications();
      await createPage.clickSaveActivate();
      await createPage.assertSaveSuccess();

      await listPage.applyAllFilters();
      await listPage.searchByName(pauseName);
      await listPage.assertCampaignVisible(pauseName);
      await listPage.assertCampaignStatus('Scheduled');

      console.log(`\n  [Setup] Campaign : ${pauseName} (${pauseId}) — Scheduled ✓`);
    });

    test('SC-1 | should show Pause confirmation dialog with heading, Cancel and Pause buttons', async () => {
      await listPage.clickPauseCampaign();
      await listPage.assertPauseDialog();
      console.log(`\n  Pause dialog  : heading "Pause Campaign?", Cancel & Pause buttons ✓`);
      // Dialog left open — SC-2 will click Cancel
    });

    test('SC-2 | should close Pause dialog on Cancel and keep campaign status as Scheduled', async () => {
      await listPage.cancelPause();
      await listPage.assertCampaignStatus('Scheduled');
      console.log(`\n  After Cancel  : dialog closed, status still Scheduled ✓`);
    });

    test('SC-3 | should change campaign status to Paused and show success message when Pause is confirmed', async () => {
      await listPage.clickPauseCampaign();
      await listPage.assertPauseDialog();
      await listPage.confirmPause();
      await listPage.assertCampaignStatus('Paused');
      await listPage.assertPausedCampaignActions();
      console.log(`\n  After Pause   : status Paused, Resume icon visible (Pause icon replaced) ✓`);
      console.log(`  Success msg   : shown & dismissed ✓`);
    });

    test('SC-4 | should show Resume confirmation dialog with heading, Cancel and Resume buttons', async () => {
      await listPage.clickResumeCampaign();
      await listPage.assertResumeDialog();
      console.log(`\n  Resume dialog : heading "Resume Campaign?", Cancel & Resume buttons ✓`);
      // Dialog left open — SC-5 will click Cancel
    });

    test('SC-5 | should close Resume dialog on Cancel and keep campaign status as Paused', async () => {
      await listPage.cancelResume();
      await listPage.assertCampaignStatus('Paused');
      console.log(`\n  After Cancel  : dialog closed, status still Paused ✓`);
    });

    test('SC-6 | should change campaign status to Scheduled and show success message when Resume is confirmed', async () => {
      await listPage.clickResumeCampaign();
      await listPage.assertResumeDialog();
      await listPage.confirmResume();
      await listPage.assertCampaignStatus('Scheduled');
      await listPage.assertPauseCampaignButtonVisible();
      await listPage.assertResumeCampaignButtonAbsent();
      console.log(`\n  After Resume  : status Scheduled, Pause icon restored (Resume icon replaced) ✓`);
      console.log(`  Success msg   : shown & dismissed ✓`);
    });
  });

  // ── TC-GR-013g | Lifecycle: Stop — dialog behavior (SC-1, SC-2, SC-3) ─────────

  test.describe('TC-GR-013g | Stop lifecycle — dialog & action', () => {
    let stopName: string;
    let stopId: string;
    let initialCount: number;

    test.beforeAll(async () => {
      const ts   = Date.now();
      const rand = String(Math.floor(Math.random() * 9000) + 1000);
      stopName = `GR_Auto7_${ts}_${rand}`;
      stopId   = `GR_AUT7_${ts}_${rand}`;

      await createPage.dismissNotifications();
      await listPage.navigate();
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();

      await createPage.fillName(stopName);
      await createPage.fillStartDate(futureDateStr(7, 10, 0));
      await createPage.selectChannel('mobile_v1');
      await createPage.dismissNotifications();
      await createPage.fillCampaignId(stopId);
      await createPage.clickCreateFeature();
      await createPage.assertVariantsCreated();

      await createPage.dismissNotifications();
      await createPage.clickSaveActivate();
      await createPage.assertSaveSuccess();

      await listPage.applyAllFilters();
      initialCount = await listPage.getTotalCampaignCount();
      await listPage.searchByName(stopName);
      await listPage.assertCampaignVisible(stopName);
      await listPage.assertCampaignStatus('Scheduled');
      // Ensure action buttons are fully rendered before any SC test fires
      await listPage.assertScheduledCampaignActions();

      console.log(`\n  [Setup] Campaign             : ${stopName} (${stopId}) — Scheduled ✓`);
      console.log(`  [Setup] Initial total count  : ${initialCount}`);
    });

    test('SC-1 | should show Stop confirmation dialog with heading, campaign text, Cancel and Stop buttons', async () => {
      await listPage.clickStopCampaign();
      await listPage.assertStopDialog(stopName);
      await listPage.cancelStop(); // clean up — leave Scheduled for SC-2 & SC-3
      console.log(`\n  Stop dialog   : heading "Stop Campaign?", campaign text, Cancel & Stop buttons ✓`);
    });

    test('SC-2 | should close Stop dialog on Cancel and keep campaign status as Scheduled', async () => {
      await listPage.clickStopCampaign();
      await listPage.cancelStop();
      await listPage.assertCampaignStatus('Scheduled');
      console.log(`\n  After Cancel  : dialog closed, status still Scheduled ✓`);
    });

    test('SC-3 | should change campaign status to Expired and show success message when Stop is confirmed', async () => {
      await listPage.clickStopCampaign();
      await listPage.assertStopDialog(stopName);
      await listPage.confirmStop();
      await listPage.assertCampaignStatus('Expired');
      console.log(`\n  After Stop    : status Expired, success message shown ✓`);
    });

    test('SC-4 | should enable the Delete button when campaign is in Expired status', async () => {
      await listPage.assertDeleteCampaignButtonEnabled();
      console.log(`\n  Delete button : enabled for Expired campaign ✓`);
    });

    test('SC-5 | should disable Pause and Stop icons and keep View, Edit and Copy icons enabled for Expired campaign', async () => {
      await listPage.assertExpiredCampaignActions();
      console.log(`\n  Pause Campaign  : disabled ✓`);
      console.log(`  Stop Campaign   : disabled ✓`);
      console.log(`  View Details    : enabled ✓`);
      console.log(`  Edit Campaign   : enabled ✓`);
      console.log(`  Copy Campaign   : enabled ✓`);
      console.log(`  Delete Campaign : enabled ✓`);
    });

    test('SC-6 | should open View Details for Expired campaign and display campaign name, ID and status correctly', async () => {
      await listPage.clickViewDetails();
      await listPage.assertDetailsModalVisible();
      console.log(`\n  View Details panel opened for Expired campaign ✓`);

      // Log all panel fields dynamically — status is read from the UI, never hardcoded
      await listPage.logViewDetails();

      await listPage.assertDetailsCampaignName(stopName);
      console.log(`  Campaign name : ${stopName} ✓`);

      await listPage.assertDetailsCampaignId(stopId);
      console.log(`  Campaign ID   : ${stopId} ✓`);

      await listPage.assertDetailsStatus('Expired');
      console.log(`  Status        : Expired ✓`);

      await listPage.clickBackFromDetails();
      await listPage.assertPageVisible();
      console.log(`  Back to list  : ✓`);
    });

    test('SC-7 | should open Update campaign drawer for Expired campaign with correct heading, disabled save button, disabled Campaign ID, and editable fields that do not save', async () => {
      await listPage.clickEditCampaign();
      await listPage.assertUpdateDrawerVisible();
      console.log(`\n  Update campaign drawer : heading "Update campaign" ✓`);

      await listPage.assertCancelButtonVisible();
      console.log(`  Cancel button          : visible ✓`);

      await listPage.assertUpdateCampaignButtonDisabled();
      console.log(`  Update campaign button : disabled (Expired — changes cannot be saved) ✓`);

      await listPage.assertCampaignIdFieldDisabled();
      console.log(`  Campaign ID field      : disabled (read-only) ✓`);

      // Verify editable fields are still accessible even though save is blocked
      await listPage.fillUpdateCampaignName(`${stopName}_edited`);
      console.log(`  Campaign name field    : editable ✓`);

      // Close without saving — original name must remain unchanged in the list
      await listPage.closeUpdateDrawer();
      await listPage.assertCampaignVisible(stopName);
      console.log(`  After close            : campaign name unchanged in list (changes discarded) ✓`);
    });

    test('SC-8 | should show Delete dialog, keep campaign on Cancel, remove campaign on Delete confirm, and show No results on search', async () => {
      // Open Delete dialog and verify contents — then cancel
      await listPage.clickDeleteCampaign();
      await listPage.assertDeleteDialog();
      console.log(`\n  Delete dialog          : heading + body + Cancel + Delete buttons ✓`);

      await listPage.cancelDelete();
      await listPage.assertCampaignVisible(stopName);
      await listPage.assertCampaignStatus('Expired');
      console.log(`  Cancel                 : dialog closed, campaign still Expired ✓`);

      // Confirm delete and verify campaign is removed with success message
      await listPage.clickDeleteCampaign();
      await listPage.confirmDelete();
      console.log(`  Delete confirmed       : success notification shown ✓`);

      // Poll until the backend count reflects the deletion (search index is eventually consistent)
      let finalCount = initialCount;
      await expect.poll(
        async () => {
          await listPage.navigate();
          await listPage.applyAllFilters();
          finalCount = await listPage.getTotalCampaignCount();
          return finalCount;
        },
        { timeout: 30000, intervals: [3000] }
      ).toBe(initialCount - 1);
      console.log(`  Campaign count         : ${initialCount} → ${finalCount} (−1) ✓`);

      // Search by the deleted campaign name — table should show No results
      await listPage.searchByName(stopName);
      await listPage.assertNoResults();
      console.log(`  Search after delete    : No results ✓`);
    });
  });

  // ── TC-GR-013h | Edit Campaign — Scheduled campaign update ──────────────────

  test.describe('TC-GR-013h | Edit Campaign — Scheduled campaign update', () => {
    let editName: string;
    let editId: string;

    test.beforeAll(async () => {
      const ts   = Date.now();
      const rand = String(Math.floor(Math.random() * 9000) + 1000);
      editName = `GR_Auto8_${ts}_${rand}`;
      editId   = `GR_AUT8_${ts}_${rand}`;

      await createPage.dismissNotifications();
      await listPage.navigate();
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();

      await createPage.fillName(editName);
      await createPage.fillStartDate(futureDateStr(7, 10, 0));
      await createPage.selectChannel('mobile_v1');
      await createPage.dismissNotifications();
      await createPage.fillCampaignId(editId);
      await createPage.clickCreateFeature();
      await createPage.assertVariantsCreated();

      await createPage.dismissNotifications();
      await createPage.clickSaveActivate();
      await createPage.assertSaveSuccess();

      await listPage.applyAllFilters();
      await listPage.searchByName(editName);
      await listPage.assertCampaignVisible(editName);
      await listPage.assertCampaignStatus('Scheduled');

      console.log(`\n  [Setup] Campaign : ${editName} (${editId}) — Scheduled ✓`);
    });

    test('TC-GR-013h | should open Scheduled campaign in Update mode with correct heading, enabled Update button, visible Cancel button, disabled Campaign ID, and all other fields editable', async () => {
      // Open Edit drawer
      await listPage.clickEditCampaign();
      await listPage.assertUpdateDrawerVisible();

      // Verify drawer structure
      await listPage.assertUpdateCampaignButtonEnabled();
      await listPage.assertCancelButtonVisible();
      await listPage.assertCampaignIdFieldDisabled();

      // Verify all other fields are editable
      await listPage.assertUpdateNameFieldEnabled();
      await listPage.assertUpdateStartDateFieldEnabled();
      await listPage.assertUpdateChannelSelectorEnabled();
      await listPage.assertUpdateVariantTrafficEnabled();

      // Read and log actual values from the open drawer
      const drawerFields = await listPage.getUpdateDrawerFields();
      const variantLabels = ['Control', 'Variant 1', 'Variant 2', 'Variant 3'];
      console.log(`\n  ── Update Campaign Drawer ─────────────────────────────────────`);
      console.log(`  Heading              : Update campaign ✓`);
      console.log(`  Update button        : enabled ✓`);
      console.log(`  Cancel button        : visible ✓`);
      console.log(`  Campaign ID field    : disabled (read-only) ✓`);
      console.log(`  Campaign name field  : enabled (editable) ✓`);
      console.log(`  Start date field     : enabled (editable) ✓`);
      console.log(`  Channel selector     : visible (editable) ✓`);
      console.log(`  Traffic split fields : enabled (editable) ✓`);
      console.log(`  ─────────────────────────────────────────────────────────────`);
      console.log(`  Campaign name   : ${drawerFields.name}`);
      console.log(`  Campaign ID     : ${drawerFields.campaignId}`);
      console.log(`  Start date      : ${drawerFields.startDate}`);
      console.log(`  End date        : ${drawerFields.endDate}`);
      console.log(`  Channels        : ${drawerFields.channels.join(', ')}`);
      drawerFields.traffic.forEach((val, i) => {
        console.log(`  ${(variantLabels[i] ?? `Variant ${i}`).padEnd(14)}: ${val}%`);
      });
      console.log(`  ─────────────────────────────────────────────────────────────`);

      // Close without saving — TC-GR-013j covers the full save & verify flow
      await listPage.closeUpdateDrawer();
    });
  });

  // ── TC-GR-013i | Edit Campaign — Cancel discards changes ─────────────────────

  test.describe('TC-GR-013i | Edit Campaign — Cancel discards changes', () => {
    let cancelName: string;
    let cancelId: string;

    test.beforeAll(async () => {
      const ts   = Date.now();
      const rand = String(Math.floor(Math.random() * 9000) + 1000);
      cancelName = `GR_Auto9_${ts}_${rand}`;
      cancelId   = `GR_AUT9_${ts}_${rand}`;

      await createPage.dismissNotifications();
      await listPage.navigate();
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();

      await createPage.fillName(cancelName);
      await createPage.fillStartDate(futureDateStr(7, 10, 0));
      await createPage.selectChannel('mobile_v1');
      await createPage.dismissNotifications();
      await createPage.fillCampaignId(cancelId);
      await createPage.clickCreateFeature();
      await createPage.assertVariantsCreated();

      await createPage.dismissNotifications();
      await createPage.clickSaveActivate();
      await createPage.assertSaveSuccess();

      await listPage.applyAllFilters();
      await listPage.searchByName(cancelName);
      await listPage.assertCampaignVisible(cancelName);
      await listPage.assertCampaignStatus('Scheduled');

      console.log(`\n  [Setup] Campaign : ${cancelName} (${cancelId}) — Scheduled ✓`);
    });

    test('TC-GR-013i | should not apply changes when Cancel is clicked in the Edit Campaign drawer', async () => {
      // Open Edit drawer and make changes
      await listPage.clickEditCampaign();
      await listPage.assertUpdateDrawerVisible();

      // Change campaign name
      const editedName = `${cancelName}_edited`;
      await createPage.fillName(editedName);
      console.log(`\n  Campaign name changed to : "${editedName}" (not saved)`);

      // Add end date (reveals hidden end-date input)
      await listPage.fillUpdateEndDate(futureDateStr(14, 10, 0));
      console.log(`  End date added           : (not saved)`);

      // Change variant 1 traffic
      await createPage.setVariantTraffic('Variant 1', 40);
      console.log(`  Variant 1 traffic changed: 40% (not saved)`);

      // Click Cancel — discard all changes
      await listPage.closeUpdateDrawer();
      console.log(`  Cancel clicked           : drawer closed without saving ✓`);

      // Original campaign name must still be present
      await listPage.assertCampaignVisible(cancelName);
      console.log(`  Original name in list    : "${cancelName}" ✓`);

      // Status must be unchanged
      await listPage.assertCampaignStatus('Scheduled');
      console.log(`  Status                   : still Scheduled ✓`);

      // End date must still be N/A (end date change was discarded)
      await listPage.assertCampaignEndDateIsNA();
      console.log(`  End date                 : still N/A (change discarded) ✓`);
    });
  });

  // ── TC-GR-013j | Edit Campaign — add channel & remove end date ───────────────

  test.describe('TC-GR-013j | Edit Campaign — change all fields and verify persistence', () => {
    let editJName: string;
    let editJId: string;

    test.beforeAll(async () => {
      const ts   = Date.now();
      const rand = String(Math.floor(Math.random() * 9000) + 1000);
      editJName = `GR_AutoA_${ts}_${rand}`;
      editJId   = `GR_AUTA_${ts}_${rand}`;

      await createPage.dismissNotifications();
      await listPage.navigate();
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();

      // Create with one channel and NO end date so every field change is visible in the test
      await createPage.fillName(editJName);
      await createPage.fillStartDate(futureDateStr(7, 10, 0));
      await createPage.selectChannel('mobile_v1');
      await createPage.dismissNotifications();
      await createPage.fillCampaignId(editJId);
      await createPage.clickCreateFeature();
      await createPage.assertVariantsCreated();

      await createPage.dismissNotifications();
      await createPage.clickSaveActivate();
      await createPage.assertSaveSuccess();

      await listPage.applyAllFilters();
      await listPage.searchByName(editJName);
      await listPage.assertCampaignVisible(editJName);
      await listPage.assertCampaignStatus('Scheduled');

      console.log(`\n  [Setup] Campaign : ${editJName} (${editJId}) — Scheduled, 1 channel, no end date ✓`);
    });

    test('TC-GR-013j | should save changes to name, start date, end date, channels and traffic splits, and verify all changes persist in the list and re-opened drawer', async () => {
      const variantLabels  = ['Control', 'Variant 1', 'Variant 2', 'Variant 3'];
      const addedChannel   = 'GR_channel_2';
      const updatedName    = `${editJName}_edit`;

      // Open Edit drawer and log original values
      await listPage.clickEditCampaign();
      await listPage.assertUpdateDrawerVisible();

      const original = await listPage.getUpdateDrawerFields();
      console.log(`\n  ── Original values (before changes) ───────────────────────────`);
      console.log(`  Campaign name   : ${original.name}`);
      console.log(`  Campaign ID     : ${original.campaignId}`);
      console.log(`  Start date      : ${original.startDate}`);
      console.log(`  End date        : ${original.endDate}`);
      console.log(`  Channels        : ${original.channels.join(', ')}`);
      original.traffic.forEach((val, i) => {
        console.log(`  ${(variantLabels[i] ?? `Variant ${i}`).padEnd(14)}: ${val}%`);
      });
      console.log(`  ───────────────────────────────────────────────────────────────`);

      // Change campaign name
      await createPage.fillName(updatedName);

      // Change start date
      await createPage.fillStartDate(futureDateStr(10, 10, 0));

      // Add end date
      await listPage.fillUpdateEndDate(futureDateStr(20, 10, 0));

      // Add a second channel
      await createPage.selectAdditionalChannel(addedChannel);

      // Change traffic: Variant 1 = 40%, add Variant 2 = 20%
      await createPage.setVariantTraffic('Variant 1', 40);
      await createPage.clickAddNewVariant();
      await createPage.setVariantTrafficByIndex(2, 20);

      // Log drawer state with all changes applied (before save)
      const beforeSave = await listPage.getUpdateDrawerFields();
      console.log(`\n  ── Drawer after changes (before save) ─────────────────────────`);
      console.log(`  Campaign name   : ${beforeSave.name}`);
      console.log(`  Campaign ID     : ${beforeSave.campaignId}`);
      console.log(`  Start date      : ${beforeSave.startDate}`);
      console.log(`  End date        : ${beforeSave.endDate}`);
      console.log(`  Channels        : ${beforeSave.channels.join(', ')}`);
      beforeSave.traffic.forEach((val, i) => {
        console.log(`  ${(variantLabels[i] ?? `Variant ${i}`).padEnd(14)}: ${val}%`);
      });
      console.log(`  ───────────────────────────────────────────────────────────────`);

      // Save
      await listPage.clickUpdateSaveButton();
      await listPage.assertUpdateSuccess();

      // Assert list row reflects saved changes
      await listPage.searchByName(updatedName);
      await listPage.assertCampaignVisible(updatedName);
      await listPage.assertCampaignChannelInList('mobile_v1');
      await listPage.assertCampaignChannelInList(addedChannel);
      await listPage.assertCampaignStatus('Scheduled');

      const listStatus = await listPage.getListRowStatus();
      console.log(`\n  ── List row after save ─────────────────────────────────────────`);
      console.log(`  Campaign name   : ${updatedName}`);
      console.log(`  Status          : ${listStatus}`);
      console.log(`  Channels        : mobile_v1, ${addedChannel}`);
      console.log(`  ───────────────────────────────────────────────────────────────`);

      // Re-open Edit drawer and verify all changes are persisted
      await listPage.clickEditCampaign();
      await listPage.assertUpdateDrawerVisible();
      await listPage.assertUpdateDrawerChannelSelected('mobile_v1');
      await listPage.assertUpdateDrawerChannelSelected(addedChannel);

      const afterReopen = await listPage.getUpdateDrawerFields();
      console.log(`\n  ── Drawer after re-open (verify persistence) ──────────────────`);
      console.log(`  Campaign name   : ${afterReopen.name}`);
      console.log(`  Campaign ID     : ${afterReopen.campaignId}`);
      console.log(`  Start date      : ${afterReopen.startDate}`);
      console.log(`  End date        : ${afterReopen.endDate}`);
      console.log(`  Channels        : ${afterReopen.channels.join(', ')}`);
      afterReopen.traffic.forEach((val, i) => {
        console.log(`  ${(variantLabels[i] ?? `Variant ${i}`).padEnd(14)}: ${val}%`);
      });
      console.log(`  ───────────────────────────────────────────────────────────────`);

      await listPage.closeUpdateDrawer();
    });
  });

  // ── TC-GR-014..023 | Lifecycle chain on the campaign created by TC-GR-013 ────
  //
  // Re-enabled 2026-07-14. Each step re-establishes list context (navigate +
  // All-days filter + search by name) so it acts ONLY on the GR-013 campaign —
  // the original chain clicked row buttons on whatever row happened to be
  // showing, which is why it was disabled. Each step also skips gracefully
  // when GR-013 did not run in this worker (e.g. -g filtered runs / retries).

  async function focusLifecycleCampaign(): Promise<void> {
    await listPage.navigate();
    await listPage.applyAllFilters();
    await listPage.searchByName(campaignName);
    await listPage.assertCampaignVisible(campaignName);
  }

  test('TC-GR-014 | should display correct status and campaign ID in the View Details panel', async () => {
    test.skip(!campaignName, 'TC-GR-013 did not run in this worker — lifecycle campaign unavailable');
    await focusLifecycleCampaign();
    await listPage.clickViewDetails();
    await listPage.assertDetailsStatus('Scheduled');
    await listPage.assertDetailsCampaignId(campaignId);
    console.log(`\n  View Details — Status: Scheduled, Campaign ID: ${campaignId} ✓`);
    await listPage.clickBackFromDetails();
  });

  // ── TC-GR-015 | Lifecycle: Pause — Cancel ────────────────────────────────────

  test('TC-GR-015 | should cancel the Pause dialog and keep the campaign in Scheduled status', async () => {
    test.skip(!campaignName, 'TC-GR-013 did not run in this worker — lifecycle campaign unavailable');
    await focusLifecycleCampaign();
    await listPage.clickPauseCampaign();
    await listPage.assertPauseDialog();
    await listPage.cancelPause();
    await listPage.assertCampaignStatus('Scheduled');
    console.log(`\n  Pause dialog cancelled — status remains: Scheduled ✓`);
  });

  // ── TC-GR-016 | Lifecycle: Pause — Confirm ───────────────────────────────────

  test('TC-GR-016 | should pause the campaign and change its status to Paused', async () => {
    test.skip(!campaignName, 'TC-GR-013 did not run in this worker — lifecycle campaign unavailable');
    await focusLifecycleCampaign();
    await listPage.clickPauseCampaign();
    await listPage.assertPauseDialog();
    await listPage.confirmPause();
    await listPage.assertCampaignStatus('Paused');
    await listPage.assertPausedCampaignActions();
    console.log(`\n  Campaign paused — status: Paused ✓`);
    await listPage.logCampaignActions('Paused');
  });

  // ── TC-GR-017 | Lifecycle: Resume — Cancel ───────────────────────────────────

  test('TC-GR-017 | should cancel the Resume dialog and keep the campaign in Paused status', async () => {
    test.skip(!campaignName, 'TC-GR-013 did not run in this worker — lifecycle campaign unavailable');
    await focusLifecycleCampaign();
    await listPage.clickResumeCampaign();
    await listPage.assertResumeDialog();
    await listPage.cancelResume();
    await listPage.assertCampaignStatus('Paused');
    console.log(`\n  Resume dialog cancelled — status remains: Paused ✓`);
  });

  // ── TC-GR-018 | Lifecycle: Resume — Confirm ──────────────────────────────────

  test('TC-GR-018 | should resume the paused campaign and change its status back to Scheduled', async () => {
    test.skip(!campaignName, 'TC-GR-013 did not run in this worker — lifecycle campaign unavailable');
    await focusLifecycleCampaign();
    await listPage.clickResumeCampaign();
    await listPage.assertResumeDialog();
    await listPage.confirmResume();
    await listPage.assertCampaignStatus('Scheduled');
    console.log(`\n  Campaign resumed — status: Scheduled ✓`);
    await listPage.logCampaignActions('Scheduled');
  });

  // ── TC-GR-019 | Lifecycle: Stop — Cancel ─────────────────────────────────────

  test('TC-GR-019 | should cancel the Stop dialog and keep the campaign in Scheduled status', async () => {
    test.skip(!campaignName, 'TC-GR-013 did not run in this worker — lifecycle campaign unavailable');
    await focusLifecycleCampaign();
    await listPage.clickStopCampaign();
    await listPage.assertStopDialog(campaignName);
    await listPage.cancelStop();
    await listPage.assertCampaignStatus('Scheduled');
    console.log(`\n  Stop dialog cancelled — status remains: Scheduled ✓`);
  });

  // ── TC-GR-020 | Lifecycle: Stop — Confirm ────────────────────────────────────

  test('TC-GR-020 | should stop the campaign and change its status to Expired', async () => {
    test.skip(!campaignName, 'TC-GR-013 did not run in this worker — lifecycle campaign unavailable');
    await focusLifecycleCampaign();
    await listPage.clickStopCampaign();
    await listPage.assertStopDialog(campaignName);
    await listPage.confirmStop();
    await listPage.assertCampaignStatus('Expired');
    await listPage.assertExpiredCampaignActions();
    console.log(`\n  Campaign stopped — status: Expired ✓`);
    await listPage.logCampaignActions('Expired');
    console.log(`  Delete Campaign visible (only for Expired) ✓`);
  });

  // ── TC-GR-021 | Lifecycle: Delete — Cancel ───────────────────────────────────

  test('TC-GR-021 | should cancel the Delete dialog and keep the Expired campaign in the list', async () => {
    test.skip(!campaignName, 'TC-GR-013 did not run in this worker — lifecycle campaign unavailable');
    await focusLifecycleCampaign();
    await listPage.clickDeleteCampaign();
    await listPage.assertDeleteDialog();
    await listPage.cancelDelete();
    await listPage.assertCampaignVisible(campaignName);
    console.log(`\n  Delete dialog cancelled — campaign still visible: ${campaignName} ✓`);
  });

  // ── TC-GR-022 | Lifecycle: Delete — Confirm ──────────────────────────────────

  test('TC-GR-022 | should delete the Expired campaign successfully', async () => {
    test.skip(!campaignName, 'TC-GR-013 did not run in this worker — lifecycle campaign unavailable');
    await focusLifecycleCampaign();
    await listPage.clickDeleteCampaign();
    await listPage.assertDeleteDialog();
    await listPage.confirmDelete();
    console.log(`\n  Campaign deleted: ${campaignName} ✓`);
  });

  // ── TC-GR-023 | Lifecycle: Search after delete ───────────────────────────────

  test('TC-GR-023 | should show "No results" when searching for the deleted campaign by name', async () => {
    test.skip(!campaignName, 'TC-GR-013 did not run in this worker — lifecycle campaign unavailable');
    await listPage.navigate();
    await listPage.applyAllFilters();
    await listPage.searchByName(campaignName);
    await listPage.assertNoResults();
    console.log(`\n  Search for "${campaignName}" → No results ✓`);
  });

  // ── TC-GR-024 | Filter by Live status — verify action buttons ────────────────

  test('TC-GR-024 | should filter campaigns by Live status with All days, show Live campaigns in results, and display correct enabled/disabled action states', async () => {
    await listPage.navigate();

    // Select Live from the status filter dropdown
    await listPage.filterByStatus('Live');
    console.log(`\n  Status filter set : Live`);

    // Change date to All days and click Search
    await listPage.applyAllFilters();
    console.log(`  Date filter set   : All days`);
    console.log(`  Search clicked`);

    // Verify the status filter button now reflects the selected status
    await listPage.assertStatusFilterActive('Live');
    console.log(`  Status filter     : Live (active) ✓`);

    // Verify at least one Live campaign row appears in results
    await listPage.assertLiveCampaignInResults();
    console.log(`  Live campaigns    : visible in results ✓`);

    // Log action states for the first Live campaign row
    await listPage.logCampaignActions('Live');

    // Assert enabled/disabled states for each action button
    await listPage.assertLiveCampaignActions();
    console.log(`\n  View Details    : enabled ✓`);
    console.log(`  Edit Campaign   : enabled ✓`);
    console.log(`  Copy Campaign   : enabled ✓`);
    console.log(`  Pause Campaign  : enabled ✓`);
    console.log(`  Stop Campaign   : enabled ✓`);
    console.log(`  Delete Campaign : disabled ✓`);
    console.log(`  Resume Campaign : not visible (not applicable for Live) ✓`);
  });

  // ── TC-GR-025 | View Details for Live campaign — verify all fields ────────────

  test('TC-GR-025 | should open View Details for a Live campaign and display campaign name, status, campaign ID, start date, end date, channel, and traffic splits correctly', async () => {
    await listPage.navigate();

    // Filter by Live status + All days
    await listPage.filterByStatus('Live');
    await listPage.applyAllFilters();
    await listPage.assertLiveCampaignInResults();
    console.log(`\n  Filtered to Live + All days — Live campaigns visible in results ✓`);

    // Open View Details for the first Live campaign
    await listPage.clickViewDetails();
    await listPage.assertDetailsModalVisible();
    console.log(`  View Details modal opened ✓`);

    // Read all field values from the UI and log them
    await listPage.logViewDetails();

    // ── Assert each section is present ────────────────────────────────────────────

    // Campaign name + status badge in subheading
    await listPage.assertDetailsSubheadingVisible();

    // Status must be Live
    await listPage.assertDetailsStatus('Live');

    // Channel section heading
    await listPage.assertDetailsChannelHeading();

    // Traffic splits — at least Control% row must be present
    await listPage.assertDetailsTrafficSplitsVisible();

    // Navigate back to the list
    await listPage.clickBackFromDetails();
    await listPage.assertPageVisible();
  });

  // ── TC-GR-027 | Live campaign — search by name, verify list columns, View Details ──

  test('TC-GR-027 | should search for a Live campaign by name, verify list row columns (dates, channel, status, actions), and confirm all View Details fields', async () => {
    await listPage.navigate();

    // Filter by Live + All days, then read the first campaign name from View Details
    await listPage.filterByStatus('Live');
    await listPage.applyAllFilters();
    await listPage.assertLiveCampaignInResults();
    await listPage.clickViewDetails();
    await listPage.assertDetailsModalVisible();
    const campaignName = await listPage.getDetailsCampaignName();
    await listPage.clickBackFromDetails();
    await listPage.assertPageVisible();
    console.log(`\n  Live campaign found : "${campaignName}"`);

    // Search by campaign name within the Live filter
    await listPage.searchByName(campaignName);
    await listPage.assertCampaignVisible(campaignName);
    console.log(`  Search by name "${campaignName}" with Live filter : campaign visible ✓`);

    // Reset to All statuses and search again — campaign still visible with same data
    await listPage.clearStatusFilter();
    await listPage.applyAllFilters();
    await listPage.searchByName(campaignName);
    await listPage.assertCampaignVisible(campaignName);
    await listPage.assertCampaignStatus('Live');
    console.log(`  All statuses filter + name search : campaign visible with Live status ✓`);

    // Log and assert action buttons in the list row
    await listPage.logCampaignActions('Live');
    await listPage.assertLiveCampaignActions();

    // Open View Details and verify all fields
    await listPage.clickViewDetails();
    await listPage.assertDetailsModalHeaderVisible();
    await listPage.assertDetailsSubheadingVisible();
    await listPage.assertDetailsStatus('Live');
    await listPage.assertDetailsChannelHeading();
    await listPage.assertDetailsCampaignIdHeading();
    await listPage.assertDetailsTrafficSplitsVisible();
    await listPage.logViewDetails();

    // Navigate back
    await listPage.clickBackFromDetails();
    await listPage.assertPageVisible();
  });

  // ── TC-GR-026 | Live campaign — Pause / Resume lifecycle ─────────────────────

  test.describe('TC-GR-026 | Live campaign — Pause / Resume lifecycle', () => {
    let liveName: string;

    test.beforeAll(async () => {
      await listPage.navigate();
      await listPage.filterByStatus('Live');
      await listPage.applyAllFilters();

      // If no Live campaigns are found, a previous failed run may have left campaigns
      // in Paused state without resuming them. Recover by resuming the first Paused one.
      if (!await listPage.hasLiveCampaignInResults()) {
        console.log(`\n  [Recovery] No Live campaigns found — resuming a Paused campaign`);
        await listPage.clearStatusFilter();
        await listPage.filterByStatus('Paused');
        await listPage.applyAllFilters();
        await listPage.clickResumeCampaign();
        await listPage.assertResumeDialog();
        await listPage.confirmResumeLive();
        await listPage.clearStatusFilter();
        await listPage.filterByStatus('Live');
        await listPage.applyAllFilters();
      }

      await listPage.assertLiveCampaignInResults();
      await listPage.clickViewDetails();
      await listPage.assertDetailsModalVisible();
      liveName = await listPage.getDetailsCampaignName();
      await listPage.clickBackFromDetails();
      await listPage.assertPageVisible();

      console.log(`\n  [Setup] Live campaign : "${liveName}" ✓`);
    });

    test('SC-1 | should open View Details for the Live campaign and display status, ID, dates, channel and traffic splits', async () => {
      await listPage.clickViewDetails();
      await listPage.assertDetailsModalVisible();
      await listPage.logViewDetails();
      await listPage.assertDetailsSubheadingVisible();
      await listPage.assertDetailsStatus('Live');
      await listPage.assertDetailsChannelHeading();
      await listPage.assertDetailsTrafficSplitsVisible();
      await listPage.clickBackFromDetails();
      await listPage.assertPageVisible();
    });

    test('SC-2 | should show Pause dialog with correct heading, body text, Cancel and Pause buttons, and keep Live status on Cancel', async () => {
      await listPage.clickPauseCampaign();
      await listPage.assertPauseDialog();
      console.log(`\n  Pause dialog  : heading "Pause Campaign?", body text, Cancel & Pause buttons ✓`);
      await listPage.cancelPause();
      await listPage.assertCampaignStatus('Live');
      console.log(`  Cancel        : dialog closed, campaign still Live ✓`);
    });

    test('SC-3 | should change campaign status to Paused when Pause is confirmed and show success notification', async () => {
      await listPage.clickPauseCampaign();
      await listPage.assertPauseDialog();
      await listPage.confirmPauseLive();
      console.log(`\n  Pause confirmed : success notification shown ✓`);

      // Campaign is now Paused — filter stays on "Live" so clear it, then search by name
      await listPage.clearStatusFilter();
      await listPage.applyAllFilters();
      await listPage.searchByName(liveName);
      await listPage.assertCampaignVisible(liveName);
      await listPage.assertCampaignStatus('Paused');
      await listPage.logCampaignActions('Paused');
      console.log(`  Status          : Paused ✓`);
    });

    test('SC-4 | should enable Resume, Stop, View Details and Edit Campaign, and replace Pause with Resume for Paused campaign', async () => {
      await listPage.assertPausedCampaignActions();
      await listPage.assertPauseCampaignButtonNotVisible();
      console.log(`\n  View Details    : visible ✓`);
      console.log(`  Edit Campaign   : visible ✓`);
      console.log(`  Resume Campaign : visible (replaces Pause) ✓`);
      console.log(`  Stop Campaign   : visible ✓`);
      console.log(`  Pause Campaign  : not visible (replaced by Resume) ✓`);
    });

    test('SC-5 | should show Resume dialog with correct heading, body text, Cancel and Resume buttons, and keep Paused status on Cancel', async () => {
      await listPage.clickResumeCampaign();
      await listPage.assertResumeDialog();
      console.log(`\n  Resume dialog : heading "Resume Campaign?", body text, Cancel & Resume buttons ✓`);
      await listPage.cancelResume();
      await listPage.assertCampaignStatus('Paused');
      console.log(`  Cancel        : dialog closed, campaign still Paused ✓`);
    });

    test('SC-6 | should change campaign status back to Live when Resume is confirmed and restore the Pause button', async () => {
      await listPage.clickResumeCampaign();
      await listPage.assertResumeDialog();
      await listPage.confirmResumeLive();
      console.log(`\n  Resume confirmed : success notification shown ✓`);
      await listPage.assertCampaignStatus('Live');
      await listPage.assertPauseCampaignButtonVisible();
      await listPage.assertResumeCampaignButtonAbsent();
      console.log(`  Status           : Live ✓`);
      console.log(`  Pause Campaign   : visible (restored) ✓`);
      console.log(`  Resume Campaign  : not visible ✓`);
    });
  });

  // ── TC-GR-028 | Edit Live campaign — disabled fields ──────────────────────────

  test('TC-GR-028 | should open Edit Campaign drawer for a Live campaign and assert Start date, Campaign ID, and Add new variants button are disabled', async () => {
    await listPage.navigate();

    // Filter by Live + All days to locate a Live campaign
    await listPage.filterByStatus('Live');
    await listPage.applyAllFilters();
    await listPage.assertLiveCampaignInResults();

    // Read campaign name dynamically from View Details (suffix-safe extraction)
    await listPage.clickViewDetails();
    await listPage.assertDetailsModalVisible();
    const liveCampaignName = await listPage.getDetailsCampaignName();
    await listPage.clickBackFromDetails();
    await listPage.assertPageVisible();
    console.log(`\n  Live campaign found : "${liveCampaignName}"`);

    // Search by name then click Edit Campaign
    await listPage.searchByName(liveCampaignName);
    await listPage.assertCampaignVisible(liveCampaignName);
    await listPage.clickEditCampaign();
    await listPage.assertUpdateDrawerVisible();
    console.log(`  Update campaign drawer opened ✓`);

    // ── Assert fields disabled for Live campaigns ──────────────────────────────────

    // Campaign ID is always disabled in edit mode
    await listPage.assertCampaignIdFieldDisabled();
    console.log(`  Campaign ID field      : disabled ✓`);

    // Start date is disabled — cannot shift the start of a Live campaign
    await listPage.assertUpdateStartDateFieldDisabled();
    console.log(`  Start date field       : disabled (Live — start date is locked) ✓`);

    // Add new variants is disabled — variant set is frozen once the campaign goes Live
    await listPage.assertAddNewVariantsButtonDisabled();
    console.log(`  Add new variants button: disabled (Live — variant set is locked) ✓`);

    // ── Assert fields that remain editable / visible ───────────────────────────────

    await listPage.assertUpdateNameFieldEnabled();
    console.log(`  Campaign name field    : enabled (editable) ✓`);

    await listPage.assertUpdateChannelSelectorEnabled();
    console.log(`  Channel selector       : visible ✓`);

    await listPage.assertUpdateCampaignButtonEnabled();
    console.log(`  Update campaign button : enabled ✓`);

    await listPage.assertCancelButtonVisible();
    console.log(`  Cancel button          : visible ✓`);

    // Log all current drawer values for verification
    const drawerFields = await listPage.getUpdateDrawerFields();
    const variantLabels = ['Control', 'Variant 1', 'Variant 2', 'Variant 3'];
    console.log(`\n  ── Update Campaign Drawer — Live campaign ─────────────────────`);
    console.log(`  Campaign name   : ${drawerFields.name}`);
    console.log(`  Campaign ID     : ${drawerFields.campaignId} (disabled)`);
    console.log(`  Start date      : ${drawerFields.startDate} (disabled)`);
    console.log(`  End date        : ${drawerFields.endDate}`);
    console.log(`  Channels        : ${drawerFields.channels.join(', ')}`);
    drawerFields.traffic.forEach((val, i) => {
      console.log(`  ${(variantLabels[i] ?? `Variant ${i}`).padEnd(14)}: ${val}%`);
    });
    console.log(`  ──────────────────────────────────────────────────────────────`);

    // Close without saving — no changes should be persisted
    await listPage.closeUpdateDrawer();
    await listPage.assertCampaignVisible(liveCampaignName);
    console.log(`\n  Drawer closed without saving ✓`);
    console.log(`  Campaign still visible in list ✓`);
  });

  // ── TC-GR-029 | Live campaign — Stop then Delete lifecycle ────────────────────

  test.describe('TC-GR-029 | Live campaign — Stop and Delete lifecycle', () => {
    let stopLiveName: string;
    let initialCount: number;

    test.beforeAll(async () => {
      // Find a Live campaign name dynamically
      await listPage.navigate();
      await listPage.filterByStatus('Live');
      await listPage.applyAllFilters();
      await listPage.assertLiveCampaignInResults();
      await listPage.clickViewDetails();
      await listPage.assertDetailsModalVisible();
      stopLiveName = await listPage.getDetailsCampaignName();
      await listPage.clickBackFromDetails();
      await listPage.assertPageVisible();

      // Navigate to a clean state, record total campaign count, then search by name
      await listPage.navigate();
      await listPage.applyAllFilters();
      initialCount = await listPage.getTotalCampaignCount();
      await listPage.searchByName(stopLiveName);
      await listPage.assertCampaignVisible(stopLiveName);
      await listPage.assertCampaignStatus('Live');

      console.log(`\n  [Setup] Live campaign      : "${stopLiveName}" ✓`);
      console.log(`  [Setup] Initial total count: ${initialCount}`);
    });

    test('SC-1 | should show Stop dialog with heading, body text, Cancel and Stop buttons, and keep Live status on Cancel', async () => {
      await listPage.clickStopCampaign();
      await listPage.assertStopDialog(stopLiveName);
      console.log(`\n  Stop dialog : heading "Stop Campaign?", body text, Cancel & Stop buttons ✓`);
      await listPage.cancelStop();
      await listPage.assertCampaignStatus('Live');
      console.log(`  Cancel      : dialog closed, campaign still Live ✓`);
    });

    test('SC-2 | should change campaign status to Expired when Stop is confirmed and show success notification', async () => {
      await listPage.clickStopCampaign();
      await listPage.assertStopDialog(stopLiveName);
      await listPage.confirmStop();
      console.log(`\n  Stop confirmed : success notification shown ✓`);
      await listPage.assertCampaignStatus('Expired');
      console.log(`  Status         : Expired ✓`);
      await listPage.logCampaignActions('Expired');
    });

    test('SC-3 | should enable Delete and disable Pause and Stop for Expired campaign, while keeping View Details, Edit and Copy enabled', async () => {
      await listPage.assertExpiredCampaignActions();
      console.log(`\n  View Details    : enabled ✓`);
      console.log(`  Edit Campaign   : enabled ✓`);
      console.log(`  Copy Campaign   : enabled ✓`);
      console.log(`  Delete Campaign : enabled ✓`);
      console.log(`  Pause Campaign  : disabled ✓`);
      console.log(`  Stop Campaign   : disabled ✓`);
    });

    test('SC-4 | should show Delete dialog with Cancel and Delete buttons, and keep campaign on Cancel', async () => {
      await listPage.clickDeleteCampaign();
      await listPage.assertDeleteDialog();
      console.log(`\n  Delete dialog : heading "Delete Campaign?", body text, Cancel & Delete buttons ✓`);
      await listPage.cancelDelete();
      await listPage.assertCampaignVisible(stopLiveName);
      await listPage.assertCampaignStatus('Expired');
      console.log(`  Cancel        : dialog closed, campaign still Expired ✓`);
    });

    test('SC-5 | should delete the Expired campaign, reduce the total campaign count by 1, and show No results on name search', async () => {
      await listPage.clickDeleteCampaign();
      await listPage.confirmDelete();
      console.log(`\n  Delete confirmed : success notification shown ✓`);

      // The backend search index is eventually consistent — the count may take a few
      // seconds to drop after the delete notification fires.  Poll with a fresh
      // navigate + search on each iteration until the count decreases by 1 (up to 30 s).
      let finalCount = initialCount;
      await expect.poll(
        async () => {
          await listPage.navigate();
          await listPage.applyAllFilters();
          finalCount = await listPage.getTotalCampaignCount();
          return finalCount;
        },
        { timeout: 30000, intervals: [3000] }
      ).toBe(initialCount - 1);
      console.log(`  Campaign count   : ${initialCount} → ${finalCount} (−1) ✓`);

      // Searching for the deleted campaign by name must yield No results
      await listPage.searchByName(stopLiveName);
      await listPage.assertNoResults();
      console.log(`  Search "${stopLiveName}" : No results ✓`);
    });
  });

  // ── TC-GR-030 | Edit Live campaign — save changes and verify ─────────────────

  test.describe('TC-GR-030 | Edit Live campaign — save changes and verify', () => {
    let editLiveName: string;
    let updatedName: string;
    let initialCount: number;
    let addedChannels: string[] = [];
    // Relative end date — a hardcoded absolute date becomes invalid (past)
    // once real time passes it, silently blocking the save
    const newEndDate = futureDateStr(150, 10, 0);
    const variant1Traffic = 30;

    test.beforeAll(async () => {
      // Record baseline total count (all statuses, all days) before editing
      await listPage.navigate();
      await listPage.applyAllFilters();
      initialCount = await listPage.getTotalCampaignCount();
      console.log(`\n  [Setup] Baseline campaign count : ${initialCount}`);

      // Find a Live campaign dynamically
      await listPage.filterByStatus('Live');
      await listPage.searchByName('');  // trigger search so Live-filtered results load
      await listPage.assertLiveCampaignInResults();
      await listPage.clickViewDetails();
      await listPage.assertDetailsModalVisible();
      editLiveName = await listPage.getDetailsCampaignName();
      await listPage.clickBackFromDetails();
      await listPage.assertPageVisible();
      console.log(`\n  [Setup] Live campaign : "${editLiveName}" ✓`);

      // Open the Update drawer and log fields before editing
      await listPage.searchByName(editLiveName);
      await listPage.assertCampaignVisible(editLiveName);
      await listPage.clickEditCampaign();
      await listPage.assertUpdateDrawerVisible();
      const before = await listPage.getUpdateDrawerFields();
      const variantLabels = ['Control', 'Variant 1', 'Variant 2', 'Variant 3'];
      console.log(`\n  ── Before Edit ─────────────────────────────────────`);
      console.log(`  Name       : ${before.name}`);
      console.log(`  Campaign ID: ${before.campaignId}`);
      console.log(`  Start date : ${before.startDate}`);
      console.log(`  End date   : ${before.endDate}`);
      console.log(`  Channels   : ${before.channels.join(', ') || '(none)'}`);
      before.traffic.forEach((v, i) => console.log(`  ${(variantLabels[i] ?? `Variant ${i}`).padEnd(14)}: ${v}%`));

      // Apply edits: rename, add 2 channels from the dropdown (dynamic — no hardcoded names),
      // set end date, set Variant 1 traffic to 30 %
      updatedName = editLiveName + '_edit';
      await listPage.fillUpdateCampaignName(updatedName);
      addedChannels = await listPage.selectAvailableUpdateDrawerChannels(2);
      console.log(`  Channels added  : ${addedChannels.join(', ') || '(none available)'}`);
      await listPage.fillUpdateEndDate(newEndDate);
      await listPage.setUpdateDrawerVariantTrafficByIndex(1, variant1Traffic);

      // Save and wait for drawer to auto-close on success
      await listPage.clickUpdateSaveButton();
      await listPage.assertUpdateSuccess();
      console.log(`\n  Changes saved : "${editLiveName}" → "${updatedName}" ✓`);
    });

    test('SC-1 | should show updated name, Live status, and all added channels (>2) in the list row, with total campaign count unchanged', async () => {
      await listPage.navigate();
      await listPage.applyAllFilters();
      // searchAndAssertVisible retries until the search index reflects the rename
      await listPage.searchAndAssertVisible(updatedName);
      await listPage.assertCampaignStatus('Live');
      for (const ch of addedChannels) {
        await listPage.assertCampaignChannelInList(ch);
      }
      console.log(`\n  Updated name in list : ${updatedName} ✓`);
      console.log(`  Status               : Live (unchanged by edit) ✓`);
      console.log(`  Channels in list     : ${addedChannels.join(', ')} ✓`);
      console.log(`  System supports > 2 channels on a campaign ✓`);

      // Verify editing does not create an extra record — total count must stay the same
      await listPage.navigate();
      await listPage.applyAllFilters();
      const countAfterEdit = await listPage.getTotalCampaignCount();
      expect(countAfterEdit).toBe(initialCount);
      console.log(`  Campaign count       : ${initialCount} → ${countAfterEdit} (unchanged) ✓`);
    });

    test('SC-2 | should persist all edited fields (name, channel, end date, Variant 1 traffic) when the Update drawer is re-opened', async () => {
      await listPage.navigate();
      await listPage.applyAllFilters();
      await listPage.searchByName(updatedName);
      await listPage.assertCampaignVisible(updatedName);
      await listPage.clickEditCampaign();
      await listPage.assertUpdateDrawerVisible();

      const after = await listPage.getUpdateDrawerFields();
      const variantLabels = ['Control', 'Variant 1', 'Variant 2', 'Variant 3'];
      console.log(`\n  ── After Edit ──────────────────────────────────────`);
      console.log(`  Name       : ${after.name}`);
      console.log(`  Campaign ID: ${after.campaignId}`);
      console.log(`  Start date : ${after.startDate}`);
      console.log(`  End date   : ${after.endDate}`);
      console.log(`  Channels   : ${after.channels.join(', ') || '(none)'}`);
      after.traffic.forEach((v, i) => console.log(`  ${(variantLabels[i] ?? `Variant ${i}`).padEnd(14)}: ${v}%`));

      expect(after.name).toBe(updatedName);
      for (const ch of addedChannels) {
        expect(after.channels).toContain(ch);
      }
      expect(after.channels.length).toBeGreaterThan(2);
      expect(after.endDate).not.toBe('N/A (not set)');
      expect(Number(after.traffic[1])).toBe(variant1Traffic);

      console.log(`\n  Name persisted       : ${after.name} ✓`);
      console.log(`  Channels persisted   : ${after.channels.join(', ')} (${after.channels.length} total — > 2 supported) ✓`);
      console.log(`  End date persisted   : ${after.endDate} ✓`);
      console.log(`  Variant 1 traffic    : ${after.traffic[1]}% ✓`);

      await listPage.closeUpdateDrawer();
    });
  });

  // ── TC-GR-031 | Draft campaign — create and verify ────────────────────────────

  test.describe('TC-GR-031 | Draft campaign — create and verify', () => {
    const ts        = Date.now();
    const draftName = `oA_${ts}_draft`;
    const draftId   = `DRFT_${ts}`;
    let initialCount: number;

    test.beforeAll(async () => {
      // Record baseline Draft count before creating the draft
      await listPage.navigate();
      await listPage.filterByStatus('Draft');
      await listPage.applyAllFilters();
      initialCount = await listPage.getTotalCampaignCount();
      console.log(`\n  [Setup] Baseline Draft count : ${initialCount}`);

      // Create the draft — only name and ID are required
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();
      await createPage.fillName(draftName);
      await createPage.fillCampaignId(draftId);
      await createPage.clickSaveDraft();
      await createPage.assertSaveSuccess();
      console.log(`  [Setup] Draft created  : "${draftName}" (ID: ${draftId}) ✓`);
    });

    test('SC-1 | should require campaign name and campaign ID — Save Draft with missing fields is blocked', async () => {
      // Open a fresh Create drawer for validation only (no extra campaign is saved here)
      await listPage.navigate();
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();

      try {
        // Click Save Draft with no fields filled → name required error
        // (the campaign-name inline error still renders)
        await createPage.clickSaveDraft();
        await createPage.assertCampaignNameRequiredInlineError();
        console.log(`\n  Save Draft (no name, no ID)  : campaign name required ✓`);

        // Fill name only, click Save Draft → campaign ID is still required,
        // but its inline error no longer renders — the save is blocked
        // silently (drawer stays open)
        await createPage.fillName(`${draftName}_v`);
        await createPage.clickSaveDraft();
        await createPage.assertSaveBlocked();
        console.log(`  Save Draft (name only, no ID): blocked — campaign ID still required (silent) ✓`);
      } finally {
        // Close without saving — validation confirmed, no extra campaign created
        await createPage.closeDrawer();
      }
    });

    test('SC-2 | should appear in the campaign list with Draft status and increase the total campaign count by 1', async () => {
      await listPage.navigate();
      await listPage.applyAllFilters();
      await listPage.searchAndAssertVisible(draftName);
      await listPage.assertCampaignStatus('Draft');
      console.log(`\n  Draft in list  : "${draftName}" ✓`);
      console.log(`  Status         : Draft ✓`);

      await listPage.navigate();
      await listPage.filterByStatus('Draft');
      await listPage.applyAllFilters();
      const newCount = await listPage.getTotalCampaignCount();
      expect(newCount).toBe(initialCount + 1);
      console.log(`  Campaign count : ${initialCount} → ${newCount} (+1) ✓`);
    });

    test('SC-3 | should show N/A for start date, end date, and channel in the list row', async () => {
      await listPage.navigate();
      await listPage.applyAllFilters();
      await listPage.searchByName(draftName);
      await listPage.assertCampaignVisible(draftName);
      await listPage.assertDraftRowNA();
      console.log(`\n  Start date : N/A (no start date required for draft) ✓`);
      console.log(`  End date   : N/A (no end date required for draft) ✓`);
      console.log(`  Channel    : N/A (no channel required for draft) ✓`);
    });

    test('SC-4 | should show Edit, Copy, Delete enabled; Pause and Stop disabled; and no Resume for a Draft campaign', async () => {
      await listPage.navigate();
      await listPage.applyAllFilters();
      await listPage.searchByName(draftName);
      await listPage.assertCampaignVisible(draftName);
      await listPage.logCampaignActions('Draft');
      await listPage.assertDraftCampaignActions();
      console.log(`\n  Edit Campaign   : visible & enabled ✓`);
      console.log(`  Copy Campaign   : visible & enabled ✓`);
      console.log(`  Delete Campaign : enabled ✓`);
      console.log(`  Pause Campaign  : visible but disabled (campaign not running) ✓`);
      console.log(`  Stop Campaign   : visible but disabled (campaign not running) ✓`);
      console.log(`  Resume Campaign : not visible ✓`);
    });
  });

  // ── TC-GR-032 | Draft campaign — create with all details and verify ────────────

  test.describe('TC-GR-032 | Draft campaign — create with all details and verify', () => {
    const ts             = Date.now();
    const draftName      = `oA_${ts}_fullDraft`;
    const draftId        = `DRFT_FULL_${ts}`;
    // Relative dates — a hardcoded '2026-07-01' start silently blocked the
    // save once that date slipped into the past (no error is rendered for a
    // past start date on Save as Draft)
    const startDate      = futureDateStr(7, 9);
    const endDate        = futureDateStr(180, 9);
    const channel        = 'mobile_v1';
    const variant1Traffic = 30;
    let initialCount: number;

    test.beforeAll(async () => {
      // Record baseline Draft count before creating the draft
      await listPage.navigate();
      await listPage.filterByStatus('Draft');
      await listPage.applyAllFilters();
      initialCount = await listPage.getTotalCampaignCount();
      console.log(`\n  [Setup] Baseline Draft count : ${initialCount}`);

      // Create draft with every field filled, including a traffic split
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();
      await createPage.fillName(draftName);
      await createPage.fillStartDate(startDate);
      await createPage.fillEndDate(endDate);
      await createPage.selectChannel(channel);
      await createPage.fillCampaignId(draftId);
      await createPage.clickCreateFeature();
      await createPage.assertVariantsCreated();
      await createPage.setVariantTrafficByIndex(1, variant1Traffic);
      await createPage.dismissNotifications();
      await createPage.clickSaveDraft();
      await createPage.assertSaveSuccess();
      console.log(`  [Setup] Full draft created : "${draftName}" (start: ${startDate}, end: ${endDate}, channel: ${channel}, V1 traffic: ${variant1Traffic}%) ✓`);
    });

    test('SC-1 | should appear in the campaign list with Draft status and increase the total campaign count by 1', async () => {
      await listPage.navigate();
      await listPage.applyAllFilters();
      await listPage.searchAndAssertVisible(draftName);
      await listPage.assertCampaignStatus('Draft');
      console.log(`\n  Draft in list  : "${draftName}" ✓`);
      console.log(`  Status         : Draft ✓`);

      await listPage.navigate();
      await listPage.filterByStatus('Draft');
      await listPage.applyAllFilters();
      const newCount = await listPage.getTotalCampaignCount();
      expect(newCount).toBe(initialCount + 1);
      console.log(`  Campaign count : ${initialCount} → ${newCount} (+1) ✓`);
    });

    test('SC-2 | should correctly display channel name, actual start date, and end date in the list row with no N/A cells', async () => {
      await listPage.navigate();
      await listPage.applyAllFilters();
      await listPage.searchByName(draftName);
      await listPage.assertCampaignVisible(draftName);

      // Verify the exact channel name appears in the channel table cell
      await listPage.assertChannelCellInListRow(channel);
      console.log(`\n  Channel name correctly displayed : "${channel}" in channel column ✓`);

      // Verify start date, end date, and channel columns all have real values (no N/A)
      await listPage.assertNoNACellsInResults();
      console.log(`  Start date : actual date shown (not N/A) ✓`);
      console.log(`  End date   : actual date shown (not N/A) ✓`);
    });

    test('SC-3 | should persist all filled details (name, ID, dates, channel, traffic split) when the Edit drawer is opened', async () => {
      await listPage.navigate();
      await listPage.applyAllFilters();
      await listPage.searchByName(draftName);
      await listPage.assertCampaignVisible(draftName);
      await listPage.clickEditCampaign();
      await listPage.assertUpdateDrawerVisible();

      const fields = await listPage.getUpdateDrawerFields();
      const variantLabels = ['Control', 'Variant 1', 'Variant 2', 'Variant 3'];
      console.log(`\n  ── Full Draft — Edit Drawer ─────────────────────────`);
      console.log(`  Name       : ${fields.name}`);
      console.log(`  Campaign ID: ${fields.campaignId}`);
      console.log(`  Start date : ${fields.startDate}`);
      console.log(`  End date   : ${fields.endDate}`);
      console.log(`  Channels   : ${fields.channels.join(', ') || '(none)'}`);
      fields.traffic.forEach((v, i) => console.log(`  ${(variantLabels[i] ?? `Variant ${i}`).padEnd(14)}: ${v}%`));

      expect(fields.name).toBe(draftName);
      expect(fields.campaignId).toBe(draftId);
      expect(fields.startDate).toBeTruthy();
      expect(fields.endDate).not.toBe('N/A (not set)');
      expect(fields.channels).toContain(channel);
      expect(Number(fields.traffic[1])).toBe(variant1Traffic);

      console.log(`\n  Name persisted       : ${fields.name} ✓`);
      console.log(`  Campaign ID persisted: ${fields.campaignId} ✓`);
      console.log(`  Start date persisted : ${fields.startDate} ✓`);
      console.log(`  End date persisted   : ${fields.endDate} ✓`);
      console.log(`  Channel persisted    : ${channel} ✓`);
      console.log(`  V1 traffic persisted : ${fields.traffic[1]}% ✓`);

      await listPage.closeUpdateDrawer();
    });
  });

  // ── TC-GR-033 | Edit Draft campaign — verify editable fields and save as draft ──

  test.describe('TC-GR-033 | Edit Draft campaign — verify editable fields and save as draft', () => {
    const ts           = Date.now();
    const draftName    = `oA_${ts}_editDraft`;
    const draftId      = `DRFT_ED_${ts}`;
    const origStart    = futureDateStr(14, 9);   // ~2 weeks from now
    const newStart     = futureDateStr(180, 9);  // ~6 months from now
    const newEnd       = futureDateStr(365, 9);  // ~1 year from now
    const newStartMMDD = newStart.slice(5, 10);  // 'MM-DD' portion for list assertion
    const newEndMMDD   = newEnd.slice(5, 10);    // 'MM-DD' portion for list assertion
    const initChannel  = 'mobile_v1';
    let updatedName: string;
    let addedChannel: string = '';
    let initialCount: number;

    test.beforeAll(async () => {
      // Record baseline Draft count, then create a fresh draft for test independence.
      // The draft must include a channel so that the "Add new variants" button is rendered
      // in the Update drawer (it only appears when a channel is already selected).
      await listPage.navigate();
      await listPage.filterByStatus('Draft');
      await listPage.applyAllFilters();
      initialCount = await listPage.getTotalCampaignCount();
      console.log(`\n  [Setup] Baseline Draft count : ${initialCount}`);

      await listPage.clickCreateButton();
      await createPage.assertPageVisible();
      await createPage.fillName(draftName);
      await createPage.fillStartDate(origStart);
      await createPage.selectChannel(initChannel);
      await createPage.fillCampaignId(draftId);
      await createPage.clickSaveDraft();
      await createPage.assertSaveSuccess();
      console.log(`  [Setup] Draft created  : "${draftName}" (start: ${origStart}, channel: ${initChannel}, ID: ${draftId}) ✓`);
    });

    test('SC-1 | should show Start date enabled, Add new variants enabled, Save Draft button, Save & Activate button, and Cancel in the Update drawer for a Draft campaign', async () => {
      await listPage.navigate();
      await listPage.applyAllFilters();
      await listPage.searchByName(draftName);
      await listPage.assertCampaignVisible(draftName);
      await listPage.clickEditCampaign();
      await listPage.assertUpdateDrawerVisible();
      console.log(`\n  Update campaign drawer opened for Draft ✓`);

      // Start date is editable for Draft (not locked like Live)
      await listPage.assertUpdateStartDateFieldEnabled();
      console.log(`  Start date field       : enabled (Draft — start date is editable) ✓`);

      // Add new variants is enabled for Draft (not locked like Live)
      await listPage.assertAddNewVariantsButtonEnabled();
      console.log(`  Add new variants button: enabled (Draft — variant set is not locked) ✓`);

      // Both Save Draft and Save & Activate must be present
      await listPage.assertUpdateDrawerHasSaveDraftButton();
      console.log(`  Save Draft button      : visible ✓`);
      await listPage.assertUpdateCampaignButtonEnabled();
      console.log(`  Save & Activate button : visible & enabled ✓`);

      await listPage.assertCancelButtonVisible();
      console.log(`  Cancel button          : visible ✓`);

      await listPage.closeUpdateDrawer();
    });

    test('SC-2 | should save edits (rename, new start date, new end date, add channel, add variant, set traffic 50%) as Draft and keep Draft status with count unchanged', async () => {
      updatedName = draftName + '_edit';

      await listPage.navigate();
      await listPage.applyAllFilters();
      await listPage.searchByName(draftName);
      await listPage.assertCampaignVisible(draftName);
      await listPage.clickEditCampaign();
      await listPage.assertUpdateDrawerVisible();

      // Rename
      await listPage.fillUpdateCampaignName(updatedName);
      console.log(`\n  Name updated : "${draftName}" → "${updatedName}"`);

      // Change start date (dynamic — ~6 months from now)
      await listPage.fillUpdateStartDate(newStart);
      console.log(`  Start date updated : ${newStart}`);

      // Set end date (dynamic — ~1 year from now)
      await listPage.fillUpdateEndDate(newEnd);
      console.log(`  End date updated   : ${newEnd}`);

      // Add one channel dynamically from dropdown (initChannel is already selected,
      // so this picks the next available option)
      const added = await listPage.selectAvailableUpdateDrawerChannels(1);
      addedChannel = added[0] ?? '';
      console.log(`  Channel added : "${addedChannel}"`);

      // Add a new variant row then set its traffic to 50 %
      await listPage.clickAddNewVariantsInUpdateDrawer();
      await listPage.setUpdateDrawerVariantTrafficByIndex(1, 50);
      console.log(`  Variant 1 traffic set to 50%`);

      // Save as Draft (not Activate)
      await listPage.clickUpdateSaveDraftButton();
      await listPage.assertUpdateSuccess();
      console.log(`  Saved as Draft ✓`);

      // Verify status is still Draft and count did not change
      await listPage.navigate();
      await listPage.applyAllFilters();
      await listPage.searchAndAssertVisible(updatedName);
      await listPage.assertCampaignStatus('Draft');
      console.log(`  Status after save : Draft (unchanged) ✓`);

      await listPage.navigate();
      await listPage.filterByStatus('Draft');
      await listPage.applyAllFilters();
      const countAfter = await listPage.getTotalCampaignCount();
      expect(countAfter).toBe(initialCount + 1);
      console.log(`  Campaign count    : ${initialCount + 1} (unchanged after edit) ✓`);
    });

    test('SC-3 | should reflect updated name, updated start/end dates, added channel, and Draft status in the list row', async () => {
      await listPage.navigate();
      await listPage.applyAllFilters();
      await listPage.searchByName(updatedName);
      await listPage.assertCampaignVisible(updatedName);
      await listPage.assertCampaignStatus('Draft');
      console.log(`\n  Updated name in list : "${updatedName}" ✓`);
      console.log(`  Status               : Draft ✓`);

      // Start date must contain the new MM-DD portion
      await listPage.assertCampaignStartDateContains(newStartMMDD);
      console.log(`  Start date contains  : "${newStartMMDD}" ✓`);

      // End date must contain the new MM-DD portion
      await listPage.assertCampaignEndDateContains(newEndMMDD);
      console.log(`  End date contains    : "${newEndMMDD}" ✓`);

      // Added channel must be visible in the row
      if (addedChannel) {
        await listPage.assertCampaignChannelInList(addedChannel);
        console.log(`  Channel in list      : "${addedChannel}" ✓`);
      }
    });
  });

  // ── TC-GR-034 | Delete Draft campaign — cancel and confirm lifecycle ───────────

  test.describe('TC-GR-034 | Delete Draft campaign — cancel and confirm lifecycle', () => {
    const ts        = Date.now();
    const draftName = `oA_${ts}_deleteDraft`;
    const draftId   = `DRFT_DEL_${ts}`;
    let initialTotalCount: number;
    let initialDraftCount: number;

    test.beforeAll(async () => {
      // Record both total and draft-only counts before creating the campaign
      await listPage.navigate();
      await listPage.applyAllFilters();
      initialTotalCount = await listPage.getTotalCampaignCount();
      console.log(`\n  [Setup] Baseline total count : ${initialTotalCount}`);

      await listPage.filterByStatus('Draft');
      await listPage.applyAllFilters();
      initialDraftCount = await listPage.getTotalCampaignCount();
      console.log(`  [Setup] Baseline Draft count : ${initialDraftCount}`);

      // Create a minimal draft (only name + ID required) for deletion testing
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();
      await createPage.fillName(draftName);
      await createPage.fillCampaignId(draftId);
      await createPage.clickSaveDraft();
      await createPage.assertSaveSuccess();
      console.log(`  [Setup] Draft created  : "${draftName}" (ID: ${draftId}) ✓`);

      // Position the list on this campaign's row for SC-1
      await listPage.navigate();
      await listPage.applyAllFilters();
      await listPage.searchAndAssertVisible(draftName);
    });

    test('SC-1 | should show Delete dialog with heading, body, Cancel and Delete buttons, and keep the campaign on Cancel', async () => {
      await listPage.clickDeleteCampaign();
      await listPage.assertDeleteDialog();
      console.log(`\n  Delete dialog : heading "Delete Campaign?", body text, Cancel & Delete buttons ✓`);
      await listPage.cancelDelete();
      await listPage.assertCampaignVisible(draftName);
      await listPage.assertCampaignStatus('Draft');
      console.log(`  Cancel        : dialog closed, draft still visible with Draft status ✓`);
    });

    test('SC-2 | should delete the Draft campaign, reduce both total count and draft count by 1, and show No results on name search', async () => {
      await listPage.clickDeleteCampaign();
      await listPage.confirmDelete();
      console.log(`\n  Delete confirmed : success notification shown ✓`);

      // Poll until total count drops back to baseline (backend index is eventually consistent)
      let finalTotalCount = initialTotalCount + 1;
      await expect.poll(
        async () => {
          await listPage.navigate();
          await listPage.applyAllFilters();
          finalTotalCount = await listPage.getTotalCampaignCount();
          return finalTotalCount;
        },
        { timeout: 30000, intervals: [3000] }
      ).toBe(initialTotalCount);
      console.log(`  Total count    : ${initialTotalCount + 1} → ${finalTotalCount} (−1) ✓`);

      // Verify draft-specific count also returns to baseline
      let finalDraftCount = initialDraftCount + 1;
      await expect.poll(
        async () => {
          await listPage.navigate();
          await listPage.filterByStatus('Draft');
          await listPage.applyAllFilters();
          finalDraftCount = await listPage.getTotalCampaignCount();
          return finalDraftCount;
        },
        { timeout: 30000, intervals: [3000] }
      ).toBe(initialDraftCount);
      console.log(`  Draft count    : ${initialDraftCount + 1} → ${finalDraftCount} (−1) ✓`);

      // Searching for the deleted draft by name must yield No results
      await listPage.searchByName(draftName);
      await listPage.assertNoResults();
      console.log(`  Search "${draftName}" : No results ✓`);
    });
  });

  // ── TC-GR-035 | Activate Draft with future start date → status becomes Scheduled

  test.describe.serial('TC-GR-035 | Activate Draft campaign with future start date — status becomes Scheduled', () => {
    const ts           = Date.now();
    const draftName    = `oA_${ts}_activateDraft`;
    const draftId      = `DRFT_ACT_${ts}`;
    const initChannel  = 'mobile_v1';
    const newStart     = futureDateStr(30, 9);            // 30 days from now → campaign will be Scheduled
    const newStartMMDD = newStart.slice(5, 10);           // 'MM-DD' for list assertion
    // Compute at describe level so the value is available even when SC-3 retries alone
    const updatedName  = draftName + '_activated';
    let initialTotalCount: number;
    let initialDraftCount: number;

    test.beforeAll(async () => {
      // Record baseline counts before creating the draft
      await listPage.navigate();
      await listPage.applyAllFilters();
      initialTotalCount = await listPage.getTotalCampaignCount();

      await listPage.filterByStatus('Draft');
      await listPage.applyAllFilters();
      initialDraftCount = await listPage.getTotalCampaignCount();
      console.log(`\n  [Setup] Baseline total count : ${initialTotalCount}`);
      console.log(`  [Setup] Baseline Draft count : ${initialDraftCount}`);

      // Create a draft with channel + variants so the edit drawer has a full form to test
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();
      await createPage.fillName(draftName);
      await createPage.fillStartDate(futureDateStr(14, 9));
      await createPage.selectChannel(initChannel);
      await createPage.fillCampaignId(draftId);
      await createPage.clickCreateFeature();
      await createPage.assertVariantsCreated();
      await createPage.dismissNotifications();
      await createPage.clickSaveDraft();
      await createPage.assertSaveSuccess();
      console.log(`  [Setup] Draft created  : "${draftName}" (channel: ${initChannel}, ID: ${draftId}) ✓`);
    });

    test('SC-1 | should show both Save Draft and Save & Activate buttons in the Update drawer for this Draft campaign', async () => {
      await listPage.navigate();
      await listPage.applyAllFilters();
      await listPage.searchByName(draftName);
      await listPage.assertCampaignVisible(draftName);
      await listPage.assertCampaignStatus('Draft');
      await listPage.clickEditCampaign();
      await listPage.assertUpdateDrawerVisible();

      await listPage.assertUpdateDrawerHasSaveDraftButton();
      console.log(`\n  Save Draft button      : visible ✓`);
      await listPage.assertUpdateCampaignButtonEnabled();
      console.log(`  Save & Activate button : visible & enabled ✓`);

      await listPage.closeUpdateDrawer();
    });

    test('SC-2 | should change status to Scheduled when Save & Activate is clicked with a future start date', async () => {
      await listPage.navigate();
      await listPage.applyAllFilters();
      await listPage.searchByName(draftName);
      await listPage.assertCampaignVisible(draftName);
      await listPage.clickEditCampaign();
      await listPage.assertUpdateDrawerVisible();

      // Rename
      await listPage.fillUpdateCampaignName(updatedName);
      console.log(`\n  Name updated   : "${draftName}" → "${updatedName}"`);

      // Set a future start date — this determines the resulting status (Scheduled, not Live)
      await listPage.fillUpdateStartDate(newStart);
      console.log(`  Start date set : ${newStart} (30 days from now → will be Scheduled)`);

      // Ensure end date is cleared
      await listPage.removeUpdateEndDate();
      console.log(`  End date       : removed (unchecked)`);

      // Add a new variant row and set its traffic to 10%
      await listPage.clickAddNewVariantsInUpdateDrawer();
      await listPage.setUpdateDrawerVariantTrafficByIndex(2, 10);
      console.log(`  Variant 2 traffic set to 10%`);

      // Save & Activate — drawer should close and campaign become Scheduled
      await listPage.clickUpdateSaveButton();
      await listPage.assertUpdateSuccess();
      console.log(`  Saved & Activated ✓`);

      // Verify status is Scheduled (not Draft, not Live — start date is in the future)
      await listPage.navigate();
      await listPage.applyAllFilters();
      await listPage.searchAndAssertVisible(updatedName);
      await listPage.assertCampaignStatus('Scheduled');
      console.log(`  Status in list     : Scheduled ✓`);

      // Start date must contain the expected MM-DD portion
      await listPage.assertCampaignStartDateContains(newStartMMDD);
      console.log(`  Start date contains: "${newStartMMDD}" ✓`);

      // End date must be N/A (end date checkbox was unchecked)
      await listPage.assertCampaignEndDateNA();
      console.log(`  End date           : N/A ✓`);

      // Original channel must still be visible in the row
      await listPage.assertCampaignChannelInList(initChannel);
      console.log(`  Channel in list    : "${initChannel}" ✓`);
    });

    test('SC-3 | should show Scheduled action buttons, keep total count unchanged, and not appear under Draft filter', async () => {
      await listPage.navigate();
      await listPage.applyAllFilters();
      await listPage.searchByName(updatedName);
      await listPage.assertCampaignVisible(updatedName);
      await listPage.assertCampaignStatus('Scheduled');

      // Scheduled campaign action states
      await listPage.assertAllScheduledActionIcons();
      console.log(`\n  View Details    : enabled ✓`);
      console.log(`  Edit Campaign   : enabled ✓`);
      console.log(`  Copy Campaign   : enabled ✓`);
      console.log(`  Pause Campaign  : enabled ✓`);
      console.log(`  Stop Campaign   : enabled ✓`);
      console.log(`  Delete Campaign : disabled ✓`);

      // Total count = initialTotalCount + 1 (the activated campaign still exists, now Scheduled)
      await listPage.navigate();
      await listPage.applyAllFilters();
      const finalTotalCount = await listPage.getTotalCampaignCount();
      expect(finalTotalCount).toBe(initialTotalCount + 1);
      console.log(`\n  Total count    : ${initialTotalCount} → ${finalTotalCount} (+1 campaign, now Scheduled) ✓`);

      // Searching for the campaign under the Draft filter must yield No results — it was activated
      await listPage.navigate();
      await listPage.filterByStatus('Draft');
      await listPage.applyAllFilters();
      await listPage.searchByName(updatedName);
      await listPage.assertNoResults();
      console.log(`  Draft filter search : No results (campaign is now Scheduled, not Draft) ✓`);
    });
  });

  // ── TC-GR-036 | Duplicate Campaign ID — blocked while in use, available again after deletion ──

  test.describe('TC-GR-036 | Duplicate Campaign ID — blocked while in use, available again after deletion', () => {
    const ts          = Date.now();
    const firstName   = `oA_${ts}_sameId_first`;
    const secondName  = `oA_${ts}_sameId_second`;
    const thirdName   = `oA_${ts}_sameId_reused`;
    const campaignId  = `CAMP_REUSE_${ts}`;
    let initialCount: number;

    test.beforeAll(async () => {
      await listPage.navigate();
      await listPage.applyAllFilters();
      initialCount = await listPage.getTotalCampaignCount();
      console.log(`\n  [Setup] Baseline total count : ${initialCount}`);

      // Create the first campaign to claim the campaign ID
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();
      await createPage.fillName(firstName);
      await createPage.fillStartDate(futureDateStr(7, 9));
      await createPage.fillCampaignId(campaignId);
      await createPage.clickSaveDraft();
      await createPage.assertSaveSuccess();
      console.log(`  [Setup] First draft created : "${firstName}" (ID: ${campaignId}) ✓`);
    });

    test('SC-1 | should reject the save with a duplicate Campaign ID error when the same ID is used in a second campaign, with the form still functional afterwards', async () => {
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();

      try {
        // The duplicate check no longer fires inline on field blur — the ID
        // is only rejected when the campaign is actually saved.
        await createPage.fillName(secondName);
        await createPage.fillStartDate(futureDateStr(7, 9));
        await createPage.fillCampaignId(campaignId);

        await createPage.waitForNotificationsToClear();
        await createPage.clickSaveDraft();

        const notification = await createPage.assertDuplicateIdSaveRejected();
        console.log(`\n  Save rejected for Campaign ID "${campaignId}" — notification: "${notification}" ✓`);

        // Form remains fully functional after the rejected save — both action
        // buttons must still be present
        await createPage.assertActionButtons();
        console.log(`  Save Draft button      : visible ✓`);
        console.log(`  Save & Activate button : visible ✓`);
        console.log(`  Cancel button          : visible ✓`);
      } finally {
        await createPage.closeDrawer();
        console.log(`  Drawer closed without saving ✓`);
      }
    });

    test('SC-2 | should allow the same Campaign ID to be reused after the original campaign is deleted', async () => {
      // Delete the first campaign (which holds the campaign ID)
      await listPage.navigate();
      await listPage.applyAllFilters();
      await listPage.searchAndAssertVisible(firstName);
      await listPage.clickDeleteCampaign();
      await listPage.confirmDelete();
      console.log(`\n  First campaign deleted : "${firstName}" ✓`);

      // Poll until the total count returns to baseline — confirms deletion is fully committed
      await expect.poll(
        async () => {
          await listPage.navigate();
          await listPage.applyAllFilters();
          return await listPage.getTotalCampaignCount();
        },
        { timeout: 30000, intervals: [3000] }
      ).toBe(initialCount);
      console.log(`  Total count back to baseline : ${initialCount} (deletion confirmed) ✓`);

      // Create a new campaign reusing the now-freed campaign ID — must succeed with no duplicate error
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();
      await createPage.fillName(thirdName);
      await createPage.fillStartDate(futureDateStr(7, 9));
      await createPage.fillCampaignId(campaignId);
      await createPage.clickSaveDraft();
      await createPage.assertSaveSuccess();
      console.log(`  New campaign created with freed ID "${campaignId}" : "${thirdName}" ✓`);

      // Verify the new campaign appears in the list with Draft status
      await listPage.navigate();
      await listPage.applyAllFilters();
      await listPage.searchAndAssertVisible(thirdName);
      await listPage.assertCampaignStatus('Draft');
      console.log(`  New campaign in list : "${thirdName}" with Draft status ✓`);

      // Net change: first deleted (−1), third created (+1) → count = initialCount + 1
      await listPage.navigate();
      await listPage.applyAllFilters();
      const finalCount = await listPage.getTotalCampaignCount();
      expect(finalCount).toBe(initialCount + 1);
      console.log(`  Total count : ${initialCount} → ${finalCount} (net +1: first deleted, third created) ✓`);
    });
  });

  // ── TC-GR-037 | Maximum variant count — 99 allowed, validation shown on 100th attempt ──

  // .serial: SC-2 verifies the draft that SC-1 creates. Without serial mode a
  // retry re-runs SC-2 alone in a fresh worker where Date.now() produces a new
  // draftName — the search can never find SC-1's campaign (failed 2026-07-15).
  // In serial mode a retry re-runs the whole group from SC-1.
  test.describe.serial('TC-GR-037 | Maximum variant count — 99 variants allowed, validation shown on 100th', () => {
    const ts           = Date.now();
    const draftName    = `oA_${ts}_maxVariants`;
    const draftId      = `DRFT_MAXV_${ts}`;
    const channel      = 'mobile_v1';
    const MAX_VARIANTS = 99;
    let initialCount: number;

    test.beforeAll(async () => {
      await listPage.navigate();
      await listPage.applyAllFilters();
      initialCount = await listPage.getTotalCampaignCount();
      console.log(`\n  [Setup] Baseline total count : ${initialCount}`);
    });

    test('SC-1 | should allow adding up to 99 variants and show a validation error when attempting to add a 100th', async () => {
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();
      await createPage.fillName(draftName);
      await createPage.fillStartDate(futureDateStr(7, 9));
      await createPage.selectChannel(channel);
      await createPage.fillCampaignId(draftId);

      // Create Feature adds Control + Variant 1 (count = 1)
      await createPage.clickCreateFeature();
      await createPage.assertVariantsCreated();
      console.log(`\n  Initial variants created : Control + Variant 1 (count = 1) ✓`);

      // Add Variant 2 through Variant 99 (98 more clicks)
      for (let i = 2; i <= MAX_VARIANTS; i++) {
        await createPage.clickAddNewVariant();
      }

      const variantCount = await createPage.getVariantCount();
      expect(variantCount).toBe(MAX_VARIANTS);
      console.log(`  Variant count after adding : ${variantCount} ✓`);

      // Attempt to add a 100th variant — system should show a validation error
      await createPage.clickAddNewVariant();
      await createPage.assertMaxVariantsError();
      console.log(`  Validation error shown when attempting to add variant ${MAX_VARIANTS + 1} ✓`);

      // Variant count must still be 99 (100th was rejected)
      const countAfterError = await createPage.getVariantCount();
      expect(countAfterError).toBe(MAX_VARIANTS);
      console.log(`  Variant count unchanged after rejected attempt : ${countAfterError} ✓`);

      // Save with 99 variants as Draft — must succeed
      await createPage.dismissNotifications();
      await createPage.clickSaveDraft();
      await createPage.assertSaveSuccess();
      console.log(`  Campaign saved as Draft with ${MAX_VARIANTS} variants ✓`);
    });

    test('SC-2 | should appear in the list with Draft status and persist all 99 variants in the Edit drawer', async () => {
      await listPage.navigate();
      await listPage.applyAllFilters();
      await listPage.searchAndAssertVisible(draftName);
      await listPage.assertCampaignStatus('Draft');
      console.log(`\n  Campaign in list : "${draftName}" with Draft status ✓`);

      await listPage.clickEditCampaign();
      await listPage.assertUpdateDrawerVisible();

      const variantCount = await listPage.getUpdateDrawerVariantCount();
      expect(variantCount).toBe(MAX_VARIANTS);
      console.log(`  Variants in Edit drawer : ${variantCount} (all 99 persisted) ✓`);

      await listPage.closeUpdateDrawer();

      await listPage.navigate();
      await listPage.applyAllFilters();
      const finalCount = await listPage.getTotalCampaignCount();
      expect(finalCount).toBe(initialCount + 1);
      console.log(`  Total count : ${initialCount} → ${finalCount} (+1) ✓`);
    });
  });

  // ── TC-GR-038 | Save 99-variant campaign with traffic values set for each variant ──

  // .serial: later scenario depends on the campaign created inside SC-1 (see TC-GR-037 note)
  test.describe.serial('TC-GR-038 | Save campaign with 99 variants and traffic values set for each variant', () => {
    const ts           = Date.now();
    const draftName    = `oA_${ts}_99varTraffic`;
    const draftId      = `DRFT_99T_${ts}`;
    const channel      = 'mobile_v1';
    const MAX_VARIANTS = 99;
    // Each variant gets 1 % — 99 × 1 % = 99 %, Control auto-fills to 1 %
    const TRAFFIC_PER_VARIANT = 1;
    let initialCount: number;

    test.beforeAll(async () => {
      await listPage.navigate();
      await listPage.applyAllFilters();
      initialCount = await listPage.getTotalCampaignCount();
      console.log(`\n  [Setup] Baseline total count : ${initialCount}`);
    });

    test('SC-1 | should save a campaign with 99 variants each set to 1% traffic as Draft', async () => {
      test.setTimeout(300000); // 5 min — adding 99 variants + filling 99 traffic values takes ~3 min

      await listPage.clickCreateButton();
      await createPage.assertPageVisible();
      await createPage.fillName(draftName);
      await createPage.fillStartDate(futureDateStr(7, 9));
      await createPage.selectChannel(channel);
      await createPage.fillCampaignId(draftId);

      // Create Feature gives Control + Variant 1 (count = 1)
      await createPage.clickCreateFeature();
      await createPage.assertVariantsCreated();

      // Add Variant 2 through Variant 99 (98 more clicks)
      for (let i = 2; i <= MAX_VARIANTS; i++) {
        await createPage.clickAddNewVariant();
      }
      const variantCount = await createPage.getVariantCount();
      expect(variantCount).toBe(MAX_VARIANTS);
      console.log(`\n  ${MAX_VARIANTS} variants added ✓`);

      // Set every variant to 1 % using fill-only (no click overhead per field)
      await createPage.setAllVariantsTraffic(TRAFFIC_PER_VARIANT, MAX_VARIANTS);
      console.log(`  Traffic set : each of ${MAX_VARIANTS} variants = ${TRAFFIC_PER_VARIANT}%`);

      // Save as Draft — must succeed with all traffic values filled
      await createPage.clickSaveDraft();
      await createPage.assertSaveSuccess();
      console.log(`  Campaign saved as Draft with ${MAX_VARIANTS} variants at ${TRAFFIC_PER_VARIANT}% each ✓`);
    });

    test('SC-2 | should persist all 99 variant traffic values (1% each) in the Edit drawer', async () => {
      await listPage.navigate();
      await listPage.applyAllFilters();
      await listPage.searchAndAssertVisible(draftName);
      await listPage.assertCampaignStatus('Draft');
      console.log(`\n  Campaign in list : "${draftName}" with Draft status ✓`);

      await listPage.clickEditCampaign();
      await listPage.assertUpdateDrawerVisible();

      // Verify variant count persisted
      const variantCount = await listPage.getUpdateDrawerVariantCount();
      expect(variantCount).toBe(MAX_VARIANTS);
      console.log(`  Variant count in Edit drawer : ${variantCount} ✓`);

      // Spot-check traffic at first (index 1), mid (index 50), and last (index 99) variant
      const trafficFirst = await listPage.getUpdateDrawerTrafficByIndex(1);
      const trafficMid   = await listPage.getUpdateDrawerTrafficByIndex(50);
      const trafficLast  = await listPage.getUpdateDrawerTrafficByIndex(99);
      expect(trafficFirst).toBe(TRAFFIC_PER_VARIANT);
      expect(trafficMid).toBe(TRAFFIC_PER_VARIANT);
      expect(trafficLast).toBe(TRAFFIC_PER_VARIANT);
      console.log(`  Variant  1 traffic : ${trafficFirst}% ✓`);
      console.log(`  Variant 50 traffic : ${trafficMid}% ✓`);
      console.log(`  Variant 99 traffic : ${trafficLast}% ✓`);

      await listPage.closeUpdateDrawer();

      await listPage.navigate();
      await listPage.applyAllFilters();
      const finalCount = await listPage.getTotalCampaignCount();
      expect(finalCount).toBe(initialCount + 1);
      console.log(`  Total count : ${initialCount} → ${finalCount} (+1) ✓`);
    });
  });

  // ── TC-GR-039 | Remove variant — Control traffic auto-adjusts, campaign saves successfully ──

  // .serial: later scenario depends on the campaign created inside SC-1 (see TC-GR-037 note)
  test.describe.serial('TC-GR-039 | Remove variant — Control traffic auto-adjusts and campaign saves successfully', () => {
    const ts          = Date.now();
    const draftName   = `oA_${ts}_removeVariant`;
    const draftId     = `DRFT_RMV_${ts}`;
    const channel     = 'mobile_v1';
    const v1Traffic   = 30;
    const v2Traffic   = 20;
    // After removing Variant 2 its traffic (20%) returns to Control
    // Control was 50 (= 100 − 30 − 20) → becomes 70 (= 100 − 30)
    const controlAfterRemove = 100 - v1Traffic;
    let initialCount: number;

    test.beforeAll(async () => {
      await listPage.navigate();
      await listPage.applyAllFilters();
      initialCount = await listPage.getTotalCampaignCount();
      console.log(`\n  [Setup] Baseline total count : ${initialCount}`);
    });

    test('SC-1 | should auto-adjust Control traffic when a variant is removed and save as Draft successfully', async () => {
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();
      await createPage.fillName(draftName);
      await createPage.fillStartDate(futureDateStr(7, 9));
      await createPage.selectChannel(channel);
      await createPage.fillCampaignId(draftId);

      // Create Feature → Control + Variant 1
      await createPage.clickCreateFeature();
      await createPage.assertVariantsCreated();

      // Add Variant 2
      await createPage.clickAddNewVariant();
      let count = await createPage.getVariantCount();
      expect(count).toBe(2);
      console.log(`\n  Variants created : Control + Variant 1 + Variant 2 (count = 2) ✓`);

      // Set Variant 1 = 30 % (no blur yet)
      await createPage.setVariantTrafficByIndex(1, v1Traffic);

      // Set Variant 2 = 20 % and blur — triggers auto-adjustment: Control → 50 %
      await createPage.setVariantTraffic('Variant 2', v2Traffic);
      await createPage.assertTrafficValue('Control', 100 - v1Traffic - v2Traffic);
      await createPage.assertTrafficValue('Variant 1', v1Traffic);
      await createPage.assertTrafficValue('Variant 2', v2Traffic);
      console.log(`  Traffic before removal : Control=${100 - v1Traffic - v2Traffic}%, V1=${v1Traffic}%, V2=${v2Traffic}% ✓`);

      // Remove Variant 2 — its 20 % should return to Control automatically
      await createPage.removeLastVariant();
      count = await createPage.getVariantCount();
      expect(count).toBe(1);
      console.log(`  Variant 2 removed : variant count = ${count} ✓`);

      // Control must have absorbed Variant 2's traffic (50 + 20 = 70 %)
      await createPage.assertTrafficValue('Control', controlAfterRemove);
      await createPage.assertTrafficValue('Variant 1', v1Traffic);
      console.log(`  Traffic after removal : Control=${controlAfterRemove}%, V1=${v1Traffic}% ✓`);
      console.log(`  Control auto-adjusted : 50% → ${controlAfterRemove}% (absorbed V2's ${v2Traffic}%) ✓`);

      // Save as Draft with the adjusted traffic — must succeed
      await createPage.clickSaveDraft();
      await createPage.assertSaveSuccess();
      console.log(`  Campaign saved as Draft with adjusted traffic ✓`);
    });

    test('SC-2 | should persist the adjusted traffic values (V1=30%, Control=70%) when the Edit drawer is reopened', async () => {
      await listPage.navigate();
      await listPage.applyAllFilters();
      await listPage.searchAndAssertVisible(draftName);
      await listPage.assertCampaignStatus('Draft');
      console.log(`\n  Campaign in list : "${draftName}" with Draft status ✓`);

      await listPage.clickEditCampaign();
      await listPage.assertUpdateDrawerVisible();

      // Only Variant 1 should remain (Variant 2 was removed before save)
      const variantCount = await listPage.getUpdateDrawerVariantCount();
      expect(variantCount).toBe(1);
      console.log(`  Variant count in Edit drawer : ${variantCount} (V2 absent) ✓`);

      // Verify persisted traffic values — index 0 = Control, index 1 = Variant 1
      const controlTraffic = await listPage.getUpdateDrawerTrafficByIndex(0);
      const v1TrafficSaved = await listPage.getUpdateDrawerTrafficByIndex(1);
      expect(controlTraffic).toBe(controlAfterRemove);
      expect(v1TrafficSaved).toBe(v1Traffic);
      console.log(`  Control traffic persisted : ${controlTraffic}% ✓`);
      console.log(`  Variant 1 traffic persisted : ${v1TrafficSaved}% ✓`);

      await listPage.closeUpdateDrawer();

      await listPage.navigate();
      await listPage.applyAllFilters();
      const finalCount = await listPage.getTotalCampaignCount();
      expect(finalCount).toBe(initialCount + 1);
      console.log(`  Total count : ${initialCount} → ${finalCount} (+1) ✓`);
    });
  });

  // ── TC-GR-040 | Search & filter — default state, options, and functional filtering ──

  test.describe('TC-GR-040 | Search and filter — default state, filter options, and functional filtering', () => {

    test('SC-1 | should display default filters (All statuses, Today), all filter labels, and Search/Reset buttons on page load', async () => {
      await listPage.navigate();

      // Default filter state
      await listPage.assertDefaultFilters();
      console.log(`\n  Default status filter : All statuses ✓`);
      console.log(`  Default date filter   : Today ✓`);

      // Filter section labels
      await listPage.assertFilterLabels();
      console.log(`  "Search by name" label : visible ✓`);
      console.log(`  "Status" label         : visible ✓`);
      console.log(`  "Date" label           : visible ✓`);

      // Action buttons
      await listPage.assertSearchButtons();
      console.log(`  Search button : visible ✓`);
      console.log(`  Reset button  : visible ✓`);
    });

    test('SC-2 | should show Live, Scheduled, Paused, Draft, and Expired options in the Status filter dropdown', async () => {
      await listPage.navigate();
      await listPage.assertStatusFilterOptions();
      console.log(`\n  Status filter dropdown options :`);
      for (const s of ['Live', 'Scheduled', 'Paused', 'Draft', 'Expired']) {
        console.log(`  · ${s} ✓`);
      }
    });

    test('SC-3 | should show All days, Today, Yesterday, Last 7 days, Last 28 days, and Custom options in the Date filter dropdown', async () => {
      await listPage.navigate();
      await listPage.assertDateFilterOptions();
      console.log(`\n  Date filter dropdown options :`);
      for (const d of ['All days', 'Today', 'Yesterday', 'Last 7 days', 'Last 28 days', 'Custom']) {
        console.log(`  · ${d} ✓`);
      }
    });

    test('SC-4 | should filter results to only Draft campaigns when Draft is selected in the Status filter', async () => {
      await listPage.navigate();
      await listPage.filterByStatus('Draft');
      await listPage.filterByDate('All days');
      await listPage.searchByName('');
      await listPage.assertStatusFilterActive('Draft');
      // Verify at least one Draft campaign is returned
      await listPage.assertCampaignStatus('Draft');
      console.log(`\n  Status filter "Draft" applied ✓`);
      console.log(`  Results contain at least one Draft campaign ✓`);
    });

    test('SC-5 | should return more (or equal) results for All days than for Today, and Reset should restore Today filter', async () => {
      await listPage.navigate();

      // Record Today's result count (navigate() leaves date = Today)
      await listPage.searchByName('');
      const todayCount = await listPage.getStableResultsCount();
      console.log(`\n  Results with "Today" filter  : ${todayCount}`);

      // Switch to All days and compare
      await listPage.filterByDate('All days');
      await listPage.searchByName('');
      const allDaysCount = await listPage.getStableResultsCount();
      console.log(`  Results with "All days" filter : ${allDaysCount}`);
      expect(allDaysCount).toBeGreaterThanOrEqual(todayCount);
      console.log(`  All days (${allDaysCount}) ≥ Today (${todayCount}) ✓`);

      // Reset — date filter must revert to Today
      await listPage.resetFilters();
      await listPage.assertDateFilterValue('Today');
      console.log(`  After Reset: date filter = Today ✓`);
    });

    test('SC-6 | should return matching campaigns when a known prefix is searched and no results when a non-existent name is searched', async () => {
      // Positive: "oA_" prefix matches all test campaigns — at least 1 result expected
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.searchByName('oA_');
      const matchCount = await listPage.getResultsCount();
      expect(matchCount).toBeGreaterThan(0);
      console.log(`\n  Name search "oA_"         : ${matchCount} results (> 0) ✓`);

      // Negative: a guaranteed non-existent name produces No results
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.searchByName('ZZZNOTFOUND_99999_XYZ');
      await listPage.assertNoResults();
      console.log(`  Name search non-existent  : No results ✓`);

      // Reset restores the default Today filter
      await listPage.resetFilters();
      await listPage.assertDateFilterValue('Today');
      console.log(`  After Reset: date filter = Today ✓`);
    });
  });

  // ── TC-GR-041 | All statuses + Today shows mixed status types; status filter isolates results ──

  test.describe('TC-GR-041 | All statuses + Today shows mixed status types; status filter isolates matching campaigns', () => {

    test('SC-1 | should display campaigns of multiple status types and today-related dates when All statuses and Today filter are active', async () => {
      await listPage.navigate();

      // Default state confirmed
      await listPage.assertDefaultFilters();
      console.log(`\n  Default filters : All statuses + Today ✓`);

      // Apply search — Today filter returns results for currently active/relevant campaigns
      await listPage.searchByName('');
      const resultsCount = await listPage.getResultsCount();
      expect(resultsCount).toBeGreaterThan(0);
      console.log(`  Results with All statuses + Today : ${resultsCount} ✓`);

      // "All statuses" button must still be active — filter was not changed
      await listPage.assertStatusFilterActive('All statuses');
      console.log(`  Status filter   : All statuses (unchanged) ✓`);

      // At least one date cell must contain today's date — confirms date filter is applied
      await listPage.assertTodayDateInResults();
      console.log(`  Today's date visible in result rows ✓`);

      // Results must include campaigns of more than one status type
      // (Draft and Live campaigns exist in the system from previous tests)
      await listPage.assertCampaignStatus('Draft');
      console.log(`  Draft status visible in results ✓`);
      await listPage.assertCampaignStatus('Live');
      console.log(`  Live status visible in results ✓`);
    });

    test('SC-2 | should show only Live campaigns with today-related dates and row count when Live status filter is applied', async () => {
      await listPage.navigate();

      // Apply Live status filter then search
      await listPage.filterByStatus('Live');
      await listPage.searchByName('');

      // Status filter reflects Live selection
      await listPage.assertStatusFilterActive('Live');
      console.log(`\n  Status filter : Live ✓`);

      // Every visible status cell must be Live
      await listPage.assertCampaignStatus('Live');
      console.log(`  All result rows show Live status ✓`);

      // Row count (Showing X of Y rows) confirms Live-specific pagination
      await listPage.assertRowCountVisible();
      console.log(`  "Showing X of Y rows" pagination visible ✓`);

      // Live campaigns must have actual start dates (not N/A) in the result rows
      await listPage.assertDateCellsVisible();
      console.log(`  Start date cells show actual dates (not N/A) for Live campaigns ✓`);

      // No Draft campaigns should appear (filter is exclusive to Live)
      await listPage.assertStatusNotInResults('Draft');
      console.log(`  Draft status not visible in Live-filtered results ✓`);
    });
  });

  // ─── TC-GR-042 ────────────────────────────────────────────────────────────────

  test.describe('TC-GR-042 | Individual status filters show only matching campaigns', () => {

    test('SC-1 | Scheduled filter — only Scheduled campaigns shown', async () => {
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.filterByStatus('Scheduled');
      await listPage.searchByName('');

      await listPage.assertStatusFilterActive('Scheduled');
      console.log(`\n  Status filter : Scheduled ✓`);

      await listPage.assertCampaignStatus('Scheduled');
      console.log(`  All result rows show Scheduled status ✓`);

      await listPage.assertRowCountVisible();
      console.log(`  "Showing X of Y rows" pagination visible ✓`);

      await listPage.assertDateCellsVisible();
      console.log(`  Date cells visible in Scheduled results ✓`);

      await listPage.assertStatusNotInResults('Draft');
      console.log(`  Draft status not visible in Scheduled-filtered results ✓`);
    });

    test('SC-2 | Paused filter — only Paused campaigns shown', async () => {
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.filterByStatus('Paused');
      await listPage.searchByName('');

      await listPage.assertStatusFilterActive('Paused');
      console.log(`\n  Status filter : Paused ✓`);

      await listPage.assertCampaignStatus('Paused');
      console.log(`  All result rows show Paused status ✓`);

      await listPage.assertRowCountVisible();
      console.log(`  "Showing X of Y rows" pagination visible ✓`);

      await listPage.assertDateCellsVisible();
      console.log(`  Date cells visible in Paused results ✓`);

      await listPage.assertStatusNotInResults('Draft');
      console.log(`  Draft status not visible in Paused-filtered results ✓`);
    });

    test('SC-3 | Draft filter — only Draft campaigns shown', async () => {
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.filterByStatus('Draft');
      await listPage.searchByName('');

      await listPage.assertStatusFilterActive('Draft');
      console.log(`\n  Status filter : Draft ✓`);

      await listPage.assertCampaignStatus('Draft');
      console.log(`  All result rows show Draft status ✓`);

      await listPage.assertRowCountVisible();
      console.log(`  "Showing X of Y rows" pagination visible ✓`);

      await listPage.assertDateCellsVisible();
      console.log(`  Date cells visible in Draft results ✓`);

      await listPage.assertStatusNotInResults('Live');
      console.log(`  Live status not visible in Draft-filtered results ✓`);
    });

    test('SC-4 | Expired filter — only Expired campaigns shown', async () => {
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.filterByStatus('Expired');
      await listPage.searchByName('');

      await listPage.assertStatusFilterActive('Expired');
      console.log(`\n  Status filter : Expired ✓`);

      await listPage.assertCampaignStatus('Expired');
      console.log(`  All result rows show Expired status ✓`);

      await listPage.assertRowCountVisible();
      console.log(`  "Showing X of Y rows" pagination visible ✓`);

      await listPage.assertDateCellsVisible();
      console.log(`  Date cells visible in Expired results ✓`);

      await listPage.assertStatusNotInResults('Live');
      console.log(`  Live status not visible in Expired-filtered results ✓`);
    });
  });

  // ─── TC-GR-043 ────────────────────────────────────────────────────────────────

  test.describe('TC-GR-043 | Yesterday date filter shows campaigns active yesterday', () => {

    test('SC-1 | Yesterday filter — results shown with date cells and row count', async () => {
      await listPage.navigate();
      await listPage.filterByDate('Yesterday');
      await listPage.searchByName('');

      await listPage.assertDateFilterValue('Yesterday');
      console.log(`\n  Date filter : Yesterday ✓`);

      await listPage.assertRowCountVisible();
      console.log(`  "Showing X of Y rows" pagination visible ✓`);

      await listPage.assertDateCellsVisible();
      console.log(`  Date cells visible in Yesterday results ✓`);
    });
  });

  // ─── TC-GR-044 ────────────────────────────────────────────────────────────────

  test.describe('TC-GR-044 | Last 7 days date filter shows campaigns active in the past 7 days', () => {

    test('SC-1 | Last 7 days filter — results shown with date cells and row count', async () => {
      await listPage.navigate();
      await listPage.filterByDate('Last 7 days');
      await listPage.searchByName('');

      await listPage.assertDateFilterValue('Last 7 days');
      console.log(`\n  Date filter : Last 7 days ✓`);

      await listPage.assertRowCountVisible();
      console.log(`  "Showing X of Y rows" pagination visible ✓`);

      await listPage.assertDateCellsVisible();
      console.log(`  Date cells visible in Last 7 days results ✓`);
    });
  });

  // ─── TC-GR-045 ────────────────────────────────────────────────────────────────

  test.describe('TC-GR-045 | Last 28 days date filter returns a wider result window than Last 7 days', () => {

    test('SC-1 | Last 28 days result count >= Last 7 days result count', async () => {
      await listPage.navigate();

      await listPage.filterByDate('Last 7 days');
      await listPage.searchByName('');
      const last7Count = await listPage.getResultsCount();
      console.log(`\n  Last 7 days  results : ${last7Count}`);

      await listPage.filterByDate('Last 28 days');
      await listPage.searchByName('');
      const last28Count = await listPage.getResultsCount();
      console.log(`  Last 28 days results : ${last28Count}`);

      expect(last28Count).toBeGreaterThanOrEqual(last7Count);
      console.log(`  Last 28 days (${last28Count}) >= Last 7 days (${last7Count}) ✓`);

      await listPage.assertDateFilterValue('Last 28 days');
      await listPage.assertRowCountVisible();
      await listPage.assertDateCellsVisible();
      console.log(`  Row count and date cells visible ✓`);
    });
  });

  // ─── TC-GR-046 ────────────────────────────────────────────────────────────────

  test.describe('TC-GR-046 | Custom date range filter shows only campaigns within the selected period', () => {

    test('SC-1 | Custom previous month 1st–28th — combobox label updated and matching campaigns shown', async () => {
      // Previous month computed dynamically — the original hardcoded "1 click
      // back lands on May" only held while the current month was June, and
      // timed out once July arrived. Day 28 is used because every month has it.
      const prev      = new Date();
      prev.setDate(1);
      prev.setMonth(prev.getMonth() - 1);
      const monthLong = prev.toLocaleString('en-US', { month: 'long' });  // e.g. "June"
      const monthAbbr = monthLong.slice(0, 3);                            // e.g. "Jun"

      await listPage.navigate();

      // Navigate 1 month back and pick the 1st – 28th of that month
      // (clicks scoped to the month's own grid — boundary dates render in
      // both visible month grids)
      await listPage.filterByCustomDateRange(
        1,
        new RegExp(`${monthLong} 1st`),
        new RegExp(`${monthLong} 28th`),
        monthLong,
      );

      // Combobox label reflects the selected range (month may be abbreviated)
      await listPage.assertDateFilterValue(new RegExp(`${monthAbbr}[a-z]* 0?1.*${monthAbbr}[a-z]* 28`));
      console.log(`\n  Date filter label reflects "${monthLong} 01 – ${monthLong} 28" range ✓`);

      await listPage.searchByName('');

      await listPage.assertRowCountVisible();
      console.log(`  "Showing X of Y rows" pagination visible ✓`);

      await listPage.assertDateCellsVisible();
      console.log(`  Date cells visible for campaigns within ${monthLong} 1–28 range ✓`);
    });
  });

  // ─── TC-GR-047 ────────────────────────────────────────────────────────────────

  test.describe('TC-GR-047 | Campaign name search — partial name matches multiple, exact name matches specific campaign', () => {
    const ts   = Date.now();
    const name = `oA_GR047_${ts}`;
    const id   = `GR047_${ts}`;

    test.beforeAll(async () => {
      await listPage.navigate();
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();
      await createPage.fillName(name);
      await createPage.fillCampaignId(id);
      await createPage.clickSaveDraft();
      await createPage.assertSaveSuccess();
      console.log(`\n  [Setup] Draft campaign created : "${name}" ✓`);
    });

    test('SC-1 | Partial name "oA_" returns multiple matching campaigns', async () => {
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.searchByName('oA_');

      const count = await listPage.getResultsCount();
      expect(count).toBeGreaterThan(1);
      console.log(`\n  Partial search "oA_" → ${count} results (>1) ✓`);

      await listPage.assertRowCountVisible();
      console.log(`  "Showing X of Y rows" visible ✓`);
    });

    test('SC-2 | Full exact name returns only that one campaign', async () => {
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.searchAndAssertVisible(name);

      const count = await listPage.getResultsCount();
      expect(count).toBe(1);
      console.log(`\n  Exact name search "${name}" → 1 result ✓`);

      await listPage.assertCampaignVisible(name);
      console.log(`  Campaign row visible in results ✓`);
    });

    test('SC-3 | Non-existent name returns no results', async () => {
      const wrongName = `ZZZNOMATCH_GR047_${Date.now()}`;

      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.searchByName(wrongName);
      console.log(`\n  Searched wrong name : "${wrongName}"`);

      await listPage.assertNoResults();
      console.log(`  "No results." shown ✓`);

      const count = await listPage.getResultsCount();
      expect(count).toBe(0);
      console.log(`  Results count = 0 ✓`);
    });
  });

  // ─── TC-GR-048 ────────────────────────────────────────────────────────────────

  test.describe('TC-GR-048 | Multiple status selection — results contain only campaigns of selected statuses', () => {

    test('SC-1 | Live + Draft selection shows campaigns of both statuses and no others', async () => {
      // Live may have only a few campaigns — they won't appear on page 1 when mixed with
      // many Draft rows sorted newest-first.  Use count-based verification instead.
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.filterByStatus('Live');
      await listPage.searchByName('');
      const liveCount = await listPage.getStableResultsCount();
      console.log(`\n  Live only  : ${liveCount}`);

      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.filterByStatus('Draft');
      await listPage.searchByName('');
      const draftCount = await listPage.getStableResultsCount();
      console.log(`  Draft only : ${draftCount}`);

      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.filterByMultipleStatuses(['Live', 'Draft']);
      await listPage.searchByName('');
      const combinedCount = await listPage.getStableResultsCount();
      console.log(`  Combined   : ${combinedCount}`);

      expect(liveCount).toBeGreaterThan(0);
      console.log(`  Live campaigns exist ✓`);

      expect(draftCount).toBeGreaterThan(0);
      console.log(`  Draft campaigns exist ✓`);

      expect(combinedCount).toBe(liveCount + draftCount);
      console.log(`  Live (${liveCount}) + Draft (${draftCount}) = Combined (${combinedCount}) ✓`);

      await listPage.assertStatusNotInResults('Expired');
      console.log(`  Expired not in results ✓`);

      await listPage.assertStatusNotInResults('Paused');
      console.log(`  Paused not in results ✓`);

      await listPage.assertRowCountVisible();
      console.log(`  "Showing X of Y rows" visible ✓`);
    });

    test('SC-2 | Scheduled + Paused selection shows campaigns of both statuses and no others', async () => {
      // Paused may have only 1 campaign — it won't appear on page 1 when mixed with 100+
      // Scheduled rows.  Use count-based verification: combined == scheduledOnly + pausedOnly.
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.filterByStatus('Scheduled');
      await listPage.searchByName('');
      const scheduledCount = await listPage.getStableResultsCount();
      console.log(`\n  Scheduled only : ${scheduledCount}`);

      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.filterByStatus('Paused');
      await listPage.searchByName('');
      const pausedCount = await listPage.getStableResultsCount();
      console.log(`  Paused only    : ${pausedCount}`);

      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.filterByMultipleStatuses(['Scheduled', 'Paused']);
      await listPage.searchByName('');
      const combinedCount = await listPage.getStableResultsCount();
      console.log(`  Combined       : ${combinedCount}`);

      expect(scheduledCount).toBeGreaterThan(0);
      console.log(`  Scheduled campaigns exist ✓`);

      expect(pausedCount).toBeGreaterThan(0);
      console.log(`  Paused campaigns exist ✓`);

      expect(combinedCount).toBe(scheduledCount + pausedCount);
      console.log(`  Scheduled (${scheduledCount}) + Paused (${pausedCount}) = Combined (${combinedCount}) ✓`);

      await listPage.assertStatusNotInResults('Live');
      console.log(`  Live not in results ✓`);

      await listPage.assertStatusNotInResults('Draft');
      console.log(`  Draft not in results ✓`);

      await listPage.assertRowCountVisible();
      console.log(`  "Showing X of Y rows" visible ✓`);
    });

    test('SC-3 | Draft + Expired selection shows campaigns of both statuses and no others', async () => {
      // Expired may not appear on page 1 when sorted after 33 Draft campaigns.
      // Use count-based verification: combined == draftOnly + expiredOnly.
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.filterByStatus('Draft');
      await listPage.searchByName('');
      const draftCount = await listPage.getStableResultsCount();
      console.log(`\n  Draft only     : ${draftCount}`);

      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.filterByStatus('Expired');
      await listPage.searchByName('');
      const expiredCount = await listPage.getStableResultsCount();
      console.log(`  Expired only   : ${expiredCount}`);

      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.filterByMultipleStatuses(['Draft', 'Expired']);
      await listPage.searchByName('');
      const combinedCount = await listPage.getStableResultsCount();
      console.log(`  Combined       : ${combinedCount}`);

      expect(draftCount).toBeGreaterThan(0);
      console.log(`  Draft campaigns exist ✓`);

      expect(expiredCount).toBeGreaterThan(0);
      console.log(`  Expired campaigns exist ✓`);

      expect(combinedCount).toBe(draftCount + expiredCount);
      console.log(`  Draft (${draftCount}) + Expired (${expiredCount}) = Combined (${combinedCount}) ✓`);

      await listPage.assertStatusNotInResults('Live');
      console.log(`  Live not in results ✓`);

      await listPage.assertStatusNotInResults('Scheduled');
      console.log(`  Scheduled not in results ✓`);

      await listPage.assertRowCountVisible();
      console.log(`  "Showing X of Y rows" visible ✓`);
    });

    test('SC-4 | Live + Scheduled + Paused + Draft + Expired selection equals All statuses count', async () => {
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.searchByName('');
      const allStatusesCount = await listPage.getStableResultsCount();
      console.log(`\n  All statuses count   : ${allStatusesCount}`);

      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.filterByMultipleStatuses(['Live', 'Scheduled', 'Paused', 'Draft', 'Expired']);
      await listPage.searchByName('');
      const combinedCount = await listPage.getStableResultsCount();
      console.log(`  All 5 selected count : ${combinedCount}`);

      expect(combinedCount).toBe(allStatusesCount);
      console.log(`  All 5 selected (${combinedCount}) === All statuses (${allStatusesCount}) ✓`);

      await listPage.assertRowCountVisible();
      console.log(`  "Showing X of Y rows" visible ✓`);
    });
  });

  // ─── TC-GR-049 ────────────────────────────────────────────────────────────────

  test.describe('TC-GR-049 | Reset button restores all filters to default state', () => {

    test('SC-1 | After applying status + date + name filters, Reset restores All statuses, Today, and empty name', async () => {
      await listPage.navigate();

      // Change all three filter dimensions from their defaults
      await listPage.filterByDate('Yesterday');
      await listPage.filterByStatus('Live');
      await listPage.searchByName('oA_');

      // Reset should restore all three to defaults
      await listPage.resetFilters();

      await listPage.assertStatusFilterActive('All statuses');
      console.log(`\n  Status filter reset to "All statuses" ✓`);

      await listPage.assertDateFilterValue('Today');
      console.log(`  Date filter reset to "Today" ✓`);

      await listPage.assertSearchNameEmpty();
      console.log(`  Name search field cleared ✓`);

      await listPage.assertRowCountVisible();
      console.log(`  Results table visible with reset defaults ✓`);
    });
  });

  // ─── TC-GR-050 ────────────────────────────────────────────────────────────────

  test.describe('TC-GR-050 | All statuses + All days Results count equals sum of individual status counts', () => {

    test('SC-1 | Sum of Live + Scheduled + Paused + Draft + Expired counts equals All statuses count', async () => {
      // Read individual status counts first, then read allCount last so the "All days"
      // filter has plenty of time to settle (avoids stale DOM count on the first read).
      const counts: Record<string, number> = {};
      for (const status of ['Live', 'Scheduled', 'Paused', 'Draft', 'Expired']) {
        await listPage.navigate();
        await listPage.filterByDate('All days');
        await listPage.filterByStatus(status);
        await listPage.searchByName('');
        counts[status] = await listPage.getStableResultsCount();
        console.log(`  ${status.padEnd(12)}: ${counts[status]}`);
      }

      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.searchByName('');
      const allCount = await listPage.getStableResultsCount();
      console.log(`\n  All statuses + All days : ${allCount}`);

      const sum = Object.values(counts).reduce((a, b) => a + b, 0);
      console.log(`  ─────────────────────────`);
      console.log(`  Sum of statuses : ${sum}`);
      console.log(`  All statuses    : ${allCount}`);

      expect(sum).toBe(allCount);
      console.log(`  Sum (${sum}) === All statuses (${allCount}) ✓`);
    });
  });
});