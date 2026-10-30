import { test, expect, Browser, Page } from '@playwright/test';
import { SpacePage } from '../../pages/SpacePage';
import { PersonalizationCreatePage } from '../../pages/PersonalizationCreatePage';
import { CampaignListPage } from '../../pages/CampaignListPage';
import { config } from '../../config/config';

// ─── Date helper (native datetime-local: YYYY-MM-DDTHH:mm) — repo convention ────

function formatDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  const hh   = String(d.getHours()).padStart(2, '0');
  const mi   = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function futureDateStr(daysOffset: number, hour = 10, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  d.setHours(hour, minute, 0, 0);
  return formatDateStr(d);
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

function logTestSuccess(message: string): void {
  console.log(`  ✅ SUCCESS: ${message}`);
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// ─── Fixture data ───────────────────────────────────────────────────────────────

const CHANNEL          = 'web';
const RULESET_TEMPLATE = 'Ruleset1';
const RULE_TEMPLATE    = 'Age>20';
const CONTROL_ENTRY    = 'Retest_new1';
const VARIANT_ENTRY    = 'content status_4';
const VARIANT_TRAFFIC  = 50;

/** A different rule template from RULE_TEMPLATE, used for the "add a new rule to a Live campaign" step so the new rule is clearly distinct from the rule under test rather than a duplicate. */
const RULE_TEMPLATE_ALT = 'Age>20 _new';
/** Distinct content entries for that new rule — testing whether reusing CONTROL_ENTRY/VARIANT_ENTRY across two rules in the same campaign is what's disturbing the original rule's own A/B read. */
const CONTROL_ENTRY_ALT = 'QA_V1_1_ MAR_2';
const VARIANT_ENTRY_ALT = 'QA_V1_Content 2';

test.describe('Personalization — campaign lifecycle (Pause / Resume / Stop / Delete)', () => {
  let sharedPage: Page;
  let createPage: PersonalizationCreatePage;
  let listPage: CampaignListPage;

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
    await listPage.filterByDate('All days');
  });

  test.afterAll(async () => {
    await sharedPage.context().close();
  });

  /** Basic details through the experience — shared by both Scheduled and Draft builders, which only differ in the final save action. */
  async function buildCampaignThroughExperience(name: string, startDate: string, abEndDate: string): Promise<void> {
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.fillName(name);
    await createPage.fillStartDate(startDate);
    await createPage.selectChannel(CHANNEL);

    await createPage.clickAddRuleset(CHANNEL);
    await createPage.assertAddRulesetDialogVisible();
    await createPage.selectRulesetTemplate(RULESET_TEMPLATE);
    await createPage.submitRulesetDrawer();
    await createPage.assertRulesetInList(CHANNEL, RULESET_TEMPLATE);
    await createPage.toggleRulesetToActive(CHANNEL, RULESET_TEMPLATE);
    await createPage.assertRulesetActive(CHANNEL, RULESET_TEMPLATE);
    await createPage.waitForNotificationsToClear();

    await createPage.clickAddRules(CHANNEL);
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
    // Guards against racing "Choose variant" before the app registers the
    // control content — see assertControlContentAdded()'s own doc comment.
    await createPage.assertControlContentAdded();
    await createPage.clickChooseVariant();
    await createPage.selectExistingEntry(VARIANT_ENTRY);
    await createPage.enableABTesting();
    await createPage.fillABTestEndDate(abEndDate);
    await createPage.fillPrimaryTraffic(VARIANT_TRAFFIC);
    await createPage.submitExperience();
    await createPage.clickContinueOnRuleDialog();
  }

  /** Builds a full campaign and Save & Activates it — future start date lands it on Scheduled. */
  async function createScheduledCampaign(name: string, startDate: string, abEndDate: string): Promise<void> {
    await buildCampaignThroughExperience(name, startDate, abEndDate);
    await createPage.waitForNotificationsToClear();
    await createPage.clickSaveActivate();
    await createPage.assertSaveSuccess();

    // A future-started Scheduled campaign is invisible under the "Today"
    // date filter (see filterByDate()'s own doc comment) — re-assert "All
    // days" here rather than trusting beforeAll's one-time setting to have
    // survived: a prior test's clickReset() call (e.g. LIFECYCLE-006's
    // Scheduled -> Live poll) resets every filter, including Date, back to
    // its "Today" default, and that leaks into whichever test runs next in
    // this shared page session.
    await listPage.filterByDate('All days');
    await listPage.searchByName(name);
    await listPage.assertCampaignVisible(name);
    await listPage.assertRowStatus(name, 'Scheduled');
  }

  /** Draft does not require a ruleset (confirmed live in p13n-creation.spec.ts), but building the full flow anyway keeps this fixture consistent with the other lifecycle tests. */
  async function createDraftCampaign(name: string, startDate: string, abEndDate: string): Promise<void> {
    await buildCampaignThroughExperience(name, startDate, abEndDate);
    await createPage.waitForNotificationsToClear();
    await createPage.clickSaveDraft();
    await createPage.assertSaveSuccess();

    await listPage.searchByName(name);
    await listPage.assertCampaignVisible(name);
    await listPage.assertRowStatus(name, 'Draft');
  }

  /** Name only, no ruleset, no start date by default — the lightest possible Draft (confirmed live: Draft doesn't require a ruleset, and the form itself doesn't require a start date either). Optional startDate lets a caller pin a controlled date for filter tests without needing the full ruleset/rule/experience flow a Scheduled campaign requires. For tests about save/edit/filter mechanics rather than the full campaign-building flow. */
  async function createMinimalDraftCampaign(name: string, startDate?: string): Promise<void> {
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.fillName(name);
    if (startDate) {
      await createPage.fillStartDate(startDate);
    }
    await createPage.clickSaveDraft();
    await createPage.assertSaveSuccess();
  }

  test('P13N-LIFECYCLE-001 | full workflow: Scheduled -> Pause -> Paused -> Resume -> Scheduled -> Stop -> Expired -> Delete -> removed from list', async () => {
    const campaignName = `P13N_Automation_Lifecycle_${Date.now()}`;
    const startDate     = futureDateStr(4, 10, 0);
    const abEndDate     = futureDateStr(11, 10, 0);

    await createScheduledCampaign(campaignName, startDate, abEndDate);
    console.log(`  Campaign "${campaignName}" created and verified in Scheduled status ✓`);

    // ── Pause: Scheduled -> Paused ────────────────────────────────────────────
    await listPage.assertActionEnabled(campaignName, 'Pause Campaign');
    await listPage.assertActionEnabled(campaignName, 'Stop Campaign');
    await listPage.assertActionDisabled(campaignName, 'Delete Campaign');
    await listPage.clickPauseCampaign(campaignName);
    await listPage.assertPauseDialogVisible();
    const pauseMessage = await listPage.getConfirmDialogMessage();
    console.log(`  Pause confirmation — actual (raw): "${pauseMessage}"`);
    expect(normalizeWhitespace(pauseMessage)).toContain('pause the campaign');
    await listPage.confirmPause();
    await listPage.assertRowStatus(campaignName, 'Paused');
    logTestSuccess(`Pause icon clicked — campaign "${campaignName}" moved to Paused ✓`);

    // ── Resume: Paused -> Scheduled ────────────────────────────────────────────
    await listPage.assertActionEnabled(campaignName, 'Resume Campaign');
    await listPage.clickResumeCampaign(campaignName);
    await listPage.assertResumeDialogVisible();
    const resumeMessage = await listPage.getConfirmDialogMessage();
    console.log(`  Resume confirmation — actual (raw): "${resumeMessage}"`);
    expect(normalizeWhitespace(resumeMessage)).toContain('resume the campaign');
    await listPage.confirmResume();
    await listPage.assertRowStatus(campaignName, 'Scheduled');
    logTestSuccess(`Resume icon clicked — campaign "${campaignName}" moved back to Scheduled ✓`);

    // ── Stop: Scheduled -> Expired, Delete becomes enabled ────────────────────
    await listPage.assertActionEnabled(campaignName, 'Stop Campaign');
    await listPage.clickStopCampaign(campaignName);
    await listPage.assertStopDialogVisible();
    const stopMessage = await listPage.getConfirmDialogMessage();
    console.log(`  Stop confirmation — actual (raw): "${stopMessage}"`);
    expect(normalizeWhitespace(stopMessage)).toContain('Expired');
    await listPage.confirmStop();
    await listPage.assertRowStatus(campaignName, 'Expired');
    await listPage.assertActionDisabled(campaignName, 'Pause Campaign');
    await listPage.assertActionDisabled(campaignName, 'Stop Campaign');
    await listPage.assertActionEnabled(campaignName, 'Delete Campaign');
    logTestSuccess(`Stop icon clicked — campaign "${campaignName}" moved to Expired; Delete icon now enabled ✓`);

    // ── Delete: Expired -> removed from the list ──────────────────────────────
    await listPage.clickDeleteCampaign(campaignName);
    await listPage.assertDeleteDialogVisible();
    const deleteMessage = await listPage.getConfirmDialogMessage();
    console.log(`  Delete confirmation — actual (raw): "${deleteMessage}"`);
    expect(normalizeWhitespace(deleteMessage)).toContain('delete the campaign');
    await listPage.confirmDelete();
    await listPage.assertCampaignRemoved(campaignName);
    logTestSuccess(`Delete icon clicked — campaign "${campaignName}" removed from the campaign list ✓`);
  });

  test('P13N-LIFECYCLE-002 | Draft status should only enable Edit, Copy, and Delete — View, Pause, and Stop stay disabled; Edit opens an editable drawer', async () => {
    const campaignName = `P13N_Automation_DraftActions_${Date.now()}`;
    const startDate     = futureDateStr(6, 10, 0);
    const abEndDate     = futureDateStr(13, 10, 0);

    await createDraftCampaign(campaignName, startDate, abEndDate);
    console.log(`  Campaign "${campaignName}" created and verified in Draft status ✓`);

    // ── Verification — read the live per-button state (the actual DOM `disabled`
    // attribute on each named button, never a hardcoded expected string) and
    // display it as an explicit console verification step ──────────────────
    const { enabled, disabled } = await listPage.getRowActionStates(campaignName);
    console.log(`  Enabled action icons  (actual, live) : ${enabled.join(', ') || '(none)'}`);
    console.log(`  Disabled action icons (actual, live) : ${disabled.join(', ') || '(none)'}`);

    await listPage.assertActionDisabled(campaignName, 'View Details');
    await listPage.assertActionDisabled(campaignName, 'Pause Campaign');
    await listPage.assertActionDisabled(campaignName, 'Stop Campaign');
    await listPage.assertActionEnabled(campaignName, 'Edit Campaign');
    await listPage.assertActionEnabled(campaignName, 'Copy Campaign');
    await listPage.assertActionEnabled(campaignName, 'Delete Campaign');
    logTestSuccess(`Draft row action states correct — View/Pause/Stop disabled, Edit/Copy/Delete enabled`);

    // ── Verification — Edit opens the campaign edit drawer, editable ─────────
    await listPage.clickEditCampaignForRow(campaignName);
    await createPage.assertEditDrawerVisible();
    const editedName = `${campaignName}_edited`;
    await createPage.fillName(editedName);
    console.log(`  Edit drawer opened, Campaign name field accepted a new value ("${editedName}") ✓`);

    // Close without saving — this test only verifies the drawer opens and the
    // field is editable, not a full edit-and-persist flow (covered separately).
    await createPage.clickCancel();
    logTestSuccess(`"Edit Campaign" correctly opened an editable "Update campaign" drawer for "${campaignName}"`);
  });

  test('P13N-LIFECYCLE-003 | Delete confirmation message should match exactly; "Cancel" keeps the campaign, "Delete" removes it', async () => {
    const campaignName = `P13N_Automation_DraftDelete_${Date.now()}`;
    const startDate     = futureDateStr(6, 10, 0);
    const abEndDate     = futureDateStr(13, 10, 0);

    await createDraftCampaign(campaignName, startDate, abEndDate);
    console.log(`  Campaign "${campaignName}" created and verified in Draft status ✓`);

    // ── Verification — confirmation dialog text is exactly as expected ───────
    await listPage.clickDeleteCampaign(campaignName);
    await listPage.assertDeleteDialogVisible();
    const actualHeading = await listPage.getConfirmDialogHeading();
    const actualMessage = await listPage.getConfirmDialogMessage();
    const expectedHeading = 'Delete Campaign?';
    const expectedMessage = `Are you sure you want to delete the campaign "${campaignName}"? This action cannot be undone.`;
    console.log(`  Dialog heading — actual (raw): "${actualHeading}" | expected: "${expectedHeading}" | equal: ${normalizeWhitespace(actualHeading) === expectedHeading}`);
    console.log(`  Dialog message — actual (raw): "${actualMessage}" | expected: "${expectedMessage}" | equal: ${normalizeWhitespace(actualMessage) === normalizeWhitespace(expectedMessage)}`);
    expect(normalizeWhitespace(actualHeading)).toBe(expectedHeading);
    expect(normalizeWhitespace(actualMessage)).toBe(normalizeWhitespace(expectedMessage));

    // ── "Cancel" — campaign remains, still in Draft status ────────────────────
    await listPage.cancelConfirmDialog();
    await listPage.assertRowStatus(campaignName, 'Draft');
    logTestSuccess(`"Cancel" correctly declined the deletion — campaign "${campaignName}" remains in Draft status`);

    // ── "Delete" — campaign is removed from the list ──────────────────────────
    await listPage.clickDeleteCampaign(campaignName);
    await listPage.assertDeleteDialogVisible();
    await listPage.confirmDelete();
    await listPage.assertCampaignRemoved(campaignName);
    logTestSuccess(`"Delete" correctly removed campaign "${campaignName}" from the campaign list`);
  });

  test('P13N-LIFECYCLE-004 | Scheduled status action icons; View opens details matching the actual row, Edit opens an editable "Update campaign" drawer', async () => {
    const campaignName = `P13N_Automation_ScheduledActions_${Date.now()}`;
    const startDate     = futureDateStr(7, 10, 0);
    const abEndDate     = futureDateStr(14, 10, 0);

    await createScheduledCampaign(campaignName, startDate, abEndDate);
    console.log(`  Campaign "${campaignName}" created and verified in Scheduled status ✓`);

    // ── Verification — read the live per-button state and display it ─────────
    const { enabled, disabled } = await listPage.getRowActionStates(campaignName);
    console.log(`  Enabled action icons  (actual, live) : ${enabled.join(', ') || '(none)'}`);
    console.log(`  Disabled action icons (actual, live) : ${disabled.join(', ') || '(none)'}`);

    await listPage.assertActionEnabled(campaignName, 'Share Campaign');
    await listPage.assertActionEnabled(campaignName, 'View Details');
    await listPage.assertActionEnabled(campaignName, 'Edit Campaign');
    await listPage.assertActionEnabled(campaignName, 'Copy Campaign');
    await listPage.assertActionEnabled(campaignName, 'Pause Campaign');
    await listPage.assertActionEnabled(campaignName, 'Stop Campaign');
    await listPage.assertActionDisabled(campaignName, 'Delete Campaign');
    logTestSuccess(`Scheduled row action states correct — Delete disabled, all other icons enabled`);

    // ── Verification — View opens a details page whose content matches the
    // actual row (captured live from both places, never a hardcoded string) ──
    const actualRowStartDate = await listPage.getRowStartDate(campaignName);
    const actualRowChannels  = await listPage.getRowChannels(campaignName);
    const actualRowStatus    = await listPage.getListRowStatus(campaignName);
    console.log(`  List row — start date: "${actualRowStartDate}" | channels: "${actualRowChannels}" | status: "${actualRowStatus}"`);

    await listPage.clickViewDetails(campaignName);
    await listPage.assertViewDetailsVisible();

    // Every field the View Details dialog shows, captured live — never hardcoded.
    const viewDetails = await listPage.getAllViewDetails();
    console.log(`  View drawer details (actual, live):`);
    console.log(`    Name        : "${viewDetails.name}"`);
    console.log(`    Status      : "${viewDetails.status}"`);
    console.log(`    Start date  : "${viewDetails.startDate}"`);
    console.log(`    End date    : "${viewDetails.endDate}"`);
    console.log(`    Channels    : "${viewDetails.channels}"`);
    console.log(`    Description : "${viewDetails.description}"`);

    expect(normalizeWhitespace(viewDetails.name)).toBe(campaignName);
    expect(normalizeWhitespace(viewDetails.startDate)).toBe(normalizeWhitespace(actualRowStartDate));
    expect(normalizeWhitespace(viewDetails.channels)).toBe(normalizeWhitespace(actualRowChannels));
    expect(normalizeWhitespace(viewDetails.status)).toBe(normalizeWhitespace(actualRowStatus));
    logTestSuccess(`View drawer correctly displays name, start date, and channels matching the list row; status "${viewDetails.status}" matches the campaign's actual status`);

    await listPage.closeViewDetails();

    // ── Verification — Edit opens the campaign edit drawer, editable ─────────
    await listPage.clickEditCampaignForRow(campaignName);
    await createPage.assertEditDrawerVisible();
    const editedName = `${campaignName}_edited`;
    await createPage.fillName(editedName);
    console.log(`  Edit drawer opened, Campaign name field accepted a new value ("${editedName}") ✓`);

    await createPage.clickCancel();
    logTestSuccess(`"Edit Campaign" correctly opened an editable "Update campaign" drawer for "${campaignName}"`);
  });

  test('P13N-LIFECYCLE-005 | Live campaign: action icons, and Pause/Resume/Stop/Delete each with "Cancel" (no change) then confirmed (status transitions)', async () => {
    // This test doesn't need to prove the Scheduled -> Live transition itself
    // (that's P13N-LIFECYCLE-001's job) — it only needs *a* Live campaign to
    // exercise Pause/Resume/Stop/Delete on. Selecting an existing one from the
    // status filter (confirmed live: this space already has 125+) avoids the
    // multi-minute real-time wait a freshly-created campaign would require.
    const campaignName = await listPage.findExistingCampaignByStatus('Live');
    console.log(`  Selected existing Live campaign "${campaignName}" via the status filter ✓`);

    // ── Verification — read the live per-button state and display it ─────────
    const { enabled, disabled } = await listPage.getRowActionStates(campaignName);
    console.log(`  Enabled action icons  (actual, live) : ${enabled.join(', ') || '(none)'}`);
    console.log(`  Disabled action icons (actual, live) : ${disabled.join(', ') || '(none)'}`);

    await listPage.assertActionEnabled(campaignName, 'Share Campaign');
    await listPage.assertActionEnabled(campaignName, 'View Details');
    await listPage.assertActionEnabled(campaignName, 'Edit Campaign');
    await listPage.assertActionEnabled(campaignName, 'Copy Campaign');
    await listPage.assertActionEnabled(campaignName, 'Pause Campaign');
    await listPage.assertActionEnabled(campaignName, 'Stop Campaign');
    await listPage.assertActionDisabled(campaignName, 'Delete Campaign');
    logTestSuccess(`Live row action states correct — Delete disabled, all other icons enabled`);

    // ── Pause — "Cancel" first (stays Live), then confirm (moves to Paused) ───
    await listPage.clickPauseCampaign(campaignName);
    await listPage.assertPauseDialogVisible();
    const pauseHeading = await listPage.getConfirmDialogHeading();
    const pauseMessage = await listPage.getConfirmDialogMessage();
    const expectedPauseHeading = 'Pause Campaign?';
    const expectedPauseMessage = `Are you sure you want to pause the campaign "${campaignName}"?`;
    console.log(`  Pause dialog — heading actual: "${pauseHeading}" | expected: "${expectedPauseHeading}" | equal: ${normalizeWhitespace(pauseHeading) === expectedPauseHeading}`);
    console.log(`  Pause dialog — message actual: "${pauseMessage}" | expected: "${expectedPauseMessage}" | equal: ${normalizeWhitespace(pauseMessage) === expectedPauseMessage}`);
    expect(normalizeWhitespace(pauseHeading)).toBe(expectedPauseHeading);
    expect(normalizeWhitespace(pauseMessage)).toBe(expectedPauseMessage);

    await listPage.cancelConfirmDialog();
    await listPage.assertRowStatus(campaignName, 'Live');
    logTestSuccess(`"Cancel" correctly declined the pause — campaign "${campaignName}" remains Live`);

    await listPage.clickPauseCampaign(campaignName);
    await listPage.assertPauseDialogVisible();
    await listPage.confirmPause();
    await listPage.assertRowStatus(campaignName, 'Paused');
    logTestSuccess(`Pause icon clicked and confirmed — campaign "${campaignName}" moved to Paused`);

    // ── Resume — "Cancel" first (stays Paused), then confirm (moves to Live) ──
    await listPage.clickResumeCampaign(campaignName);
    await listPage.assertResumeDialogVisible();
    const resumeHeading = await listPage.getConfirmDialogHeading();
    const resumeMessage = await listPage.getConfirmDialogMessage();
    const expectedResumeHeading = 'Resume Campaign?';
    const expectedResumeMessage = `Are you sure you want to resume the campaign "${campaignName}"?`;
    console.log(`  Resume dialog — heading actual: "${resumeHeading}" | expected: "${expectedResumeHeading}" | equal: ${normalizeWhitespace(resumeHeading) === expectedResumeHeading}`);
    console.log(`  Resume dialog — message actual: "${resumeMessage}" | expected: "${expectedResumeMessage}" | equal: ${normalizeWhitespace(resumeMessage) === expectedResumeMessage}`);
    expect(normalizeWhitespace(resumeHeading)).toBe(expectedResumeHeading);
    expect(normalizeWhitespace(resumeMessage)).toBe(expectedResumeMessage);

    await listPage.cancelConfirmDialog();
    await listPage.assertRowStatus(campaignName, 'Paused');
    logTestSuccess(`"Cancel" correctly declined the resume — campaign "${campaignName}" remains Paused`);

    await listPage.clickResumeCampaign(campaignName);
    await listPage.assertResumeDialogVisible();
    await listPage.confirmResume();
    await listPage.assertRowStatus(campaignName, 'Live');
    logTestSuccess(`Resume icon clicked and confirmed — campaign "${campaignName}" moved back to Live`);

    // ── Stop — "Cancel" first (stays Live), then confirm (moves to Expired) ───
    await listPage.clickStopCampaign(campaignName);
    await listPage.assertStopDialogVisible();
    const stopHeading = await listPage.getConfirmDialogHeading();
    const stopMessage = await listPage.getConfirmDialogMessage();
    const expectedStopHeading = 'Stop Campaign?';
    const expectedStopMessage = `The campaign “${campaignName}” will be moved to the “Expired” status and will no longer be editable.`;
    console.log(`  Stop dialog — heading actual: "${stopHeading}" | expected: "${expectedStopHeading}" | equal: ${normalizeWhitespace(stopHeading) === expectedStopHeading}`);
    console.log(`  Stop dialog — message actual: "${stopMessage}" | expected: "${expectedStopMessage}" | equal: ${normalizeWhitespace(stopMessage) === normalizeWhitespace(expectedStopMessage)}`);
    expect(normalizeWhitespace(stopHeading)).toBe(expectedStopHeading);
    expect(normalizeWhitespace(stopMessage)).toBe(normalizeWhitespace(expectedStopMessage));

    await listPage.cancelConfirmDialog();
    await listPage.assertRowStatus(campaignName, 'Live');
    logTestSuccess(`"Cancel" correctly declined the stop — campaign "${campaignName}" remains Live`);

    await listPage.clickStopCampaign(campaignName);
    await listPage.assertStopDialogVisible();
    await listPage.confirmStop();
    await listPage.assertRowStatus(campaignName, 'Expired');
    await listPage.assertActionEnabled(campaignName, 'Delete Campaign');
    logTestSuccess(`Stop icon clicked and confirmed — campaign "${campaignName}" moved to Expired; Delete icon now enabled`);

    // ── Delete — "Cancel" first (stays Expired), then confirm (removed) ───────
    await listPage.clickDeleteCampaign(campaignName);
    await listPage.assertDeleteDialogVisible();
    const deleteHeading = await listPage.getConfirmDialogHeading();
    const deleteMessage = await listPage.getConfirmDialogMessage();
    const expectedDeleteHeading = 'Delete Campaign?';
    const expectedDeleteMessage = `Are you sure you want to delete the campaign "${campaignName}"? This action cannot be undone.`;
    console.log(`  Delete dialog — heading actual: "${deleteHeading}" | expected: "${expectedDeleteHeading}" | equal: ${normalizeWhitespace(deleteHeading) === expectedDeleteHeading}`);
    console.log(`  Delete dialog — message actual: "${deleteMessage}" | expected: "${expectedDeleteMessage}" | equal: ${normalizeWhitespace(deleteMessage) === expectedDeleteMessage}`);
    expect(normalizeWhitespace(deleteHeading)).toBe(expectedDeleteHeading);
    expect(normalizeWhitespace(deleteMessage)).toBe(expectedDeleteMessage);

    await listPage.cancelConfirmDialog();
    await listPage.assertRowStatus(campaignName, 'Expired');
    logTestSuccess(`"Cancel" correctly declined the deletion — campaign "${campaignName}" remains Expired`);

    await listPage.clickDeleteCampaign(campaignName);
    await listPage.assertDeleteDialogVisible();
    await listPage.confirmDelete();
    await listPage.assertCampaignRemoved(campaignName);
    logTestSuccess(`Delete icon clicked and confirmed — campaign "${campaignName}" removed from the campaign list`);
  });

  test('P13N-LIFECYCLE-006 | Live campaign: start date locked, ruleset/rule locked while A/B testing is enabled, adding a new rule is still allowed, and turning off A/B testing (via "update") unlocks editing', async () => {
    // Setup (build + a 3-min start-date buffer + the 1-minute grace window)
    // plus this test's own many edit-lock/unlock checks and the A/B
    // stop-confirmation cycle all share one timeout budget against the
    // default 120s — give it real headroom.
    test.setTimeout(480_000);

    const campaignName     = `P13N_Automation_LiveABLock_${Date.now()}`;
    const newRuleName      = `LiveNewRule_${Date.now()}`;
    const abEndDate        = futureDateStr(10, 10, 0);

    // A Draft-then-edit-reactivate shortcut (build as Draft with a throwaway
    // date, then reopen and change just the start date before Save &
    // Activate) was tried first to dodge the "build takes long enough that a
    // near-future date goes stale before Save & Activate" problem — but
    // confirmed live: re-activating an edited Draft this way does NOT
    // correctly carry over the rule's A/B config from the original build; a
    // diagnostic read showed A/B already "Disabled" immediately after the
    // Live transition, before this test had done anything else at all. A
    // direct Create -> Save & Activate does preserve it correctly, so the
    // start date just needs enough buffer to still be in the future by the
    // time the full build finishes and Save & Activate is actually clicked.
    const startMoment = new Date();
    startMoment.setMinutes(startMoment.getMinutes() + 3, 0, 0);
    await buildCampaignThroughExperience(campaignName, formatDateStr(startMoment), abEndDate);
    await createPage.waitForNotificationsToClear();
    await createPage.clickSaveActivate();
    await createPage.assertSaveSuccess();

    await listPage.searchByName(campaignName);
    await listPage.assertCampaignVisible(campaignName);
    await listPage.assertRowStatus(campaignName, 'Scheduled');
    console.log(`  Campaign "${campaignName}" built and activated with a 3-minute-out start date — confirmed Scheduled ✓`);

    // Wait out that buffer, then poll for the immediate Scheduled -> Live
    // flip once the start time actually passes. Confirmed with the user: a
    // plain repeated searchByName() poll can keep returning a stale
    // "Scheduled" past the real change — Reset the filters before each
    // re-search to force a genuinely fresh read.
    await expect.poll(
      () => Date.now() >= startMoment.getTime(),
      { timeout: 150000, intervals: [3000] },
    ).toBe(true);
    await expect.poll(
      async () => {
        await listPage.clickReset();
        await listPage.searchByName(campaignName);
        return listPage.getListRowStatus(campaignName);
      },
      { timeout: 60000, intervals: [2000] },
    ).toBe('Live');
    console.log(`  Campaign "${campaignName}" transitioned to Live immediately after start time passed ✓`);

    // Confirmed with the user: a Live campaign's start date (and related
    // sections) stay editable for a full minute PAST the actual start time
    // before the lock kicks in — wait out that grace window before asserting
    // any lock behavior below. Computed from the exact fill moment above.
    const graceWindowEndMs = startMoment.getTime() + 60000 + 5000;
    await expect.poll(
      () => Date.now() >= graceWindowEndMs,
      { timeout: 90000, intervals: [3000] },
    ).toBe(true);

    // ── (a) Start date is locked for edit on a Live campaign ────────────────
    await listPage.clickEditCampaignForRow(campaignName);
    await createPage.assertEditDrawerVisible();
    const startDateDisabled = await createPage.isStartDateDisabled();
    console.log(`  Start date field disabled on Live campaign — actual: ${startDateDisabled}`);
    expect(startDateDisabled).toBe(true);
    logTestSuccess(`Live campaign's start date field is correctly locked for edit`);

    // ── (b) Ruleset: Active toggle + "Update ruleset" submit both locked while A/B is enabled ──
    const rulesetToggleDisabledBefore = await createPage.isRulesetToggleDisabled(CHANNEL, RULESET_TEMPLATE);
    console.log(`  Ruleset "${RULESET_TEMPLATE}" Active toggle disabled (A/B on) — actual: ${rulesetToggleDisabledBefore}`);
    expect(rulesetToggleDisabledBefore).toBe(true);

    await createPage.clickEditRuleset(CHANNEL, RULESET_TEMPLATE);
    const updateRulesetDisabledBefore = await createPage.isUpdateRulesetButtonDisabled();
    console.log(`  "Update ruleset" submit button disabled (A/B on) — actual: ${updateRulesetDisabledBefore}`);
    expect(updateRulesetDisabledBefore).toBe(true);
    logTestSuccess(`Ruleset is correctly locked (Active toggle + "Update ruleset" submit both disabled) while A/B testing is enabled`);
    await createPage.closeAllDrawers();

    // ── (c) Rule: Active toggle + "Update rule" submit both locked while A/B is enabled ──
    await listPage.clickEditCampaignForRow(campaignName);
    await createPage.assertEditDrawerVisible();
    await createPage.clickViewRules(CHANNEL);
    await createPage.assertRuleDialogVisible();

    const ruleToggleDisabledBefore = await createPage.isRuleToggleDisabled(RULE_TEMPLATE);
    console.log(`  Rule "${RULE_TEMPLATE}" Active toggle disabled (A/B on) — actual: ${ruleToggleDisabledBefore}`);
    expect(ruleToggleDisabledBefore).toBe(true);

    await createPage.clickEditRule(RULE_TEMPLATE);
    const updateRuleDisabledBefore = await createPage.isUpdateRuleButtonDisabled();
    console.log(`  "Update rule" submit button disabled (A/B on) — actual: ${updateRuleDisabledBefore}`);
    expect(updateRuleDisabledBefore).toBe(true);
    logTestSuccess(`Rule is correctly locked (Active toggle + "Update rule" submit both disabled) while A/B testing is enabled`);
    // Close only the "Update rule" drawer just opened — stay inside the same
    // already-open Rule list dialog for the rest of this section.
    await createPage.closeInnermostDrawer();

    // ── (d) Adding a brand-NEW rule to a Live campaign IS allowed ────────────
    await createPage.clickAddRuleInList();
    // A distinct template from RULE_TEMPLATE, so the new rule is clearly its
    // own thing rather than a duplicate of the rule under test.
    await createPage.selectRuleTemplate(RULE_TEMPLATE_ALT);
    await createPage.fillRuleName(newRuleName);
    await createPage.submitRuleDrawer();
    await createPage.assertRuleInList(newRuleName);
    logTestSuccess(`Adding a brand-new rule ("${newRuleName}") to a Live campaign is correctly allowed`);

    // Every rule needs a COMPLETE experience (control AND variant) to save
    // the campaign at all — confirmed live via the actual save-toast text:
    // control-only here fails with "Add content for every rule", silently
    // treated as success by assertSaveSuccess() (it only checks a toast
    // appeared, not its text) until this test started logging that text.
    await createPage.clickAddContents();
    await createPage.assertAddExperienceDialogVisible();
    await createPage.clickAddControlContents();
    // Distinct entries from the original rule's own experience (CONTROL_ENTRY_ALT
    // / VARIANT_ENTRY_ALT, not CONTROL_ENTRY / VARIANT_ENTRY) — testing whether
    // reusing the exact same entries across two rules in one campaign is what
    // was disturbing the original rule's own A/B read.
    await createPage.selectExistingEntry(CONTROL_ENTRY_ALT);
    // Confirmed live: clicking "Choose variant" immediately after
    // selectExistingEntry() returns can race the dialog's own state catching
    // up — the control content picker closing doesn't mean the "Choose
    // variant" button has actually rendered yet. Without this wait, the
    // experience can silently save as control-only, later blocked by "Add a
    // variant for every default content in the experience".
    await createPage.assertControlContentAdded();
    await createPage.clickChooseVariant();
    await createPage.selectExistingEntry(VARIANT_ENTRY_ALT);
    await createPage.submitExperience();

    // ── (e) A/B stop confirmation — exact message text; "cancel" leaves it unchanged ──
    // Straight into the original rule's content, staying in the same Rule
    // list dialog session — no Continue/reopen in between (confirmed as the
    // correct sequence: closing and reopening here was itself the source of
    // the original rule's A/B read coming back wrong).
    await createPage.clickViewContents(RULE_TEMPLATE);
    await createPage.assertAddExperienceDialogVisible();
    const statusBeforeToggle = await createPage.getABTestingStatusLabel();
    console.log(`  A/B testing status before toggling off — actual: "${statusBeforeToggle}"`);
    expect(statusBeforeToggle).toBe('Enabled');

    await createPage.disableABTesting();
    const actualStopMessage = await createPage.getABStopConfirmationMessage();
    const expectedStopMessage = 'A/B testing is currently running in this campaign. If you turn off the A/B test, all existing A/B test keys will be cleared, and users may see a different experience. Are you sure you want to stop the A/B test?';
    console.log(`  A/B stop confirmation — actual: "${actualStopMessage}" | expected: "${expectedStopMessage}" | equal: ${normalizeWhitespace(actualStopMessage) === normalizeWhitespace(expectedStopMessage)}`);
    expect(normalizeWhitespace(actualStopMessage)).toBe(normalizeWhitespace(expectedStopMessage));

    await createPage.cancelABStopConfirmation();
    const statusAfterCancel = await createPage.getABTestingStatusLabel();
    console.log(`  A/B testing status after "cancel" — actual: "${statusAfterCancel}"`);
    expect(statusAfterCancel).toBe('Enabled');
    logTestSuccess(`"Cancel" on the A/B stop confirmation correctly left A/B testing Enabled and unchanged`);

    // ── (f) "update" disables A/B testing and unlocks ruleset/rule editing ───
    await createPage.disableABTesting();
    await createPage.confirmABStopConfirmation();
    const statusAfterUpdate = await createPage.getABTestingStatusLabel();
    console.log(`  A/B testing status after "update" — actual: "${statusAfterUpdate}"`);
    expect(statusAfterUpdate).toBe('Disabled');

    const addControlContentsDisabledAfter = await createPage.isAddControlContentsDisabled();
    console.log(`  "Add control contents" disabled immediately after turning A/B off — actual: ${addControlContentsDisabledAfter}`);
    expect(addControlContentsDisabledAfter).toBe(false);

    await createPage.submitExperience();
    logTestSuccess(`A/B testing turned off via "update" and saved`);

    // Rule is now unlocked — checked from the same Rule list dialog the save returned to.
    const ruleToggleDisabledAfter = await createPage.isRuleToggleDisabled(RULE_TEMPLATE);
    console.log(`  Rule "${RULE_TEMPLATE}" Active toggle disabled after A/B off — actual: ${ruleToggleDisabledAfter}`);
    expect(ruleToggleDisabledAfter).toBe(false);

    await createPage.clickEditRule(RULE_TEMPLATE);
    const updateRuleDisabledAfter = await createPage.isUpdateRuleButtonDisabled();
    console.log(`  "Update rule" submit button disabled after A/B off — actual: ${updateRuleDisabledAfter}`);
    expect(updateRuleDisabledAfter).toBe(false);
    logTestSuccess(`Rule is correctly unlocked (Active toggle + "Update rule" submit both enabled) after turning off A/B testing`);

    // Nested edits (turning off A/B testing) only live in the drawers' own
    // client-side session state until the OUTER "Update campaign" drawer is
    // itself submitted — closing back out via Cancel instead discards them,
    // reverting the campaign to its last actually-persisted state (confirmed
    // live: this is why a freshly-reopened check of the ruleset kept reading
    // "still locked" — the A/B-off change was never actually saved). Navigate
    // back up properly instead of cancelling out.
    await createPage.closeInnermostDrawer(); // closes the "Update rule" viewer drawer just opened above
    await createPage.clickContinueOnRuleDialog();
    await createPage.clickUpdateCampaign();
    // assertSaveSuccess() only checks that SOME toast appeared — it doesn't
    // distinguish a real success from a validation error toast using the same
    // CSS class. Log the actual text so a silent save failure here is visible.
    const updateCampaignToastText = await createPage.assertSaveSuccess();
    console.log(`  "Update Campaign" save toast — actual text: "${updateCampaignToastText}"`);
    // Confirmed live: unlike the Create flow, an edit-mode "Update Campaign"
    // save does NOT auto-close its drawer afterward — it just stays open.
    // The save already succeeded at this point, so closing it now is safe.
    await createPage.closeAllDrawers();

    // Ruleset is now unlocked too — checked from a freshly-reopened Edit Campaign drawer.
    await listPage.clickEditCampaignForRow(campaignName);
    await createPage.assertEditDrawerVisible();
    const rulesetToggleDisabledAfter = await createPage.isRulesetToggleDisabled(CHANNEL, RULESET_TEMPLATE);
    console.log(`  Ruleset "${RULESET_TEMPLATE}" Active toggle disabled after A/B off — actual: ${rulesetToggleDisabledAfter}`);
    expect(rulesetToggleDisabledAfter).toBe(false);

    // Rule's own unlock + the A/B-off persistence itself — re-checked from
    // this same freshly-reopened Edit Campaign drawer, not just trusted from
    // the in-session read at (f) above.
    await createPage.clickViewRules(CHANNEL);
    await createPage.assertRuleDialogVisible();
    const ruleToggleDisabledAfterReopen = await createPage.isRuleToggleDisabled(RULE_TEMPLATE);
    console.log(`  Rule "${RULE_TEMPLATE}" Active toggle disabled after reopen — actual: ${ruleToggleDisabledAfterReopen}`);
    expect(ruleToggleDisabledAfterReopen).toBe(false);

    await createPage.clickViewContents(RULE_TEMPLATE);
    await createPage.assertAddExperienceDialogVisible();
    const abStatusAfterReopen = await createPage.getABTestingStatusLabel();
    console.log(`  A/B testing status after reopen — actual: "${abStatusAfterReopen}"`);
    expect(abStatusAfterReopen).toBe('Disabled');
    logTestSuccess(`Rule "${RULE_TEMPLATE}" is correctly unlocked and A/B testing correctly persisted as Disabled after reopening Edit Campaign`);
    await createPage.closeInnermostDrawer(); // closes "Add experience"
    await createPage.closeInnermostDrawer(); // closes "Rule" list dialog, back to "Update campaign"

    await createPage.clickEditRuleset(CHANNEL, RULESET_TEMPLATE);
    const updateRulesetDisabledAfter = await createPage.isUpdateRulesetButtonDisabled();
    console.log(`  "Update ruleset" submit button disabled after A/B off — actual: ${updateRulesetDisabledAfter}`);
    expect(updateRulesetDisabledAfter).toBe(false);
    logTestSuccess(`Ruleset is correctly unlocked (Active toggle + "Update ruleset" submit both enabled) after turning off A/B testing`);
    await createPage.closeAllDrawers();

    // ── Cleanup — this test's own Live campaign must not linger in master ───
    await listPage.searchByName(campaignName);
    await listPage.clickStopCampaign(campaignName);
    await listPage.assertStopDialogVisible();
    await listPage.confirmStop();
    await listPage.assertRowStatus(campaignName, 'Expired');
    await listPage.clickDeleteCampaign(campaignName);
    await listPage.assertDeleteDialogVisible();
    await listPage.confirmDelete();
    await listPage.assertCampaignRemoved(campaignName);
    logTestSuccess(`Cleanup — campaign "${campaignName}" stopped and deleted`);
  });

  test('P13N-LIFECYCLE-007 | Expired status: View/Edit/Copy/Delete enabled, Pause/Stop disabled; View shows correct name + status; Edit drawer opens but "Update Campaign" is disabled; Delete removes the campaign', async () => {
    const campaignName = `P13N_Automation_ExpiredActions_${Date.now()}`;
    const startDate     = futureDateStr(8, 10, 0);
    const abEndDate     = futureDateStr(15, 10, 0);

    await createScheduledCampaign(campaignName, startDate, abEndDate);
    console.log(`  Campaign "${campaignName}" created and verified in Scheduled status ✓`);

    // Push Scheduled -> Expired ourselves via Stop, on a campaign we built
    // through the normal Create flow — the campaign list also contains legacy
    // "Content Personalization" entries whose Edit action navigates to a raw
    // Contentful entry editor instead of the in-app drawer (confirmed live);
    // building our own avoids picking one of those by accident.
    await listPage.clickStopCampaign(campaignName);
    await listPage.assertStopDialogVisible();
    await listPage.confirmStop();
    await listPage.assertRowStatus(campaignName, 'Expired');
    logTestSuccess(`Campaign "${campaignName}" stopped — moved to Expired status`);

    // ── Verification — read the live per-button state and display it ─────────
    const { enabled, disabled } = await listPage.getRowActionStates(campaignName);
    console.log(`  Enabled action icons  (actual, live) : ${enabled.join(', ') || '(none)'}`);
    console.log(`  Disabled action icons (actual, live) : ${disabled.join(', ') || '(none)'}`);

    await listPage.assertActionEnabled(campaignName, 'View Details');
    await listPage.assertActionEnabled(campaignName, 'Edit Campaign');
    await listPage.assertActionEnabled(campaignName, 'Copy Campaign');
    await listPage.assertActionEnabled(campaignName, 'Delete Campaign');
    await listPage.assertActionDisabled(campaignName, 'Pause Campaign');
    await listPage.assertActionDisabled(campaignName, 'Stop Campaign');
    logTestSuccess(`Expired row action states correct — View/Edit/Copy/Delete enabled, Pause/Stop disabled`);

    // ── View Details — drawer shows the correct name + status ────────────────
    await listPage.clickViewDetails(campaignName);
    await listPage.assertViewDetailsVisible();
    const { name: viewName, status: viewStatus } = await listPage.getViewDetailsNameAndStatus();
    console.log(`  View drawer — name: "${viewName}" | status: "${viewStatus}"`);
    expect(normalizeWhitespace(viewName)).toBe(campaignName);
    expect(normalizeWhitespace(viewStatus)).toBe('Expired');
    logTestSuccess(`View Details drawer correctly shows the campaign's name and "Expired" status`);
    await listPage.closeViewDetails();

    // ── Edit — the drawer opens, but "Update Campaign" is disabled ───────────
    await listPage.clickEditCampaignForRow(campaignName);
    await createPage.assertEditDrawerVisible();
    const updateCampaignDisabled = await createPage.isUpdateCampaignButtonDisabled();
    console.log(`  "Update Campaign" submit button disabled on an Expired campaign — actual: ${updateCampaignDisabled}`);
    expect(updateCampaignDisabled).toBe(true);
    logTestSuccess(`Edit Campaign correctly opens the "Update campaign" drawer, with its "Update Campaign" submit button disabled`);
    await createPage.clickCancel();

    // ── Delete — campaign is removed from the list ────────────────────────────
    await listPage.clickDeleteCampaign(campaignName);
    await listPage.assertDeleteDialogVisible();
    await listPage.confirmDelete();
    await listPage.assertCampaignRemoved(campaignName);
    logTestSuccess(`Delete icon clicked and confirmed — campaign "${campaignName}" removed from the campaign list`);
  });

  test('P13N-LIFECYCLE-008 | Editing a Draft campaign\'s name and saving persists the change — not just a success toast', async () => {
    const campaignName = `P13N_Automation_EditPersistOld_${Date.now()}`;
    const editedName    = `P13N_Automation_EditPersistNew_${Date.now()}`;

    await createMinimalDraftCampaign(campaignName);
    console.log(`  Campaign "${campaignName}" created and saved as Draft ✓`);

    await listPage.filterByDate('All days');
    await listPage.searchByName(campaignName);
    await listPage.clickEditCampaignForRow(campaignName);
    await createPage.assertEditDrawerVisible();
    await createPage.fillName(editedName);
    await createPage.clickSaveDraft();
    const toastText = await createPage.assertSaveSuccess();
    console.log(`  Save toast — actual text: "${toastText}"`);

    // A visible toast alone doesn't prove the edit actually persisted —
    // confirmed live elsewhere in this suite (assertSaveSuccess()'s own doc
    // comment) that a toast can render even when the underlying save
    // silently fails or is rejected. Re-search by the exact NEW name and the
    // exact OLD name (deliberately not a substring of each other, so a
    // prefix-match search can't produce a false positive either way) to
    // prove the rename genuinely round-tripped through a real save.
    await listPage.searchByName(editedName);
    await listPage.assertCampaignVisible(editedName);
    await listPage.assertRowStatus(editedName, 'Draft');
    logTestSuccess(`Renamed campaign "${editedName}" found by exact search, status still Draft`);

    await listPage.searchByName(campaignName);
    await listPage.assertNoResults();
    logTestSuccess(`Original name "${campaignName}" no longer found — the rename genuinely persisted`);

    // Re-opening Edit and reading the field back is the strongest proof: it
    // shows whatever the backend actually has, not the list row's own cache.
    await listPage.searchByName(editedName);
    await listPage.clickEditCampaignForRow(editedName);
    await createPage.assertEditDrawerVisible();
    const prefilledName = await createPage.getNameFieldValue();
    console.log(`  Re-opened Edit drawer — Campaign name field pre-filled with: "${prefilledName}"`);
    expect(prefilledName).toBe(editedName);
    logTestSuccess(`Re-opening Edit shows the persisted name pre-filled, confirming the save reached the backend`);
    await createPage.clickCancel();

    // ── Cleanup ────────────────────────────────────────────────────────────
    await listPage.clickDeleteCampaign(editedName);
    await listPage.assertDeleteDialogVisible();
    await listPage.confirmDelete();
    await listPage.assertCampaignRemoved(editedName);
    logTestSuccess(`Cleanup — campaign "${editedName}" deleted`);
  });

  test('P13N-LIFECYCLE-009 | A Draft campaign saved with no start date is invisible under the "Today" date filter and only found under "All days"', async () => {
    const campaignName = `P13N_Automation_NoStartDateDraft_${Date.now()}`;

    await createMinimalDraftCampaign(campaignName);
    console.log(`  Campaign "${campaignName}" created with no start date and saved as Draft ✓`);

    // Confirmed live via manual investigation: a Draft campaign saved with no
    // start date set does not appear under the "Today" date filter — same
    // root class of gap as LIFECYCLE-006/007's fix, where a future-dated
    // Scheduled campaign is also invisible under "Today". There, the date is
    // set but doesn't match today; here, there is no date at all.
    await listPage.filterByDate('Today');
    await listPage.searchByName(campaignName);
    await listPage.assertNoResults();
    logTestSuccess(`Campaign with no start date is correctly invisible under the "Today" date filter`);

    await listPage.filterByDate('All days');
    await listPage.searchByName(campaignName);
    await listPage.assertCampaignVisible(campaignName);
    await listPage.assertRowStatus(campaignName, 'Draft');
    logTestSuccess(`Campaign with no start date is correctly found under "All days", status Draft`);

    // ── Cleanup ────────────────────────────────────────────────────────────
    await listPage.clickDeleteCampaign(campaignName);
    await listPage.assertDeleteDialogVisible();
    await listPage.confirmDelete();
    await listPage.assertCampaignRemoved(campaignName);
    logTestSuccess(`Cleanup — campaign "${campaignName}" deleted`);
  });

  // ─── Search & filter ────────────────────────────────────────────────────────

  test('P13N-LIFECYCLE-010 | Search & filter UI elements are visible, and Reset clears the Name/Status/Date filters back to their defaults', async () => {
    await listPage.assertSearchFilterUIVisible();
    logTestSuccess(`Name textbox, Status dropdown, Date dropdown, Search and Reset buttons are all visible`);

    // Apply every filter to a non-default state, then Reset and confirm each
    // one actually reverted — not just that the button exists and is clickable.
    await listPage.searchByName('P13N_Automation');
    await listPage.filterByStatus('Draft');
    await listPage.filterByDate('Yesterday');

    await listPage.clickReset();
    const frame = sharedPage.frameLocator('[data-test-id="cf-widget-renderer"]');
    const nameValue = await frame.getByRole('textbox', { name: 'Enter campaign name' }).inputValue();
    // Reset restores the app's own true defaults — Status "All statuses" and
    // Date "Today" (not "All days"; that's a non-default value beforeAll()
    // switches to once at the very start of this file, confirmed
    // repeatedly elsewhere in this suite).
    const statusText = (await frame.getByRole('button', { name: /All statuses|Live|Scheduled|Paused|Draft|Expired/ }).first().textContent())?.trim();
    const dateText = (await frame.getByRole('combobox').filter({ hasText: /Today|All days/ }).textContent())?.trim();
    console.log(`  After Reset — Name: "${nameValue}" | Status: "${statusText}" | Date: "${dateText}"`);
    expect(nameValue).toBe('');
    expect(statusText).toBe('All statuses');
    expect(dateText).toBe('Today');
    logTestSuccess(`Reset correctly cleared the Name field and restored Status to "All statuses" and Date to "Today"`);

    // This test itself leaves the Date filter on "Today" (the real default)
    // — restore "All days" so later tests in this shared session aren't
    // affected by it (the exact class of leak LIFECYCLE-007's fix guards
    // against).
    await listPage.filterByDate('All days');
  });

  test('P13N-LIFECYCLE-011 | Name search is case-insensitive; an exact or partial match finds the campaign, a genuinely non-existent name does not', async () => {
    const campaignName = `P13N_SearchTest_${Date.now()}`;
    await createMinimalDraftCampaign(campaignName);
    console.log(`  Campaign "${campaignName}" created and saved as Draft ✓`);
    await listPage.filterByDate('All days');

    // Exact name, exact case
    await listPage.searchByName(campaignName);
    await listPage.assertCampaignVisible(campaignName);
    logTestSuccess(`Exact name search finds the campaign`);

    // Prefix of the name, lowercased — confirmed live: search is case-insensitive
    await listPage.searchByName(campaignName.slice(0, 12).toLowerCase());
    await listPage.assertCampaignVisible(campaignName);
    logTestSuccess(`Lowercased prefix search still finds the campaign (case-insensitive)`);

    // A genuine mid-string fragment also matches — confirmed live (NOT
    // prefix-anchored the way an earlier version of this test assumed): a
    // fragment taken from the middle of a campaign's own name, spanning a
    // "_" boundary, still finds it. The exact matching algorithm (tokenized,
    // fuzzy, or otherwise) isn't pinned down here — only that a match exists.
    const midFragment = campaignName.slice(10, 22);
    await listPage.searchByName(midFragment);
    await listPage.assertCampaignVisible(campaignName);
    logTestSuccess(`A mid-string fragment ("${midFragment}") of the campaign's own name also finds it`);

    // A name that genuinely doesn't exist — a real negative case, not
    // dependent on any assumption about where in a name matching can start.
    await listPage.searchByName(`ZZZ_DOES_NOT_EXIST_${Date.now()}`);
    await listPage.assertNoResults();
    logTestSuccess(`Searching a genuinely non-existent name returns "No results."`);

    // ── Cleanup ────────────────────────────────────────────────────────────
    await listPage.searchByName(campaignName);
    await listPage.clickDeleteCampaign(campaignName);
    await listPage.assertDeleteDialogVisible();
    await listPage.confirmDelete();
    await listPage.assertCampaignRemoved(campaignName);
    logTestSuccess(`Cleanup — campaign "${campaignName}" deleted`);
  });

  test('P13N-LIFECYCLE-012 | Combining an exact Name with a non-matching Status returns "No results." — Name and Status filters combine with AND logic', async () => {
    const campaignName = `P13N_SearchAndFilter_${Date.now()}`;
    await createMinimalDraftCampaign(campaignName);
    console.log(`  Campaign "${campaignName}" created and saved as Draft ✓`);
    await listPage.filterByDate('All days');

    // Sanity check — the campaign is genuinely findable by name alone first.
    await listPage.searchByName(campaignName);
    await listPage.assertCampaignVisible(campaignName);

    // Confirmed live (this was the actual root cause behind an earlier flaky
    // test in this file — findExistingCampaignByStatus() picking up a
    // leftover Name value from a previous test and silently combining it
    // with a Status filter): the Name box isn't cleared by filterByStatus(),
    // so searching this Draft campaign's exact name while also filtering for
    // "Live" status combines both filters and correctly returns nothing.
    await listPage.filterByStatus('Live');
    await listPage.assertNoResults();
    logTestSuccess(`Exact name + non-matching Status ("Live" on a Draft campaign) correctly returns "No results." — filters combine with AND, not OR`);

    // ── Cleanup ────────────────────────────────────────────────────────────
    await listPage.filterByStatus('All statuses');
    await listPage.searchByName(campaignName);
    await listPage.clickDeleteCampaign(campaignName);
    await listPage.assertDeleteDialogVisible();
    await listPage.confirmDelete();
    await listPage.assertCampaignRemoved(campaignName);
    logTestSuccess(`Cleanup — campaign "${campaignName}" deleted`);
  });

  test('P13N-LIFECYCLE-013 | A Status-only filter (no Name term) returns only campaigns in that status', async () => {
    await listPage.clickReset();
    await listPage.filterByDate('All days');
    await listPage.filterByStatus('Draft');

    const resultsCount = await listPage.getResultsCount();
    console.log(`  Status filter "Draft" — Results count: ${resultsCount}`);
    expect(resultsCount).toBeGreaterThan(0);
    await listPage.assertAllVisibleRowsHaveStatus('Draft');
    logTestSuccess(`Status-only filter "Draft" correctly returns only Draft campaigns (spot-checked)`);

    await listPage.filterByStatus('All statuses');
  });

  test('P13N-LIFECYCLE-014 | Selecting the Live status filter shows only Live campaigns', async () => {
    await listPage.clickReset();
    await listPage.filterByDate('All days');
    await listPage.filterByStatus('Live');

    const resultsCount = await listPage.getResultsCount();
    console.log(`  Status filter "Live" — Results count: ${resultsCount}`);
    expect(resultsCount).toBeGreaterThan(0);
    await listPage.assertAllVisibleRowsHaveStatus('Live');
    logTestSuccess(`Status-only filter "Live" correctly returns only Live campaigns (spot-checked)`);

    await listPage.filterByStatus('All statuses');
  });

  test('P13N-LIFECYCLE-015 | Selecting the Scheduled status filter shows only Scheduled campaigns', async () => {
    await listPage.clickReset();
    await listPage.filterByDate('All days');
    await listPage.filterByStatus('Scheduled');

    const resultsCount = await listPage.getResultsCount();
    console.log(`  Status filter "Scheduled" — Results count: ${resultsCount}`);
    expect(resultsCount).toBeGreaterThan(0);
    await listPage.assertAllVisibleRowsHaveStatus('Scheduled');
    logTestSuccess(`Status-only filter "Scheduled" correctly returns only Scheduled campaigns (spot-checked)`);

    await listPage.filterByStatus('All statuses');
  });

  test('P13N-LIFECYCLE-016 | Selecting the Paused status filter shows only Paused campaigns', async () => {
    await listPage.clickReset();
    await listPage.filterByDate('All days');
    await listPage.filterByStatus('Paused');

    const resultsCount = await listPage.getResultsCount();
    console.log(`  Status filter "Paused" — Results count: ${resultsCount}`);
    expect(resultsCount).toBeGreaterThan(0);
    await listPage.assertAllVisibleRowsHaveStatus('Paused');
    logTestSuccess(`Status-only filter "Paused" correctly returns only Paused campaigns (spot-checked)`);

    await listPage.filterByStatus('All statuses');
  });

  test('P13N-LIFECYCLE-017 | Selecting the Expired status filter shows only Expired campaigns', async () => {
    await listPage.clickReset();
    await listPage.filterByDate('All days');
    await listPage.filterByStatus('Expired');

    const resultsCount = await listPage.getResultsCount();
    console.log(`  Status filter "Expired" — Results count: ${resultsCount}`);
    expect(resultsCount).toBeGreaterThan(0);
    await listPage.assertAllVisibleRowsHaveStatus('Expired');
    logTestSuccess(`Status-only filter "Expired" correctly returns only Expired campaigns (spot-checked)`);

    await listPage.filterByStatus('All statuses');
  });

  test('P13N-LIFECYCLE-018 | Selecting multiple statuses (Live + Scheduled) in the Status filter shows only campaigns in the selected statuses', async () => {
    await listPage.clickReset();
    await listPage.filterByDate('All days');

    // Confirmed live: the Status dropdown is a genuine multi-select — picking
    // a second option doesn't replace the first, and the trigger's label
    // becomes "N selected" once 2+ are chosen. Establish each status's own
    // count first (live, not hardcoded) so the combined count can be proven
    // against them rather than an assumed number.
    await listPage.filterByStatus('Live');
    const liveCount = await listPage.getResultsCount();
    console.log(`  "Live" alone — Results count: ${liveCount}`);

    await listPage.clickReset();
    await listPage.filterByDate('All days');
    await listPage.filterByStatus('Scheduled');
    const scheduledCount = await listPage.getResultsCount();
    console.log(`  "Scheduled" alone — Results count: ${scheduledCount}`);

    await listPage.clickReset();
    await listPage.filterByDate('All days');
    await listPage.filterByStatuses(['Live', 'Scheduled']);
    const combinedCount = await listPage.getResultsCount();
    console.log(`  "Live" + "Scheduled" combined — Results count: ${combinedCount}`);

    expect(combinedCount).toBe(liveCount + scheduledCount);
    await listPage.assertAllVisibleRowsHaveAnyStatus(['Live', 'Scheduled']);
    logTestSuccess(`Multi-select status filter (Live + Scheduled) returns exactly the union of both individual counts (${liveCount} + ${scheduledCount} = ${combinedCount}), with no other status present`);

    await listPage.clickReset();
    await listPage.filterByDate('All days');
  });

  test('P13N-LIFECYCLE-019 | The sum of each individual status filter\'s count equals the "All statuses" total count', async () => {
    const STATUSES = ['Live', 'Scheduled', 'Paused', 'Draft', 'Expired'];

    await listPage.clickReset();
    await listPage.filterByDate('All days');
    const allStatusesCount = await listPage.getUnfilteredResultsCount();

    const counts: Record<string, number> = {};
    for (const status of STATUSES) {
      await listPage.clickReset();
      await listPage.filterByDate('All days');
      await listPage.filterByStatus(status);
      counts[status] = await listPage.getResultsCount();
    }

    const sum = STATUSES.reduce((total, status) => total + counts[status], 0);

    console.log(`  ── Personalization campaign counts by status ──`);
    for (const status of STATUSES) {
      console.log(`  ${status.padEnd(14)}: ${counts[status]}`);
    }
    console.log(`  ${'Sum'.padEnd(14)}: ${sum}`);
    console.log(`  ${'All statuses'.padEnd(14)}: ${allStatusesCount}`);

    expect(sum).toBe(allStatusesCount);
    logTestSuccess(`Sum of every individual status count (${sum}) equals the "All statuses" total (${allStatusesCount})`);

    await listPage.clickReset();
    await listPage.filterByDate('All days');
  });

  test('P13N-LIFECYCLE-020 | Combining an exact Name with its own matching Status finds the campaign — positive case for Name + Status AND logic', async () => {
    const campaignName = `P13N_NameStatusPositive_${Date.now()}`;
    await createMinimalDraftCampaign(campaignName);
    console.log(`  Campaign "${campaignName}" created and saved as Draft ✓`);

    await listPage.clickReset();
    await listPage.filterByDate('All days');
    await listPage.searchByName(campaignName);
    await listPage.filterByStatus('Draft');
    await listPage.assertCampaignVisible(campaignName);
    await listPage.assertRowStatus(campaignName, 'Draft');
    logTestSuccess(`Exact name + its own matching Status ("Draft") correctly finds the campaign — AND logic doesn't just reject, it also correctly matches`);

    // ── Cleanup ────────────────────────────────────────────────────────────
    await listPage.filterByStatus('All statuses');
    await listPage.searchByName(campaignName);
    await listPage.clickDeleteCampaign(campaignName);
    await listPage.assertDeleteDialogVisible();
    await listPage.confirmDelete();
    await listPage.assertCampaignRemoved(campaignName);
    logTestSuccess(`Cleanup — campaign "${campaignName}" deleted`);
  });

  test('P13N-LIFECYCLE-021 | Combining an exact Name with the Date filter — a campaign with no start date is found under "All days" but not under "Today"', async () => {
    const campaignName = `P13N_NameDateCombo_${Date.now()}`;
    await createMinimalDraftCampaign(campaignName);
    console.log(`  Campaign "${campaignName}" created with no start date and saved as Draft ✓`);

    await listPage.filterByDate('Today');
    await listPage.searchByName(campaignName);
    await listPage.assertNoResults();
    logTestSuccess(`Exact name + Date="Today" correctly returns "No results." — the campaign has no start date`);

    await listPage.filterByDate('All days');
    await listPage.searchByName(campaignName);
    await listPage.assertCampaignVisible(campaignName);
    logTestSuccess(`The same exact name + Date="All days" correctly finds the campaign`);

    // ── Cleanup ────────────────────────────────────────────────────────────
    await listPage.clickDeleteCampaign(campaignName);
    await listPage.assertDeleteDialogVisible();
    await listPage.confirmDelete();
    await listPage.assertCampaignRemoved(campaignName);
    logTestSuccess(`Cleanup — campaign "${campaignName}" deleted`);
  });

  test('P13N-LIFECYCLE-022 | Combining the Status filter with the Date filter — a Draft campaign with no start date is found under Draft + "All days" but not under Draft + "Today"', async () => {
    const campaignName = `P13N_StatusDateCombo_${Date.now()}`;
    await createMinimalDraftCampaign(campaignName);
    console.log(`  Campaign "${campaignName}" created with no start date and saved as Draft ✓`);

    // No Name term here — other genuine Draft campaigns exist, so a scoped
    // "not visible" check is used instead of a blanket assertNoResults().
    await listPage.clickReset();
    await listPage.filterByDate('Today');
    await listPage.filterByStatus('Draft');
    await listPage.assertCampaignNotVisible(campaignName);
    logTestSuccess(`Status="Draft" + Date="Today" correctly excludes the campaign — it has no start date`);

    await listPage.clickReset();
    await listPage.filterByDate('All days');
    await listPage.filterByStatus('Draft');
    await listPage.assertCampaignVisible(campaignName);
    logTestSuccess(`Status="Draft" + Date="All days" correctly includes the campaign`);

    // ── Cleanup ────────────────────────────────────────────────────────────
    await listPage.filterByStatus('All statuses');
    await listPage.searchByName(campaignName);
    await listPage.clickDeleteCampaign(campaignName);
    await listPage.assertDeleteDialogVisible();
    await listPage.confirmDelete();
    await listPage.assertCampaignRemoved(campaignName);
    logTestSuccess(`Cleanup — campaign "${campaignName}" deleted`);
  });

  test('P13N-LIFECYCLE-023 | Combining Name, Status, and Date together — all three filters apply simultaneously (AND logic)', async () => {
    const campaignName = `P13N_TripleCombo_${Date.now()}`;
    await createMinimalDraftCampaign(campaignName);
    console.log(`  Campaign "${campaignName}" created with no start date and saved as Draft ✓`);

    // ── All three correct — found ──────────────────────────────────────────
    await listPage.clickReset();
    await listPage.filterByDate('All days');
    await listPage.searchByName(campaignName);
    await listPage.filterByStatus('Draft');
    await listPage.assertCampaignVisible(campaignName);
    logTestSuccess(`Name + Status="Draft" + Date="All days" (all correct) correctly finds the campaign`);

    // ── Wrong Status breaks the match, even with correct Name + Date ──────────
    await listPage.clickReset();
    await listPage.filterByDate('All days');
    await listPage.searchByName(campaignName);
    await listPage.filterByStatus('Live');
    await listPage.assertNoResults();
    logTestSuccess(`Name + Status="Live" (wrong) + Date="All days" correctly returns "No results."`);

    // ── Wrong Date breaks the match, even with correct Name + Status ──────────
    await listPage.clickReset();
    await listPage.filterByDate('Today');
    await listPage.searchByName(campaignName);
    await listPage.filterByStatus('Draft');
    await listPage.assertNoResults();
    logTestSuccess(`Name + Status="Draft" + Date="Today" (wrong) correctly returns "No results." — all three filters must match together`);

    // ── Cleanup ────────────────────────────────────────────────────────────
    await listPage.clickReset();
    await listPage.filterByDate('All days');
    await listPage.searchByName(campaignName);
    await listPage.clickDeleteCampaign(campaignName);
    await listPage.assertDeleteDialogVisible();
    await listPage.confirmDelete();
    await listPage.assertCampaignRemoved(campaignName);
    logTestSuccess(`Cleanup — campaign "${campaignName}" deleted`);
  });

  test('P13N-LIFECYCLE-024 | Filtering by a Custom date range correctly includes campaigns whose start date falls within it and excludes those outside it', async () => {
    const campaignInRange    = `P13N_CustomRangeIn_${Date.now()}`;
    const campaignOutOfRange = `P13N_CustomRangeOut_${Date.now()}`;

    // In-range campaign starts 3 days from now; out-of-range starts 15 days
    // from now — both well inside the two-month calendar the Custom picker
    // shows (so no "next month" navigation is needed), but only the first
    // falls inside the 0-7-day filter window applied below.
    await createMinimalDraftCampaign(campaignInRange, futureDateStr(3, 10, 0));
    console.log(`  Campaign "${campaignInRange}" created with a start date 3 days from now ✓`);
    await createMinimalDraftCampaign(campaignOutOfRange, futureDateStr(15, 10, 0));
    console.log(`  Campaign "${campaignOutOfRange}" created with a start date 15 days from now ✓`);

    const rangeStart = new Date();
    const rangeEnd = new Date();
    rangeEnd.setDate(rangeEnd.getDate() + 7);
    console.log(`  Custom date range applied: ${rangeStart.toDateString()} - ${rangeEnd.toDateString()}`);

    // ── Inside the range — found ──────────────────────────────────────────
    await listPage.clickReset();
    await listPage.filterByCustomDateRange(rangeStart, rangeEnd);
    await listPage.searchByName(campaignInRange);
    await listPage.assertCampaignVisible(campaignInRange);
    logTestSuccess(`Campaign starting 3 days from now (inside the 0-7-day custom range) is correctly found`);

    // ── Outside the range — not found ─────────────────────────────────────
    await listPage.clickReset();
    await listPage.filterByCustomDateRange(rangeStart, rangeEnd);
    await listPage.searchByName(campaignOutOfRange);
    await listPage.assertNoResults();
    logTestSuccess(`Campaign starting 15 days from now (outside the 0-7-day custom range) is correctly excluded`);

    // ── Cleanup ────────────────────────────────────────────────────────────
    await listPage.clickReset();
    await listPage.filterByDate('All days');
    await listPage.searchByName(campaignInRange);
    await listPage.clickDeleteCampaign(campaignInRange);
    await listPage.assertDeleteDialogVisible();
    await listPage.confirmDelete();
    await listPage.assertCampaignRemoved(campaignInRange);
    await listPage.searchByName(campaignOutOfRange);
    await listPage.clickDeleteCampaign(campaignOutOfRange);
    await listPage.assertDeleteDialogVisible();
    await listPage.confirmDelete();
    await listPage.assertCampaignRemoved(campaignOutOfRange);
    logTestSuccess(`Cleanup — both campaigns deleted`);
  });
});
