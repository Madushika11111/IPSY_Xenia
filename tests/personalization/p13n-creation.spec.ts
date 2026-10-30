import { test, expect, Browser, Page } from '@playwright/test';
import { SpacePage } from '../../pages/SpacePage';
import { PersonalizationCreatePage } from '../../pages/PersonalizationCreatePage';
import { CampaignListPage } from '../../pages/CampaignListPage';
import { config } from '../../config/config';
import { loadTestData } from '../../utils/helpers';
import { PersonalizationTestData } from '../../data/types';

// ─── Date helper (native datetime-local: YYYY-MM-DDTHH:mm) — repo convention ────

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

function pastDateStr(daysOffset: number, hour = 10, minute = 0): string {
  return futureDateStr(-daysOffset, hour, minute);
}

/**
 * Converts a datetime-local input value ("YYYY-MM-DDTHH:mm") to the list
 * page's display format ("YYYY-MM-DD hh:mm AM/PM") — confirmed live, e.g.
 * "2026-10-11T10:00" -> "2026-10-11 10:00 AM", "2026-10-20T18:00" -> "2026-10-20 06:00 PM".
 */
function listDisplayDateStr(dateTimeLocal: string): string {
  const [datePart, timePart] = dateTimeLocal.split('T');
  const [hh, mm] = timePart.split(':').map(Number);
  const period = hh >= 12 ? 'PM' : 'AM';
  let hour12 = hh % 12;
  if (hour12 === 0) hour12 = 12;
  return `${datePart} ${String(hour12).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${period}`;
}

// ─── Timing helpers (repo convention) ──────────────────────────────────────────

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

// Explicit, visually distinct success confirmation — printed from inside the test
// body right after its verification step, on top of the PASSED line afterEach()
// already prints once the test finishes.
function logTestSuccess(message: string): void {
  console.log(`  ✅ SUCCESS: ${message}`);
}

// Collapses whitespace for comparison only — the RAW captured text is always
// logged separately so a real anomaly (e.g. a double space in the live DOM)
// stays visible in the console instead of being silently hidden by trimming.
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// ─── Fixture data ───────────────────────────────────────────────────────────────
//
// NOTE ON SCOPE (confirmed with user): docs/p13n-campaign-test-plan.md §1 describes
// a CID/cmgmtId field pair and a distinct "Preview & Publish" phase 3. Neither exists
// on the live Personalization "Create campaign" drawer — it has no Campaign ID field
// at all (see PersonalizationCreatePage.ts doc comment, and the existing note in
// CopyPage.ts), and Save & Activate / Save Campaign as Draft are clicked directly
// from the same drawer used to build the ruleset. This spec matches the live UI
// rather than the doc.
//
// Ruleset/Rule are built from existing templates (not the manual defining-rule
// condition builder) — confirmed live and the more stable path; the manual builder
// is exercised by EligibilityCreatePage's equivalent suite, not duplicated here.

const data = loadTestData<PersonalizationTestData>('p13n-creation.json');
const CHANNEL          = data.channel;
const RULESET_TEMPLATE = data.rulesetTemplate;
const RULE_TEMPLATE    = data.ruleTemplate;
const CONTROL_ENTRY    = data.controlEntry;
const VARIANT_ENTRY    = data.variantEntry;
const VARIANT_TRAFFIC  = data.variantTraffic;

// Campaigns that actually persist (Draft or Scheduled) are tracked here so
// afterAll can delete them once the whole suite finishes — the other tests
// are validation/cancel flows that never successfully save, so they have
// nothing to clean up (P13N-CREATE-021 is also self-cleaning, deleting its
// own campaign as part of the test itself).
const createdCampaignNames: string[] = [];

test.describe('Personalization — campaign creation (three-phase flow)', () => {
  let sharedPage: Page;
  let createPage: PersonalizationCreatePage;
  let listPage: CampaignListPage;

  /**
   * Deletes a single persisted campaign, stopping it first if its status
   * blocks Delete directly (confirmed elsewhere in this codebase — e.g.
   * ContentPersonalizationCreatePage — that Delete is disabled for anything
   * but Draft/Expired; Scheduled campaigns created here need the same
   * Stop-then-Delete sequence). Wrapped so one failed cleanup doesn't stop
   * the rest from being attempted or mask a real test failure.
   */
  async function cleanupCampaign(name: string): Promise<void> {
    try {
      await listPage.searchByName(name);
      const { disabled } = await listPage.getRowActionStates(name);
      if (disabled.includes('Delete Campaign')) {
        await listPage.clickStopCampaign(name);
        await listPage.assertStopDialogVisible();
        await listPage.confirmStop();
        await listPage.assertRowStatus(name, 'Expired');
      }
      await listPage.clickDeleteCampaign(name);
      await listPage.assertDeleteDialogVisible();
      await listPage.confirmDelete();
      await listPage.assertCampaignRemoved(name);
      console.log(`  [Cleanup] Deleted campaign "${name}" ✓`);
    } catch (e) {
      console.error(`  [Cleanup] MANUAL CLEANUP NEEDED for "${name}" — ${(e as Error).message.split('\n')[0]}`);
    }
  }

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const context = await browser.newContext({ storageState: 'auth/user.json' });
    sharedPage = await context.newPage();
    createPage = new PersonalizationCreatePage(sharedPage);
    listPage   = new CampaignListPage(sharedPage);

    const spacePage = new SpacePage(sharedPage, context);
    await spacePage.navigateToEntries(config.spaceId);
    await spacePage.openSpaceSidepanel();
    await spacePage.selectSpace(config.xeniaSpaceId, config.xeniaSpaceName);
    await spacePage.selectEnvironment('master');
    await spacePage.openAppsMenu(config.xeniaAppName);
    await spacePage.assertAppLoaded();

    await listPage.navigate('Personalization');
    // The created campaigns' future start dates make them invisible under the
    // default "Today" date filter — confirmed live. "All days" makes the later
    // searchByName()/assertRowStatus() calls reliable regardless of the list's
    // current default filter state.
    await listPage.filterByDate('All days');
  });

  test.afterAll(async () => {
    for (const name of createdCampaignNames) {
      await cleanupCampaign(name);
    }
    await sharedPage.context().close();
  });

  /**
   * Phase 1 (basic details) through Phase 2c (experience) — shared by both the
   * Draft and Save & Activate tests, which only differ in the final save action.
   * Leaves the main "Create campaign" drawer open on Continue, ready for
   * clickSaveDraft() / clickSaveActivate().
   */
  async function buildCampaignThroughExperience(name: string, startDate: string, abEndDate: string): Promise<void> {
    // ── Phase 1 — Basic details ───────────────────────────────────────────────
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.fillName(name);
    await createPage.fillStartDate(startDate);
    await createPage.selectChannel(CHANNEL);
    console.log(`  Phase 1 — basic details filled : "${name}", start ${startDate}, channel ${CHANNEL} ✓`);

    // ── Phase 2a — Ruleset (from template) ────────────────────────────────────
    await createPage.clickAddRuleset(CHANNEL);
    await createPage.assertAddRulesetDialogVisible();
    await createPage.selectRulesetTemplate(RULESET_TEMPLATE);
    await createPage.submitRulesetDrawer();
    await createPage.assertRulesetInList(CHANNEL, RULESET_TEMPLATE);
    console.log(`  Phase 2a — ruleset added from template "${RULESET_TEMPLATE}" ✓`);

    // Rulesets default to Inactive — activate it. The toggle fires its own async
    // status-change request; give it a moment to settle before opening the next
    // nested dialog (confirmed live: skipping this occasionally raced the
    // following "Add rule" submit into a stuck, never-closing dialog).
    await createPage.toggleRulesetToActive(CHANNEL, RULESET_TEMPLATE);
    await createPage.assertRulesetActive(CHANNEL, RULESET_TEMPLATE);
    await createPage.waitForNotificationsToClear();
    console.log(`  Ruleset "${RULESET_TEMPLATE}" toggled to Active ✓`);

    // ── Phase 2b — Rule (from template) ───────────────────────────────────────
    await createPage.clickAddRules(CHANNEL);
    await createPage.assertRuleDialogVisible();
    await createPage.clickAddRuleInList();
    await createPage.selectRuleTemplate(RULE_TEMPLATE);
    await createPage.fillRuleName(RULE_TEMPLATE);
    await createPage.submitRuleDrawer();
    await createPage.assertRuleInList(RULE_TEMPLATE);
    await createPage.assertRuleCachingFalse();
    console.log(`  Phase 2b — rule added from template "${RULE_TEMPLATE}", Caching = False ✓`);

    // Rules default to Inactive — activate it (same settle-wait rationale as the ruleset toggle above).
    await createPage.toggleRuleToActive(RULE_TEMPLATE);
    await createPage.assertRuleActive(RULE_TEMPLATE);
    await createPage.waitForNotificationsToClear();
    console.log(`  Rule "${RULE_TEMPLATE}" toggled to Active ✓`);

    // ── Phase 2c — Experience (control content + A/B variant) ────────────────
    await createPage.clickAddContents();
    await createPage.assertAddExperienceDialogVisible();
    await createPage.clickAddControlContents();
    await createPage.selectExistingEntry(CONTROL_ENTRY);
    await createPage.clickChooseVariant();
    await createPage.selectExistingEntry(VARIANT_ENTRY);
    await createPage.enableABTesting();
    await createPage.fillABTestEndDate(abEndDate);
    await createPage.fillPrimaryTraffic(VARIANT_TRAFFIC);
    await createPage.submitExperience();
    console.log(`  Phase 2c — experience added : control "${CONTROL_ENTRY}", variant "${VARIANT_ENTRY}" @ ${VARIANT_TRAFFIC}/${100 - VARIANT_TRAFFIC} split ✓`);

    await createPage.clickContinueOnRuleDialog();
  }

  test('P13N-CREATE-001 | should create a Personalization campaign and save it as Draft', async () => {
    const campaignName = `P13N_Automation_Draft_${Date.now()}`;
    const startDate     = futureDateStr(5, 10, 0);
    const abEndDate     = futureDateStr(12, 10, 0);

    await buildCampaignThroughExperience(campaignName, startDate, abEndDate);

    await createPage.waitForNotificationsToClear();
    await createPage.clickSaveDraft();
    const toastMessage = await createPage.assertSaveSuccess();
    console.log(`  Phase 3 — Save Campaign as Draft submitted — app message: "${toastMessage}" ✓`);

    // ── Verification — campaign exists and its status is exactly "Draft" ─────
    await listPage.searchByName(campaignName);
    await listPage.assertCampaignVisible(campaignName);
    await listPage.assertRowStatus(campaignName, 'Draft');
    createdCampaignNames.push(campaignName);
    logTestSuccess(`Campaign "${campaignName}" created and verified in Draft status`);
  });

  test('P13N-CREATE-002 | should create a Personalization campaign and Save & Activate it to Scheduled', async () => {
    const campaignName = `P13N_Automation_Scheduled_${Date.now()}`;
    const startDate     = futureDateStr(5, 10, 0);
    const abEndDate     = futureDateStr(12, 10, 0);

    await buildCampaignThroughExperience(campaignName, startDate, abEndDate);

    await createPage.waitForNotificationsToClear();
    await createPage.clickSaveActivate();
    const toastMessage = await createPage.assertSaveSuccess();
    console.log(`  Phase 3 — Save & Activate submitted — app message: "${toastMessage}" ✓`);

    // ── Verification — campaign exists and its status is exactly "Scheduled" ─
    // (future start date lands on Scheduled, not Live — same rule confirmed for
    // Content Testing; matches doc's "Live or Scheduled" assertion).
    await listPage.searchByName(campaignName);
    await listPage.assertCampaignVisible(campaignName);
    await listPage.assertRowStatus(campaignName, 'Scheduled');
    createdCampaignNames.push(campaignName);
    logTestSuccess(`Campaign "${campaignName}" created and verified in Scheduled status`);
  });

  test('P13N-CREATE-003 | should not create a campaign when the creation flow is cancelled', async () => {
    const campaignName = `P13N_Automation_Cancelled_${Date.now()}`;

    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.fillName(campaignName);
    await createPage.fillStartDate(futureDateStr(5, 10, 0));
    await createPage.selectChannel(CHANNEL);
    console.log(`  Basic details filled (not saved) : "${campaignName}" ✓`);

    await createPage.clickCancel();
    console.log(`  Cancel clicked, creation drawer closed ✓`);

    // ── Verification — campaign was NOT created ───────────────────────────────
    await listPage.searchByName(campaignName);
    await listPage.assertNoResults();
    logTestSuccess(`Campaign "${campaignName}" NOT found in list — cancel correctly discarded the draft`);
  });

  test('P13N-CREATE-004 | should show validation errors when Save & Activate is clicked with required fields empty', async () => {
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    console.log(`  Create campaign drawer opened, all fields left empty ✓`);

    // No name, no start date, no channel — attempt to submit directly.
    await createPage.clickSaveActivate();

    // ── Verification — read the live error text, never a hardcoded string ────
    // (Confirmed live: the raw Name error text is "Please  enter campaign name"
    // — a double space — which the console.log below shows as-is; the equality
    // check normalizes whitespace so that cosmetic quirk doesn't fail the test.)
    const nameError = await createPage.getFieldErrorText('Campaign name');
    const expectedNameError = 'Please enter campaign name';
    console.log(`  Name field error — actual (raw): "${nameError}" | expected: "${expectedNameError}" | equal: ${normalizeWhitespace(nameError) === expectedNameError}`);
    expect(normalizeWhitespace(nameError)).toBe(expectedNameError);

    const startDateError = await createPage.getFieldErrorText('Campaign start date');
    const expectedStartDateError = 'Please select campaign start date & time (PST)';
    console.log(`  Start date field error — actual (raw): "${startDateError}" | expected: "${expectedStartDateError}" | equal: ${normalizeWhitespace(startDateError) === expectedStartDateError}`);
    expect(normalizeWhitespace(startDateError)).toBe(expectedStartDateError);

    await createPage.assertPageVisible(); // drawer stayed open — save was blocked
    logTestSuccess('Validation errors shown for empty Name and Start date; campaign was not submitted');

    await createPage.clickCancel();
  });

  test('P13N-CREATE-005 | should show an error when the start date is in the past', async () => {
    const campaignName = `P13N_Automation_PastStart_${Date.now()}`;

    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.fillName(campaignName);
    await createPage.fillStartDate(pastDateStr(1, 10, 0)); // yesterday
    console.log(`  Name + a past start date filled : "${campaignName}" ✓`);

    await createPage.waitForToastToClear(); // in case a prior test's toast is still on screen
    await createPage.clickSaveActivate();

    // ── Verification — read the live error text, never a hardcoded string ────
    const actual = await createPage.getFieldErrorText('Campaign start date');
    const expected = 'Campaign start date & time (PST) should be greater than current date & time';
    console.log(`  Start date field error — actual (raw): "${actual}" | expected: "${expected}" | equal: ${normalizeWhitespace(actual) === expected}`);
    expect(normalizeWhitespace(actual)).toBe(expected);
    logTestSuccess(`Past start date correctly blocked; live error text equals the expected string`);

    await createPage.clickCancel();
  });

  test('P13N-CREATE-006 | should show an error when Save & Activate is clicked without a channel selected', async () => {
    const campaignName = `P13N_Automation_NoChannel_${Date.now()}`;

    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.fillName(campaignName);
    await createPage.fillStartDate(futureDateStr(5, 10, 0));
    console.log(`  Name + valid future start date filled, channel left empty : "${campaignName}" ✓`);

    await createPage.waitForToastToClear(); // in case a prior test's toast is still on screen
    await createPage.clickSaveActivate();

    // ── Verification — read the live error text, never a hardcoded string ────
    const actual = await createPage.getFieldErrorText('Channels');
    const expected = 'Please select at least one channel';
    console.log(`  Channels field error — actual (raw): "${actual}" | expected: "${expected}" | equal: ${normalizeWhitespace(actual) === expected}`);
    expect(normalizeWhitespace(actual)).toBe(expected);
    logTestSuccess(`Missing channel correctly blocked; live error text equals the expected string`);

    await createPage.clickCancel();
  });

  test('P13N-CREATE-007 | should show an error when the end date is before the start date', async () => {
    const campaignName = `P13N_Automation_EndBeforeStart_${Date.now()}`;
    const startDate     = futureDateStr(8, 10, 0);
    const endDate       = futureDateStr(3, 10, 0); // before startDate

    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.fillName(campaignName);
    await createPage.fillStartDate(startDate);
    await createPage.selectChannel(CHANNEL);
    await createPage.fillEndDate(endDate);
    console.log(`  Start ${startDate}, end ${endDate} (before start) filled : "${campaignName}" ✓`);

    await createPage.waitForToastToClear(); // in case a prior test's toast is still on screen
    await createPage.clickSaveActivate();

    // ── Verification — read the live error text, never a hardcoded string ────
    const actual = await createPage.getFieldErrorText('Set campaign end date');
    const expected = 'Campaign end date & time should be greater than campaign start date & time';
    console.log(`  End date field error — actual (raw): "${actual}" | expected: "${expected}" | equal: ${normalizeWhitespace(actual) === expected}`);
    expect(normalizeWhitespace(actual)).toBe(expected);
    logTestSuccess(`End date before start date correctly blocked; live error text equals the expected string`);

    await createPage.clickCancel();
  });

  test('P13N-CREATE-008 | should show an error when Save & Activate is clicked without a ruleset configured', async () => {
    const campaignName = `P13N_Automation_NoRuleset_${Date.now()}`;

    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.fillName(campaignName);
    await createPage.fillStartDate(futureDateStr(5, 10, 0));
    await createPage.selectChannel(CHANNEL);
    console.log(`  Name + valid future start date + channel filled, no ruleset added : "${campaignName}" ✓`);

    await createPage.waitForToastToClear(); // in case a prior test's toast is still on screen
    await createPage.clickSaveActivate();

    // ── Verification — read the live toast text, never a hardcoded string ────
    const actual = await createPage.getToastText();
    const expected = 'Add rule set for every channels';
    console.log(`  Toast — actual (raw): "${actual}" | expected: "${expected}" | equal: ${normalizeWhitespace(actual) === expected}`);
    expect(normalizeWhitespace(actual)).toBe(expected);
    logTestSuccess(`Missing ruleset correctly blocked; live toast text equals the expected string`);

    await createPage.clickCancel();
  });

  test('P13N-CREATE-009 | should show an error when Save & Activate is clicked with a ruleset that has no rule', async () => {
    const campaignName = `P13N_Automation_NoRule_${Date.now()}`;

    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.fillName(campaignName);
    await createPage.fillStartDate(futureDateStr(5, 10, 0));
    await createPage.selectChannel(CHANNEL);
    console.log(`  Name + valid future start date + channel filled : "${campaignName}" ✓`);

    // Add the ruleset (from template) but deliberately do NOT add a rule to it.
    await createPage.clickAddRuleset(CHANNEL);
    await createPage.assertAddRulesetDialogVisible();
    await createPage.selectRulesetTemplate(RULESET_TEMPLATE);
    await createPage.submitRulesetDrawer();
    await createPage.assertRulesetInList(CHANNEL, RULESET_TEMPLATE);
    console.log(`  Ruleset "${RULESET_TEMPLATE}" added, no rule added ✓`);

    await createPage.waitForToastToClear(); // in case a prior test's toast is still on screen
    await createPage.clickSaveActivate();

    // ── Verification — read the live toast text, never a hardcoded string ────
    const actual = await createPage.getToastText();
    const expected = 'Add rule for every rule set';
    console.log(`  Toast — actual (raw): "${actual}" | expected: "${expected}" | equal: ${normalizeWhitespace(actual) === expected}`);
    expect(normalizeWhitespace(actual)).toBe(expected);
    logTestSuccess(`Ruleset without a rule correctly blocked; live toast text equals the expected string`);

    await createPage.clickCancel();
  });

  test('P13N-CREATE-010 | should show an error when the A/B test end date is not greater than the campaign start date', async () => {
    const campaignName = `P13N_Automation_ABEndBeforeStart_${Date.now()}`;
    const startDate = futureDateStr(5, 10, 0);
    const invalidAbEndDate = futureDateStr(4, 10, 0); // before startDate

    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.fillName(campaignName);
    await createPage.fillStartDate(startDate);
    await createPage.selectChannel(CHANNEL);
    console.log(`  Name + start ${startDate} + channel filled : "${campaignName}" ✓`);

    await createPage.clickAddRuleset(CHANNEL);
    await createPage.assertAddRulesetDialogVisible();
    await createPage.selectRulesetTemplate(RULESET_TEMPLATE);
    await createPage.submitRulesetDrawer();
    await createPage.assertRulesetInList(CHANNEL, RULESET_TEMPLATE);

    await createPage.clickAddRules(CHANNEL);
    await createPage.assertRuleDialogVisible();
    await createPage.clickAddRuleInList();
    await createPage.selectRuleTemplate(RULE_TEMPLATE);
    await createPage.fillRuleName(RULE_TEMPLATE);
    await createPage.submitRuleDrawer();
    await createPage.assertRuleInList(RULE_TEMPLATE);
    console.log(`  Ruleset "${RULESET_TEMPLATE}" + rule "${RULE_TEMPLATE}" added ✓`);

    await createPage.clickAddContents();
    await createPage.assertAddExperienceDialogVisible();
    await createPage.clickAddControlContents();
    await createPage.selectExistingEntry(CONTROL_ENTRY);
    await createPage.clickChooseVariant();
    await createPage.selectExistingEntry(VARIANT_ENTRY);
    await createPage.enableABTesting();
    await createPage.fillABTestEndDate(invalidAbEndDate); // before campaign start — invalid
    console.log(`  Control "${CONTROL_ENTRY}" + variant "${VARIANT_ENTRY}" added, A/B end date ${invalidAbEndDate} (before start) filled ✓`);

    await createPage.waitForToastToClear(); // in case a prior test's toast is still on screen
    await createPage.submitExperienceExpectingRejection();

    // ── Verification — read the live toast text, never a hardcoded string ────
    const actual = await createPage.getToastText();
    const expected = 'A/B test end date & time should be greater than campaign start date & time (PST)';
    console.log(`  Toast — actual (raw): "${actual}" | expected: "${expected}" | equal: ${normalizeWhitespace(actual) === expected}`);
    expect(normalizeWhitespace(actual)).toBe(expected);
    logTestSuccess(`A/B end date not after campaign start correctly blocked; live toast text equals the expected string`);

    await createPage.closeAllDrawers();
  });

  test('P13N-CREATE-011 | should show an error when the A/B test end date is not less than the campaign end date', async () => {
    const campaignName = `P13N_Automation_ABEndAfterCampaignEnd_${Date.now()}`;
    const startDate = futureDateStr(5, 10, 0);
    const campaignEndDate = futureDateStr(10, 10, 0);
    const invalidAbEndDate = futureDateStr(15, 10, 0); // after campaignEndDate (but still after startDate)

    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.fillName(campaignName);
    await createPage.fillStartDate(startDate);
    await createPage.selectChannel(CHANNEL);
    await createPage.fillEndDate(campaignEndDate);
    console.log(`  Name + start ${startDate} + end ${campaignEndDate} + channel filled : "${campaignName}" ✓`);

    await createPage.clickAddRuleset(CHANNEL);
    await createPage.assertAddRulesetDialogVisible();
    await createPage.selectRulesetTemplate(RULESET_TEMPLATE);
    await createPage.submitRulesetDrawer();
    await createPage.assertRulesetInList(CHANNEL, RULESET_TEMPLATE);

    await createPage.clickAddRules(CHANNEL);
    await createPage.assertRuleDialogVisible();
    await createPage.clickAddRuleInList();
    await createPage.selectRuleTemplate(RULE_TEMPLATE);
    await createPage.fillRuleName(RULE_TEMPLATE);
    await createPage.submitRuleDrawer();
    await createPage.assertRuleInList(RULE_TEMPLATE);
    console.log(`  Ruleset "${RULESET_TEMPLATE}" + rule "${RULE_TEMPLATE}" added ✓`);

    await createPage.clickAddContents();
    await createPage.assertAddExperienceDialogVisible();
    await createPage.clickAddControlContents();
    await createPage.selectExistingEntry(CONTROL_ENTRY);
    await createPage.clickChooseVariant();
    await createPage.selectExistingEntry(VARIANT_ENTRY);
    await createPage.enableABTesting();
    await createPage.fillABTestEndDate(invalidAbEndDate); // after campaign end date — invalid
    console.log(`  Control "${CONTROL_ENTRY}" + variant "${VARIANT_ENTRY}" added, A/B end date ${invalidAbEndDate} (after campaign end) filled ✓`);

    await createPage.waitForToastToClear(); // in case a prior test's toast is still on screen
    await createPage.submitExperienceExpectingRejection();

    // ── Verification — read the live toast text, never a hardcoded string ────
    const actual = await createPage.getToastText();
    const expected = 'A/B test end date & time should be lesser than campaign end date & time (PST)';
    console.log(`  Toast — actual (raw): "${actual}" | expected: "${expected}" | equal: ${normalizeWhitespace(actual) === expected}`);
    expect(normalizeWhitespace(actual)).toBe(expected);
    logTestSuccess(`A/B end date not before campaign end correctly blocked; live toast text equals the expected string`);

    await createPage.closeAllDrawers();
  });

  test('P13N-CREATE-012 | should show an error when Save & Activate is clicked with a rule that has no content', async () => {
    const campaignName = `P13N_Automation_NoContent_${Date.now()}`;

    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.fillName(campaignName);
    await createPage.fillStartDate(futureDateStr(5, 10, 0));
    await createPage.selectChannel(CHANNEL);
    console.log(`  Name + valid future start date + channel filled : "${campaignName}" ✓`);

    // Add ruleset + rule (from templates) but deliberately do NOT add content/experience for the rule.
    await createPage.clickAddRuleset(CHANNEL);
    await createPage.assertAddRulesetDialogVisible();
    await createPage.selectRulesetTemplate(RULESET_TEMPLATE);
    await createPage.submitRulesetDrawer();
    await createPage.assertRulesetInList(CHANNEL, RULESET_TEMPLATE);

    await createPage.clickAddRules(CHANNEL);
    await createPage.assertRuleDialogVisible();
    await createPage.clickAddRuleInList();
    await createPage.selectRuleTemplate(RULE_TEMPLATE);
    await createPage.fillRuleName(RULE_TEMPLATE);
    await createPage.submitRuleDrawer();
    await createPage.assertRuleInList(RULE_TEMPLATE);
    console.log(`  Ruleset "${RULESET_TEMPLATE}" + rule "${RULE_TEMPLATE}" added, no content added ✓`);

    await createPage.clickContinueOnRuleDialog();

    await createPage.waitForToastToClear(); // in case a prior test's toast is still on screen
    await createPage.clickSaveActivate();

    // ── Verification — read the live toast text, never a hardcoded string ────
    const actual = await createPage.getToastText();
    const expected = 'Add content for every rule';
    console.log(`  Toast — actual (raw): "${actual}" | expected: "${expected}" | equal: ${normalizeWhitespace(actual) === expected}`);
    expect(normalizeWhitespace(actual)).toBe(expected);
    logTestSuccess(`Rule without content correctly blocked; live toast text equals the expected string`);

    await createPage.closeAllDrawers();
  });

  test('P13N-CREATE-013 | should show an error when "Add experience" is clicked with control content but no variant', async () => {
    const campaignName = `P13N_Automation_NoVariant_${Date.now()}`;

    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.fillName(campaignName);
    await createPage.fillStartDate(futureDateStr(5, 10, 0));
    await createPage.selectChannel(CHANNEL);
    console.log(`  Name + valid future start date + channel filled : "${campaignName}" ✓`);

    await createPage.clickAddRuleset(CHANNEL);
    await createPage.assertAddRulesetDialogVisible();
    await createPage.selectRulesetTemplate(RULESET_TEMPLATE);
    await createPage.submitRulesetDrawer();
    await createPage.assertRulesetInList(CHANNEL, RULESET_TEMPLATE);

    await createPage.clickAddRules(CHANNEL);
    await createPage.assertRuleDialogVisible();
    await createPage.clickAddRuleInList();
    await createPage.selectRuleTemplate(RULE_TEMPLATE);
    await createPage.fillRuleName(RULE_TEMPLATE);
    await createPage.submitRuleDrawer();
    await createPage.assertRuleInList(RULE_TEMPLATE);
    console.log(`  Ruleset "${RULESET_TEMPLATE}" + rule "${RULE_TEMPLATE}" added ✓`);

    // Add control content only — deliberately do NOT choose a variant — then click
    // "Add experience" directly (A/B testing left at its default/disabled state).
    await createPage.clickAddContents();
    await createPage.assertAddExperienceDialogVisible();
    await createPage.clickAddControlContents();
    await createPage.selectExistingEntry(CONTROL_ENTRY);
    await createPage.assertControlContentAdded(); // guards against racing submitExperience() before the app registers it (confirmed live: an unguarded click can intermittently save with no validation at all)
    console.log(`  Control content "${CONTROL_ENTRY}" added, no variant chosen ✓`);

    await createPage.waitForToastToClear(); // in case a prior test's toast is still on screen
    await createPage.submitExperienceExpectingRejection();

    // ── Verification — read the live toast text, never a hardcoded string ────
    const actual = await createPage.getToastText();
    const expected = 'Add a variant for every default content in the experience';
    console.log(`  Toast — actual (raw): "${actual}" | expected: "${expected}" | equal: ${normalizeWhitespace(actual) === expected}`);
    expect(normalizeWhitespace(actual)).toBe(expected);
    logTestSuccess(`Control content without a variant correctly blocked; live toast text equals the expected string`);

    await createPage.closeAllDrawers();
  });

  test('P13N-CREATE-014 | should create a campaign using a manually-defined ruleset and rule (no template)', async () => {
    const campaignName = `P13N_Automation_ManualRuleset_${Date.now()}`;
    const startDate     = futureDateStr(14, 10, 0);
    const abEndDate     = futureDateStr(21, 10, 0);

    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.fillName(campaignName);
    await createPage.fillStartDate(startDate);
    await createPage.selectChannel(CHANNEL);
    console.log(`  Phase 1 — basic details filled : "${campaignName}", start ${startDate}, channel ${CHANNEL} ✓`);

    // ── Ruleset — manually defined: age [Table_1] Greater than 55 ────────────
    await createPage.clickAddRuleset(CHANNEL);
    await createPage.assertAddRulesetDialogVisible();
    await createPage.fillRulesetName('age>55');
    await createPage.selectDefiningRuleAttribute('Add ruleset', 'age [Table_1]');
    await createPage.selectDefiningRuleOperator('Add ruleset', 'Greater than');
    await createPage.fillDefiningRuleValue('Add ruleset', '55');
    await createPage.submitRulesetDrawer();
    await createPage.assertRulesetInList(CHANNEL, 'age>55');
    console.log(`  Ruleset "age>55" added manually (age [Table_1] Greater than 55, no template) ✓`);

    await createPage.toggleRulesetToActive(CHANNEL, 'age>55');
    await createPage.assertRulesetActive(CHANNEL, 'age>55');
    await createPage.waitForNotificationsToClear();
    console.log(`  Ruleset "age>55" toggled to Active ✓`);

    // ── Rule — manually defined: country [User] Equals USA ───────────────────
    await createPage.clickAddRules(CHANNEL);
    await createPage.assertRuleDialogVisible();
    await createPage.clickAddRuleInList();
    await createPage.fillRuleName('country equal USA');
    await createPage.selectDefiningRuleAttribute('Add rule', 'country [User]');
    await createPage.selectDefiningRuleOperator('Add rule', 'Equals');
    await createPage.fillDefiningRuleValue('Add rule', 'USA');
    await createPage.submitRuleDrawer();
    await createPage.assertRuleInList('country equal USA');
    console.log(`  Rule "country equal USA" added manually (country [User] Equals USA, no template) ✓`);

    await createPage.toggleRuleToActive('country equal USA');
    await createPage.assertRuleActive('country equal USA');
    await createPage.waitForNotificationsToClear();
    console.log(`  Rule "country equal USA" toggled to Active ✓`);

    // ── Experience (control content + A/B variant) ────────────────────────────
    await createPage.clickAddContents();
    await createPage.assertAddExperienceDialogVisible();
    await createPage.clickAddControlContents();
    await createPage.selectExistingEntry(CONTROL_ENTRY);
    await createPage.clickChooseVariant();
    await createPage.selectExistingEntry(VARIANT_ENTRY);
    await createPage.enableABTesting();
    await createPage.fillABTestEndDate(abEndDate);
    await createPage.fillPrimaryTraffic(VARIANT_TRAFFIC);
    await createPage.submitExperience();
    console.log(`  Experience added : control "${CONTROL_ENTRY}", variant "${VARIANT_ENTRY}" @ ${VARIANT_TRAFFIC}/${100 - VARIANT_TRAFFIC} split ✓`);

    await createPage.clickContinueOnRuleDialog();

    await createPage.waitForNotificationsToClear();
    await createPage.clickSaveActivate();
    const toastMessage = await createPage.assertSaveSuccess();
    console.log(`  Phase 3 — Save & Activate submitted — app message: "${toastMessage}" ✓`);

    // ── Verification — campaign exists and its status is exactly "Scheduled" ─
    await listPage.searchByName(campaignName);
    await listPage.assertCampaignVisible(campaignName);
    await listPage.assertRowStatus(campaignName, 'Scheduled');
    createdCampaignNames.push(campaignName);
    logTestSuccess(`Campaign "${campaignName}" created with a manually-defined ruleset and rule, verified in Scheduled status`);
  });

  test('P13N-CREATE-015 | should create a campaign with multiple channels selected', async () => {
    const campaignName = `P13N_Automation_MultiChannel_${Date.now()}`;
    const startDate     = futureDateStr(16, 10, 0);
    const abEndDate     = futureDateStr(23, 10, 0);
    const channels      = ['web', 'Mobile'];

    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.fillName(campaignName);
    await createPage.fillStartDate(startDate);
    for (const channel of channels) {
      await createPage.selectChannel(channel);
    }
    console.log(`  Phase 1 — basic details filled : "${campaignName}", start ${startDate}, channels ${channels.join(', ')} ✓`);

    // Each selected channel gets its own accordion — ruleset/rule/experience must
    // be configured per channel (confirmed live: they are entirely independent).
    for (const channel of channels) {
      await createPage.clickAddRuleset(channel);
      await createPage.assertAddRulesetDialogVisible();
      await createPage.selectRulesetTemplate(RULESET_TEMPLATE);
      await createPage.submitRulesetDrawer();
      await createPage.assertRulesetInList(channel, RULESET_TEMPLATE);
      await createPage.toggleRulesetToActive(channel, RULESET_TEMPLATE);
      await createPage.assertRulesetActive(channel, RULESET_TEMPLATE);
      await createPage.waitForNotificationsToClear();
      console.log(`  Channel "${channel}" — ruleset "${RULESET_TEMPLATE}" added and toggled Active ✓`);

      await createPage.clickAddRules(channel);
      await createPage.assertRuleDialogVisible();
      await createPage.clickAddRuleInList();
      await createPage.selectRuleTemplate(RULE_TEMPLATE);
      await createPage.fillRuleName(RULE_TEMPLATE);
      await createPage.submitRuleDrawer();
      await createPage.assertRuleInList(RULE_TEMPLATE);
      await createPage.toggleRuleToActive(RULE_TEMPLATE);
      await createPage.assertRuleActive(RULE_TEMPLATE);
      await createPage.waitForNotificationsToClear();
      console.log(`  Channel "${channel}" — rule "${RULE_TEMPLATE}" added and toggled Active ✓`);

      await createPage.clickAddContents();
      await createPage.assertAddExperienceDialogVisible();
      await createPage.clickAddControlContents();
      await createPage.selectExistingEntry(CONTROL_ENTRY);
      await createPage.clickChooseVariant();
      await createPage.selectExistingEntry(VARIANT_ENTRY);
      await createPage.enableABTesting();
      await createPage.fillABTestEndDate(abEndDate);
      await createPage.fillPrimaryTraffic(VARIANT_TRAFFIC);
      await createPage.submitExperience();
      console.log(`  Channel "${channel}" — experience added : control "${CONTROL_ENTRY}", variant "${VARIANT_ENTRY}" ✓`);

      await createPage.clickContinueOnRuleDialog();
    }

    await createPage.waitForNotificationsToClear();
    await createPage.clickSaveActivate();
    const toastMessage = await createPage.assertSaveSuccess();
    console.log(`  Phase 3 — Save & Activate submitted — app message: "${toastMessage}" ✓`);

    // ── Verification — campaign exists, both channels listed, status "Scheduled" ─
    await listPage.searchByName(campaignName);
    await listPage.assertCampaignVisible(campaignName);
    await listPage.assertRowChannels(campaignName, channels.join(', '));
    await listPage.assertRowStatus(campaignName, 'Scheduled');
    createdCampaignNames.push(campaignName);
    logTestSuccess(`Campaign "${campaignName}" created with channels "${channels.join(', ')}", verified in Scheduled status`);
  });

  test('P13N-CREATE-016 | should show an error when Save & Activate is clicked with one of multiple channels missing a ruleset', async () => {
    const campaignName = `P13N_Automation_PartialRuleset_${Date.now()}`;
    const startDate     = futureDateStr(17, 10, 0);
    const abEndDate     = futureDateStr(24, 10, 0);
    const configuredChannel = 'web';
    const emptyChannel      = 'Mobile';

    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.fillName(campaignName);
    await createPage.fillStartDate(startDate);
    await createPage.selectChannel(configuredChannel);
    await createPage.selectChannel(emptyChannel);
    console.log(`  Name + start ${startDate} + channels ${configuredChannel}, ${emptyChannel} filled : "${campaignName}" ✓`);

    // Fully configure only "web" (ruleset + rule + content) — "Mobile" is left
    // with no ruleset at all, to isolate the "missing ruleset for one channel"
    // scenario from the other validation messages (e.g. missing content).
    await createPage.clickAddRuleset(configuredChannel);
    await createPage.assertAddRulesetDialogVisible();
    await createPage.selectRulesetTemplate(RULESET_TEMPLATE);
    await createPage.submitRulesetDrawer();
    await createPage.assertRulesetInList(configuredChannel, RULESET_TEMPLATE);
    await createPage.toggleRulesetToActive(configuredChannel, RULESET_TEMPLATE);
    await createPage.assertRulesetActive(configuredChannel, RULESET_TEMPLATE);
    await createPage.waitForNotificationsToClear();

    await createPage.clickAddRules(configuredChannel);
    await createPage.assertRuleDialogVisible();
    await createPage.clickAddRuleInList();
    await createPage.selectRuleTemplate(RULE_TEMPLATE);
    await createPage.fillRuleName(RULE_TEMPLATE);
    await createPage.submitRuleDrawer();
    await createPage.assertRuleInList(RULE_TEMPLATE);
    await createPage.toggleRuleToActive(RULE_TEMPLATE);
    await createPage.assertRuleActive(RULE_TEMPLATE);
    await createPage.waitForNotificationsToClear();

    await createPage.clickAddContents();
    await createPage.assertAddExperienceDialogVisible();
    await createPage.clickAddControlContents();
    await createPage.selectExistingEntry(CONTROL_ENTRY);
    await createPage.clickChooseVariant();
    await createPage.selectExistingEntry(VARIANT_ENTRY);
    await createPage.enableABTesting();
    await createPage.fillABTestEndDate(abEndDate);
    await createPage.fillPrimaryTraffic(VARIANT_TRAFFIC);
    await createPage.submitExperience();
    await createPage.clickContinueOnRuleDialog();
    console.log(`  Channel "${configuredChannel}" fully configured (ruleset + rule + content); "${emptyChannel}" left with no ruleset ✓`);

    await createPage.waitForToastToClear(); // in case a prior test's toast is still on screen
    await createPage.clickSaveActivate();

    // ── Verification — read the live toast text, never a hardcoded string ────
    const actual = await createPage.getToastText();
    const expected = 'Add rule set for every channels';
    console.log(`  Toast — actual (raw): "${actual}" | expected: "${expected}" | equal: ${normalizeWhitespace(actual) === expected}`);
    expect(normalizeWhitespace(actual)).toBe(expected);
    logTestSuccess(`Channel "${emptyChannel}" missing a ruleset correctly blocked; live toast text equals the expected string`);

    await createPage.closeAllDrawers();
  });

  test('P13N-CREATE-017 | should correctly display name, start date, end date and channels on the campaign list page after saving as Draft', async () => {
    const campaignName = `P13N_Automation_ListDisplay_${Date.now()}`;
    const startDate     = futureDateStr(20, 10, 0);
    const endDate       = futureDateStr(29, 18, 0);

    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.fillName(campaignName);
    await createPage.fillStartDate(startDate);
    await createPage.selectChannel(CHANNEL);
    await createPage.fillEndDate(endDate);
    console.log(`  Basic details filled : "${campaignName}", start ${startDate}, end ${endDate}, channel ${CHANNEL} ✓`);

    // Draft does not require a ruleset (confirmed live) — saves straight through.
    await createPage.clickSaveDraft();
    const toastMessage = await createPage.assertSaveSuccess();
    console.log(`  Save Campaign as Draft submitted — app message: "${toastMessage}" ✓`);

    // ── Verification — list page shows the exact values entered ──────────────
    await listPage.searchByName(campaignName);
    await listPage.assertCampaignVisible(campaignName);
    const expectedStart = listDisplayDateStr(startDate);
    const expectedEnd   = listDisplayDateStr(endDate);
    console.log(`  Expected start (list format): "${expectedStart}" | expected end: "${expectedEnd}"`);
    await listPage.assertRowStartDate(campaignName, expectedStart);
    await listPage.assertRowEndDate(campaignName, expectedEnd);
    await listPage.assertRowChannels(campaignName, CHANNEL);
    await listPage.assertRowStatus(campaignName, 'Draft');
    createdCampaignNames.push(campaignName);
    logTestSuccess(`Campaign "${campaignName}" — name, start date, end date, and channel all correctly displayed on the list page`);
  });

  test('P13N-CREATE-018 | clicking "No" on the remove-channel confirmation should keep the channel, ruleset, and rule unchanged', async () => {
    const campaignName = `P13N_Automation_RemoveChannelNo_${Date.now()}`;
    const channelToRemove = 'web';
    const otherChannel     = 'Mobile';

    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.fillName(campaignName);
    await createPage.fillStartDate(futureDateStr(18, 10, 0));
    await createPage.selectChannel(channelToRemove);
    await createPage.selectChannel(otherChannel);
    console.log(`  Name + start date + channels ${channelToRemove}, ${otherChannel} filled : "${campaignName}" ✓`);

    await createPage.clickAddRuleset(channelToRemove);
    await createPage.assertAddRulesetDialogVisible();
    await createPage.selectRulesetTemplate(RULESET_TEMPLATE);
    await createPage.submitRulesetDrawer();
    await createPage.assertRulesetInList(channelToRemove, RULESET_TEMPLATE);

    await createPage.clickAddRules(channelToRemove);
    await createPage.assertRuleDialogVisible();
    await createPage.clickAddRuleInList();
    await createPage.selectRuleTemplate(RULE_TEMPLATE);
    await createPage.fillRuleName(RULE_TEMPLATE);
    await createPage.submitRuleDrawer();
    await createPage.assertRuleInList(RULE_TEMPLATE);
    await createPage.clickContinueOnRuleDialog();
    console.log(`  Channel "${channelToRemove}" — ruleset "${RULESET_TEMPLATE}" + rule "${RULE_TEMPLATE}" added ✓`);

    // ── Trigger removal, then decline it ──────────────────────────────────────
    await createPage.clickRemoveChannel(channelToRemove);
    await createPage.assertRemoveChannelDialogVisible();
    const actual = await createPage.getRemoveChannelDialogText();
    const expected = 'Do you really want to remove the channel? You may lose rulesets and rules.';
    console.log(`  Confirmation dialog — actual (raw): "${actual}" | expected: "${expected}" | equal: ${normalizeWhitespace(actual) === expected}`);
    expect(normalizeWhitespace(actual)).toBe(expected);

    await createPage.clickRemoveChannelNo();
    console.log(`  "No" clicked — declining the removal ✓`);

    // ── Verification — channel, ruleset, and rule all remain unchanged ────────
    await createPage.assertChannelPresent(channelToRemove);
    await createPage.assertRulesetInList(channelToRemove, RULESET_TEMPLATE);
    await createPage.clickViewRules(channelToRemove);
    await createPage.assertRuleInList(RULE_TEMPLATE);
    logTestSuccess(`"No" correctly declined the removal — channel "${channelToRemove}", ruleset "${RULESET_TEMPLATE}", and rule "${RULE_TEMPLATE}" all remain unchanged`);

    await createPage.closeAllDrawers();
  });

  test('P13N-CREATE-019 | clicking "Yes!" on the remove-channel confirmation should remove the channel along with its ruleset and rule', async () => {
    const campaignName = `P13N_Automation_RemoveChannelYes_${Date.now()}`;
    const channelToRemove = 'web';
    const otherChannel     = 'Mobile';

    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.fillName(campaignName);
    await createPage.fillStartDate(futureDateStr(18, 10, 0));
    await createPage.selectChannel(channelToRemove);
    await createPage.selectChannel(otherChannel);
    console.log(`  Name + start date + channels ${channelToRemove}, ${otherChannel} filled : "${campaignName}" ✓`);

    await createPage.clickAddRuleset(channelToRemove);
    await createPage.assertAddRulesetDialogVisible();
    await createPage.selectRulesetTemplate(RULESET_TEMPLATE);
    await createPage.submitRulesetDrawer();
    await createPage.assertRulesetInList(channelToRemove, RULESET_TEMPLATE);

    await createPage.clickAddRules(channelToRemove);
    await createPage.assertRuleDialogVisible();
    await createPage.clickAddRuleInList();
    await createPage.selectRuleTemplate(RULE_TEMPLATE);
    await createPage.fillRuleName(RULE_TEMPLATE);
    await createPage.submitRuleDrawer();
    await createPage.assertRuleInList(RULE_TEMPLATE);
    await createPage.clickContinueOnRuleDialog();
    console.log(`  Channel "${channelToRemove}" — ruleset "${RULESET_TEMPLATE}" + rule "${RULE_TEMPLATE}" added ✓`);

    // ── Trigger removal, then confirm it ──────────────────────────────────────
    await createPage.clickRemoveChannel(channelToRemove);
    await createPage.assertRemoveChannelDialogVisible();
    const actual = await createPage.getRemoveChannelDialogText();
    const expected = 'Do you really want to remove the channel? You may lose rulesets and rules.';
    console.log(`  Confirmation dialog — actual (raw): "${actual}" | expected: "${expected}" | equal: ${normalizeWhitespace(actual) === expected}`);
    expect(normalizeWhitespace(actual)).toBe(expected);

    await createPage.clickRemoveChannelYes();
    console.log(`  "Yes!" clicked — confirming the removal ✓`);

    // ── Verification — channel (and its ruleset/rule) is fully gone ──────────
    await createPage.assertChannelRemoved(channelToRemove);
    await createPage.assertChannelPresent(otherChannel);
    logTestSuccess(`"Yes!" correctly removed channel "${channelToRemove}" along with its ruleset "${RULESET_TEMPLATE}" and rule "${RULE_TEMPLATE}"; "${otherChannel}" untouched`);

    await createPage.closeAllDrawers();
  });

  test('P13N-CREATE-020 | Ruleset row action button reads "+ Add rules" before any rule exists, "View rules (N)" after adding one, and reverts to "+ Add rules" after deleting it', async () => {
    const campaignName = `P13N_Automation_RulesButtonState_${Date.now()}`;
    const startDate     = futureDateStr(5, 10, 0);

    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.fillName(campaignName);
    await createPage.fillStartDate(startDate);
    await createPage.selectChannel(CHANNEL);

    await createPage.clickAddRuleset(CHANNEL);
    await createPage.assertAddRulesetDialogVisible();
    await createPage.selectRulesetTemplate(RULESET_TEMPLATE);
    await createPage.submitRulesetDrawer();
    await createPage.assertRulesetInList(CHANNEL, RULESET_TEMPLATE);
    console.log(`  Ruleset "${RULESET_TEMPLATE}" added to channel "${CHANNEL}" ✓`);

    // ── Before any rule exists — "+ Add rules" ────────────────────────────────
    // The button's accessible name/visible label reads "+ Add rules", but the
    // "+" is a separate decorative icon element, not part of textContent() —
    // confirmed live: getRulesButtonText() reads back "Add rules" (no "+").
    const buttonBeforeRule = await createPage.getRulesButtonText(CHANNEL);
    console.log(`  Ruleset action button before any rule — actual: "${buttonBeforeRule}"`);
    expect(buttonBeforeRule).toBe('Add rules');
    logTestSuccess(`Ruleset action button correctly reads "+ Add rules" before any rule exists`);

    // ── Add a rule — button changes to "View rules (N)" ───────────────────────
    await createPage.clickAddRules(CHANNEL);
    await createPage.assertRuleDialogVisible();
    await createPage.clickAddRuleInList();
    await createPage.selectRuleTemplate(RULE_TEMPLATE);
    await createPage.fillRuleName(RULE_TEMPLATE);
    await createPage.submitRuleDrawer();
    await createPage.assertRuleInList(RULE_TEMPLATE);
    await createPage.clickContinueOnRuleDialog();

    const buttonAfterRule = await createPage.getRulesButtonText(CHANNEL);
    console.log(`  Ruleset action button after adding a rule — actual: "${buttonAfterRule}"`);
    expect(buttonAfterRule).toBe('View rules (1)');
    logTestSuccess(`Ruleset action button correctly changed to "View rules (1)" after adding a rule`);

    // ── Delete the rule via its own row's delete icon ─────────────────────────
    // Confirmed live: this opens a host-page "Are you sure?" confirmation —
    // the same shared component as the Remove Channel confirmation elsewhere
    // in this file, just with its own message text.
    await createPage.clickViewRules(CHANNEL);
    await createPage.assertRuleDialogVisible();
    await createPage.clickDeleteRule(RULE_TEMPLATE);
    await createPage.assertDeleteRuleConfirmVisible();
    await createPage.confirmDeleteRule();
    console.log(`  Rule "${RULE_TEMPLATE}" deleted and confirmed via "Yes!" ✓`);
    await createPage.clickContinueOnRuleDialog();

    // ── Button reverts to "+ Add rules" once the last rule is gone ────────────
    const buttonAfterDelete = await createPage.getRulesButtonText(CHANNEL);
    console.log(`  Ruleset action button after deleting the only rule — actual: "${buttonAfterDelete}"`);
    expect(buttonAfterDelete).toBe('Add rules');
    logTestSuccess(`Ruleset action button correctly reverted to "+ Add rules" after deleting the only rule`);

    await createPage.closeAllDrawers();
  });

  test('P13N-CREATE-021 | Creating a campaign increases the total campaign count by 1, and deleting it decreases the count back', async () => {
    const campaignName = `P13N_Automation_CountCheck_${Date.now()}`;

    const countBeforeCreate = await listPage.getSettledTotalCampaignCount();
    console.log(`  Total campaign count before create — actual: ${countBeforeCreate}`);

    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.fillName(campaignName);
    await createPage.clickSaveDraft();
    await createPage.assertSaveSuccess();

    const countAfterCreate = await listPage.waitForTotalCampaignCountToChangeFrom(countBeforeCreate);
    console.log(`  Total campaign count after create  — actual: ${countAfterCreate}`);
    expect(countAfterCreate).toBe(countBeforeCreate + 1);
    logTestSuccess(`Creating campaign "${campaignName}" increased the total campaign count from ${countBeforeCreate} to ${countAfterCreate}`);

    // ── Delete the campaign — count should return to its original value ──────
    await listPage.searchByName(campaignName);
    await listPage.clickDeleteCampaign(campaignName);
    await listPage.assertDeleteDialogVisible();
    await listPage.confirmDelete();
    await listPage.assertCampaignRemoved(campaignName);

    const countAfterDelete = await listPage.waitForTotalCampaignCountToChangeFrom(countAfterCreate);
    console.log(`  Total campaign count after delete  — actual: ${countAfterDelete}`);
    expect(countAfterDelete).toBe(countBeforeCreate);
    logTestSuccess(`Deleting campaign "${campaignName}" decreased the total campaign count back from ${countAfterCreate} to ${countAfterDelete}`);
  });
});
