import { test, expect, Browser, Page } from '@playwright/test';
import { SpacePage } from '../../pages/SpacePage';
import { ContentTestingCreatePage } from '../../pages/ContentTestingCreatePage';
import { ContentTestingListPage } from '../../pages/ContentTestingListPage';
import { config } from '../../config/config';

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

// ─── Date helper (native datetime-local: YYYY-MM-DDTHH:mm) ──────────────────────

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

/**
 * Current time in native datetime-local format. Confirmed with the user: the
 * start time must have already ELAPSED for Save & Activate to land on Live
 * (a future date lands on Scheduled instead). Filling "now" here satisfies
 * that naturally — by the time Save & Activate is actually clicked (after
 * selecting a variant, setting its traffic, dismissing notifications), this
 * timestamp is already a few seconds/minutes in the past.
 */
function nowDateStr(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  const hh   = String(d.getHours()).padStart(2, '0');
  const mi   = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

// ─── Cleanup helper (lifecycle suite) ──────────────────────────────────────────
//
// Idempotent + non-throwing by design: re-navigates and searches fresh rather
// than trusting a row is still focused from a possibly-failed test, tolerates
// the campaign already being gone (nothing to do), and wraps Stop and Delete
// in their own try/catch so one failing step doesn't block the other or abort
// the sweep of the remaining tracked campaigns. Any step that can't be
// recovered logs 'MANUAL CLEANUP NEEDED' loudly rather than throwing, so a
// single stuck campaign never fails the whole teardown.
async function cleanupCampaign(listPage: ContentTestingListPage, name: string): Promise<void> {
  try {
    await listPage.navigate();
    await listPage.searchByName(name);
    const status = await listPage.getListRowStatus();
    if (status === '—') {
      console.log(`  [Cleanup] "${name}" not found — already clean.`);
      return;
    }

    if (status === 'Live' || status === 'Paused' || status === 'Scheduled') {
      try {
        await listPage.clickStopCampaign();
        await listPage.assertStopDialog();
        await listPage.confirmStop();
        // The status cell can lag the toast by a moment (confirmed live) —
        // wait for it to actually settle before Delete, which requires Expired.
        await listPage.assertRowStatus(name, 'Expired');
        console.log(`  [Cleanup] "${name}" stopped (${status} → Expired) ✓`);
      } catch (e) {
        console.error(`MANUAL CLEANUP NEEDED: ${name} — stop failed: ${(e as Error).message.split('\n')[0]}`);
      }
    }

    try {
      await listPage.clickDeleteCampaign();
      await listPage.assertDeleteDialog();
      await listPage.confirmDelete();
      console.log(`  [Cleanup] "${name}" deleted ✓`);
    } catch (e) {
      console.error(`MANUAL CLEANUP NEEDED: ${name} — delete failed: ${(e as Error).message.split('\n')[0]}`);
    }
  } catch (e) {
    console.error(`MANUAL CLEANUP NEEDED: ${name} — cleanup navigation failed: ${(e as Error).message.split('\n')[0]}`);
  }
}

/**
 * Cleanup for the Edit-suite (TC-CT-070..075), any status. Confirmed live:
 * campaigns are NOT reliably reachable via the global /ab-testing list
 * page's search regardless of status — a pure Draft returned "No results.",
 * and a Scheduled campaign (Save & Activate'd, never touched Live) also
 * produced a false "not found" there and was left orphaned on master. So
 * the whole Edit suite cleans up via the entry-scoped Results table instead
 * of cleanupCampaign()/ContentTestingListPage above — the same surface the
 * edit tests themselves use, per the user's instruction to use the
 * entry-scoped surface over the global list page. Re-opens the fixture
 * entry fresh each time, matching cleanupCampaign()'s fail-independently,
 * non-throwing design.
 */
async function cleanupCtCampaignEntryScoped(createPage: ContentTestingCreatePage, name: string): Promise<void> {
  try {
    await createPage.openEntryByName(FIXTURE_ENTRY);
    await createPage.switchToContentTestingTab();
    await createPage.cleanupCampaignInResultsTable(name);
    console.log(`  [Cleanup] "${name}" swept (entry-scoped) ✓`);
  } catch (e) {
    console.error(`MANUAL CLEANUP NEEDED: ${name} — entry-scoped cleanup failed: ${(e as Error).message.split('\n')[0]}`);
  }
}

// ─── TC-CT-001 | Content Testing — happy path ──────────────────────────────────
//
// Scope: entry nav -> widget toggle -> General tab -> add one same-model
// variant -> Save as Draft -> verify Draft row. Validates all NEW ground
// (entry-scoped nav, cf-widget-renderer on an entry page, 3-tab wizard, native
// reference picker). List lifecycle + content-model-mismatch negative test are
// later suites.
//
// Both entries are existing, shared fixtures of content type "QA_v1 content"
// (confirmed live) — do not create new Contentful entries for this suite.

const FIXTURE_ENTRY = 'QA_V1_1_QA Env_2';   // shared source/host entry
const VARIANT_ENTRY = 'QA_V1_1_ MAR_1';     // same content model, different entry
const VARIANT_TRAFFIC = 50;                 // control auto-balances to 50

test.describe('Content Testing — campaign creation (happy path)', () => {
  let sharedPage: Page;
  let createPage: ContentTestingCreatePage;

  // Generated inside beforeAll (actual runtime), not at describe-body top level.
  // Playwright evaluates every describe body during file COLLECTION (before any
  // test runs), so a top-level `Date.now()` const here and in another describe's
  // top level can both be assigned within the same millisecond — confirmed live:
  // this collided with TC-CT-002's campaignName and caused a strict-mode
  // violation (two rows matched the same name).
  let campaignName: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    campaignName = `Test_CT_${Date.now()}`;
    const context = await browser.newContext({ storageState: 'auth/user.json' });
    sharedPage = await context.newPage();
    createPage = new ContentTestingCreatePage(sharedPage);

    // Space -> environment -> Content list.
    // CT is entry-scoped, so we deliberately do NOT openAppsMenu/assertAppLoaded
    // like GR does — the Xenia field renders on the entry itself.
    const spacePage = new SpacePage(sharedPage, context);
    await spacePage.navigateToEntries(config.spaceId);
    await spacePage.openSpaceSidepanel();
    await spacePage.selectSpace(config.xeniaSpaceId, config.xeniaSpaceName);
    await spacePage.selectEnvironment('master');

    // Precheck: fail loud and early if the fixture entry is missing, rather than
    // surfacing a confusing "element not found" mid-test.
    await sharedPage.getByRole('link', { name: 'Content', exact: true }).click();
    await sharedPage.getByRole('textbox', { name: 'Type to search for entries' }).fill(FIXTURE_ENTRY);
    await sharedPage.keyboard.press('Enter');
    await expect(
      sharedPage.getByRole('link', { name: FIXTURE_ENTRY, exact: true }).first(),
      `Fixture entry "${FIXTURE_ENTRY}" not found — run data setup before this suite.`,
    ).toBeVisible();
    console.log(`\n  [Setup] Fixture entry present : "${FIXTURE_ENTRY}" ✓`);
  });

  test.afterAll(async () => {
    await sharedPage.context().close();
  });

  test('TC-CT-001 | should create a Content Testing campaign and save it as Draft', async () => {
    // 1. Open the host entry and switch the Xenia field to Content Testing.
    await createPage.openEntryByName(FIXTURE_ENTRY);
    await createPage.switchToContentTestingTab();
    console.log(`\n  Entry opened + Content Testing toggle selected ✓`);

    // 2. Open the wizard and fill the General tab.
    await createPage.clickAddCampaign();
    await createPage.fillName(campaignName);
    await createPage.selectChannel('web');
    await createPage.fillStartDate(futureDateStr(7, 9));   // native datetime-local
    await createPage.clickNext();
    console.log(`  General tab filled : ${campaignName} ✓`);

    // 3. Variants tab: add one same-model variant and set its traffic.
    await createPage.clickChooseVariant();
    await createPage.selectVariantEntry(VARIANT_ENTRY);
    await createPage.setVariantTraffic(VARIANT_ENTRY, VARIANT_TRAFFIC);
    await createPage.assertControlTraffic(100 - VARIANT_TRAFFIC);
    console.log(`  Variant added : ${VARIANT_ENTRY} @ ${VARIANT_TRAFFIC}%, Control auto-balanced to ${100 - VARIANT_TRAFFIC}% ✓`);

    // 4. Save as Draft and verify.
    await createPage.dismissNotifications();
    await createPage.clickSaveDraft();
    await createPage.assertSaveSuccess(campaignName);
    console.log(`  Campaign saved as Draft + row visible : ${campaignName} ✓`);
  });
});

// ─── TC-CT-002 | Content Testing — lifecycle (Pause/Resume/Stop/Delete) ────────
//
// Draft rows have Pause/Stop disabled (confirmed live), so this describe
// creates its OWN Live campaign via Save & Activate rather than reusing
// TC-CT-001's Draft campaign. Every campaign name this
// suite creates is tracked in createdCampaigns; afterAll sweeps the array
// through cleanupCampaign() regardless of whether the test itself passed,
// failed, or crashed mid-flow — so a leftover Live campaign never survives a
// run on master.

test.describe('Content Testing — lifecycle (Pause/Resume/Stop/Delete)', () => {
  let sharedPage: Page;
  let spacePage: SpacePage;
  let createPage: ContentTestingCreatePage;
  let listPage: ContentTestingListPage;
  const createdCampaigns: string[] = [];

  // See TC-CT-001's describe for why this is generated inside beforeAll rather
  // than at describe-body top level (collection-time Date.now() collision risk).
  let campaignName: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    campaignName = `Test_CT_${Date.now()}`;
    const context = await browser.newContext({ storageState: 'auth/user.json' });
    sharedPage = await context.newPage();
    createPage = new ContentTestingCreatePage(sharedPage);
    listPage = new ContentTestingListPage(sharedPage);

    spacePage = new SpacePage(sharedPage, context);
    await spacePage.navigateToEntries(config.spaceId);
    await spacePage.openSpaceSidepanel();
    await spacePage.selectSpace(config.xeniaSpaceId, config.xeniaSpaceName);
    await spacePage.selectEnvironment('master');

    await sharedPage.getByRole('link', { name: 'Content', exact: true }).click();
    await sharedPage.getByRole('textbox', { name: 'Type to search for entries' }).fill(FIXTURE_ENTRY);
    await sharedPage.keyboard.press('Enter');
    await expect(
      sharedPage.getByRole('link', { name: FIXTURE_ENTRY, exact: true }).first(),
      `Fixture entry "${FIXTURE_ENTRY}" not found — run data setup before this suite.`,
    ).toBeVisible();

    // Create the campaign this suite exercises. Track the name BEFORE any
    // assertion runs so a crash mid-creation still gets swept by afterAll.
    createdCampaigns.push(campaignName);

    await createPage.openEntryByName(FIXTURE_ENTRY);
    await createPage.switchToContentTestingTab();
    await createPage.clickAddCampaign();
    await createPage.fillName(campaignName);
    await createPage.selectChannel('web');
    await createPage.fillStartDate(nowDateStr());
    await createPage.clickNext();
    await createPage.clickChooseVariant();
    await createPage.selectVariantEntry(VARIANT_ENTRY);
    await createPage.setVariantTraffic(VARIANT_ENTRY, VARIANT_TRAFFIC);
    await createPage.dismissNotifications();
    await createPage.clickSaveActivate();
    await createPage.assertSaveSuccess(campaignName, 'Live');
    console.log(`\n  [Setup] Live campaign created : "${campaignName}" ✓`);

    // Creation happens on the ENTRY page, whose cf-widget-renderer iframe is the
    // entry-scoped field widget (no "Content testing" nav link in it). List-page
    // lifecycle actions need the full Xenia app instead — switch to it now so
    // listPage.navigate() has the right page to work with.
    await spacePage.openAppsMenu(config.xeniaAppName);
    await spacePage.assertAppLoaded();
  });

  test.afterAll(async () => {
    for (const name of createdCampaigns) {
      await cleanupCampaign(listPage, name);
    }
    await sharedPage.context().close();
  });

  test('TC-CT-002 | should Pause, Resume, Stop, then Delete a Live campaign', async () => {
    await listPage.navigate();
    await listPage.searchByName(campaignName);
    await listPage.assertCampaignVisible(campaignName);
    await listPage.assertRowStatus(campaignName, 'Live');
    console.log(`\n  Campaign found on list page, status Live ✓`);

    // Pause
    await listPage.clickPauseCampaign();
    await listPage.assertPauseDialog();
    await listPage.confirmPause();
    await listPage.assertRowStatus(campaignName, 'Paused');
    console.log(`  Paused ✓`);

    // Resume
    await listPage.clickResumeCampaign();
    await listPage.assertResumeDialog();
    await listPage.confirmResume();
    await listPage.assertRowStatus(campaignName, 'Live');
    console.log(`  Resumed → Live ✓`);

    // Stop
    await listPage.clickStopCampaign();
    await listPage.assertStopDialog();
    await listPage.confirmStop();
    await listPage.assertRowStatus(campaignName, 'Expired');
    console.log(`  Stopped → Expired ✓`);

    // Delete
    await listPage.clickDeleteCampaign();
    await listPage.assertDeleteDialog();
    await listPage.confirmDelete();
    await listPage.searchByName(campaignName);
    await listPage.assertNoResults();
    console.log(`  Deleted — no longer in results ✓`);
  });
});

// ─── TC-CT-020..025 | Content Testing — General tab validation ────────────────
//
// Pure UI validation checks — no save, no campaign ever created, so no cleanup
// is needed. Captured live first (see project memory / prior exploration):
// whitespace-only name is accepted (not trimmed/validated) and malformed
// start-date text is rejected by the native datetime-local input itself
// (coerces to ""), so neither has its own test — both collapse into the
// empty-field cases already covered. End date has no "in the past" validation
// of its own (only checked against start date), so that case is dropped too,
// per the instruction not to invent an assertion where none exists.

test.describe('Content Testing — General tab validation', () => {
  let sharedPage: Page;
  let createPage: ContentTestingCreatePage;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const context = await browser.newContext({ storageState: 'auth/user.json' });
    sharedPage = await context.newPage();
    createPage = new ContentTestingCreatePage(sharedPage);

    const spacePage = new SpacePage(sharedPage, context);
    await spacePage.navigateToEntries(config.spaceId);
    await spacePage.openSpaceSidepanel();
    await spacePage.selectSpace(config.xeniaSpaceId, config.xeniaSpaceName);
    await spacePage.selectEnvironment('master');

    await sharedPage.getByRole('link', { name: 'Content', exact: true }).click();
    await sharedPage.getByRole('textbox', { name: 'Type to search for entries' }).fill(FIXTURE_ENTRY);
    await sharedPage.keyboard.press('Enter');
    await expect(
      sharedPage.getByRole('link', { name: FIXTURE_ENTRY, exact: true }).first(),
      `Fixture entry "${FIXTURE_ENTRY}" not found — run data setup before this suite.`,
    ).toBeVisible();

    await createPage.openEntryByName(FIXTURE_ENTRY);
    await createPage.switchToContentTestingTab();
  });

  test.afterAll(async () => {
    await sharedPage.context().close();
  });

  test.beforeEach(async () => {
    await createPage.clickAddCampaign();
  });

  test.afterEach(async () => {
    await createPage.closeWizard();
  });

  test('TC-CT-020 | should show error for empty campaign name', async () => {
    await createPage.clickNext();
    await expect(createPage.nameError()).toBeVisible();
  });

  test('TC-CT-021 | should show error for empty start date', async () => {
    await createPage.clickNext();
    await expect(createPage.startDateError()).toBeVisible();
    // Confirmed live: the page-level toast only fires on a SECOND Next click
    // while the field is still empty, not the first.
    await createPage.clickNext();
    await expect(createPage.startDateInvalidToast()).toBeVisible();
    await createPage.dismissNotifications();
  });

  test('TC-CT-022 | should show error for a past start date', async () => {
    await createPage.fillName('CT_Validation_022');
    await createPage.selectChannel('web');
    await createPage.fillStartDate(futureDateStr(-1, 9)); // yesterday
    await createPage.clickNext();
    await expect(createPage.startDatePastError()).toBeVisible();
  });

  test('TC-CT-023 | should show error when end date is before start date', async () => {
    await createPage.fillName('CT_Validation_023');
    await createPage.selectChannel('web');
    await createPage.fillStartDate(futureDateStr(6, 9));
    await createPage.toggleEndDate();
    await createPage.fillEndDate(futureDateStr(5, 9)); // a day before start
    await createPage.clickNext();
    await expect(createPage.endDateBeforeStartError()).toBeVisible();
  });

  test('TC-CT-024 | should show error when end date equals start date', async () => {
    await createPage.fillName('CT_Validation_024');
    await createPage.selectChannel('web');
    const start = futureDateStr(6, 9);
    await createPage.fillStartDate(start);
    await createPage.toggleEndDate();
    await createPage.fillEndDate(start); // strict >, equal is rejected same as before-start
    await createPage.clickNext();
    await expect(createPage.endDateBeforeStartError()).toBeVisible();
  });

  test('TC-CT-025 | should show all validation messages together for multiple empty fields', async () => {
    await createPage.clickNext();
    await expect(createPage.nameError()).toBeVisible();
    await expect(createPage.startDateError()).toBeVisible();
  });
});

// ─── TC-CT-070..075 | Content Testing — Edit + verification ───────────────────
//
// EDIT SURFACE: the ENTRY-SCOPED Results table's "Edit Campaign" only — NOT the
// global /ab-testing list page's Edit (that opens an unrelated Contentful
// Editor overlay on the source entry with Personalization pre-selected).
// Confirmed live field-lock rules by status live in ContentTestingCreatePage's
// "Wizard — Edit" section doc comment.
//
// Each describe below creates its OWN campaign in beforeAll (own unique
// Test_CT_<ts> name, matching TC-CT-002's per-describe-own-fixture pattern —
// no shared setup helper, per established codebase convention) and sweeps it
// in afterAll via the same failure-proof cleanupCampaign() used everywhere
// else in this file. Edit tests run against the ENTRY page (no "Content
// testing" nav link there), so afterAll switches to the app-level page via
// spacePage.openAppsMenu()/assertAppLoaded() before the cleanup sweep needs
// listPage.navigate() — mirroring TC-CT-002's navigation, just deferred to
// teardown instead of setup since the test bodies themselves need to stay on
// the entry page to reach the entry-scoped Edit button.
//
// TC-CT-073 and TC-CT-075 land the fixture campaign on Live — per explicit
// instruction, their afterAll MUST Stop -> Delete, exactly like TC-CT-002's
// safety pattern, so master never keeps an orphaned Live campaign.

test.describe('Content Testing — Edit (Draft — field states + pre-population)', () => {
  let sharedPage: Page;
  let spacePage: SpacePage;
  let createPage: ContentTestingCreatePage;
  const createdCampaigns: string[] = [];
  let campaignName: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    campaignName = `Test_CT_${Date.now()}`;
    const context = await browser.newContext({ storageState: 'auth/user.json' });
    sharedPage = await context.newPage();
    createPage = new ContentTestingCreatePage(sharedPage);

    spacePage = new SpacePage(sharedPage, context);
    await spacePage.navigateToEntries(config.spaceId);
    await spacePage.openSpaceSidepanel();
    await spacePage.selectSpace(config.xeniaSpaceId, config.xeniaSpaceName);
    await spacePage.selectEnvironment('master');

    await sharedPage.getByRole('link', { name: 'Content', exact: true }).click();
    await sharedPage.getByRole('textbox', { name: 'Type to search for entries' }).fill(FIXTURE_ENTRY);
    await sharedPage.keyboard.press('Enter');
    await expect(
      sharedPage.getByRole('link', { name: FIXTURE_ENTRY, exact: true }).first(),
      `Fixture entry "${FIXTURE_ENTRY}" not found — run data setup before this suite.`,
    ).toBeVisible();

    createdCampaigns.push(campaignName);

    await createPage.openEntryByName(FIXTURE_ENTRY);
    await createPage.switchToContentTestingTab();
    await createPage.clickAddCampaign();
    await createPage.fillName(campaignName);
    await createPage.selectChannel('web');
    await createPage.fillStartDate(futureDateStr(8, 9));
    await createPage.clickNext();
    await createPage.clickChooseVariant();
    await createPage.selectVariantEntry(VARIANT_ENTRY);
    await createPage.setVariantTraffic(VARIANT_ENTRY, VARIANT_TRAFFIC);
    await createPage.dismissNotifications();
    await createPage.clickSaveDraft();
    await createPage.assertSaveSuccess(campaignName, 'Draft');
    console.log(`\n  [Setup] Draft campaign created : "${campaignName}" ✓`);
  });

  test.afterAll(async () => {
    // This campaign never leaves Draft, so it's not reachable via the global
    // list page (confirmed live) — clean up via the entry-scoped table.
    for (const name of createdCampaigns) {
      await cleanupCtCampaignEntryScoped(createPage, name);
    }
    await sharedPage.context().close();
  });

  test('TC-CT-070 | should show all fields editable and pre-populated when editing a Draft campaign', async () => {
    await createPage.clickEditCampaignInResultsTable(campaignName);

    // General tab — editable state + save controls (Draft-only Save-as-Draft;
    // Update Campaign does not exist on a Draft edit at all).
    await expect(createPage.startDateInput()).toBeEnabled();
    await expect(createPage.channelsSelect()).not.toHaveClass(/select--is-disabled/);
    await expect(createPage.saveDraftButton()).toBeVisible();
    await expect(createPage.updateCampaignButton()).toHaveCount(0);

    // Pre-population (side effect: advances to Variants tab).
    const fields = await createPage.getWizardFields();
    expect(fields.name).toBe(campaignName);
    expect(fields.channels.join(',')).toContain('web');
    expect(fields.startDate).toBe(futureDateStr(8, 9));
    expect(fields.endDate).toBeNull();
    expect(fields.variantTraffic[VARIANT_ENTRY]).toBe(String(VARIANT_TRAFFIC));

    // Variants tab — save controls + full add/manage-variant controls for Draft.
    await expect(createPage.saveActivateButton()).toBeVisible();
    await expect(createPage.saveDraftButton()).toBeVisible();
    await expect(createPage.chooseVariantButton()).toBeVisible();
    await expect(createPage.variantActionsButton()).toBeVisible();

    await createPage.closeWizard();
    console.log(`  Draft edit field states + pre-population confirmed : ${campaignName} ✓`);
  });
});

test.describe('Content Testing — Edit (Draft -> Save as Draft -> persisted)', () => {
  let sharedPage: Page;
  let spacePage: SpacePage;
  let createPage: ContentTestingCreatePage;
  const createdCampaigns: string[] = [];
  let campaignName: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    campaignName = `Test_CT_${Date.now()}`;
    const context = await browser.newContext({ storageState: 'auth/user.json' });
    sharedPage = await context.newPage();
    createPage = new ContentTestingCreatePage(sharedPage);

    spacePage = new SpacePage(sharedPage, context);
    await spacePage.navigateToEntries(config.spaceId);
    await spacePage.openSpaceSidepanel();
    await spacePage.selectSpace(config.xeniaSpaceId, config.xeniaSpaceName);
    await spacePage.selectEnvironment('master');

    await sharedPage.getByRole('link', { name: 'Content', exact: true }).click();
    await sharedPage.getByRole('textbox', { name: 'Type to search for entries' }).fill(FIXTURE_ENTRY);
    await sharedPage.keyboard.press('Enter');
    await expect(
      sharedPage.getByRole('link', { name: FIXTURE_ENTRY, exact: true }).first(),
      `Fixture entry "${FIXTURE_ENTRY}" not found — run data setup before this suite.`,
    ).toBeVisible();

    createdCampaigns.push(campaignName);

    await createPage.openEntryByName(FIXTURE_ENTRY);
    await createPage.switchToContentTestingTab();
    await createPage.clickAddCampaign();
    await createPage.fillName(campaignName);
    await createPage.selectChannel('web');
    await createPage.fillStartDate(futureDateStr(8, 9));
    await createPage.clickNext();
    await createPage.clickChooseVariant();
    await createPage.selectVariantEntry(VARIANT_ENTRY);
    await createPage.setVariantTraffic(VARIANT_ENTRY, VARIANT_TRAFFIC);
    await createPage.dismissNotifications();
    await createPage.clickSaveDraft();
    await createPage.assertSaveSuccess(campaignName, 'Draft');
    console.log(`\n  [Setup] Draft campaign created : "${campaignName}" ✓`);
  });

  test.afterAll(async () => {
    // This campaign never leaves Draft, so it's not reachable via the global
    // list page (confirmed live) — clean up via the entry-scoped table.
    for (const name of createdCampaigns) {
      await cleanupCtCampaignEntryScoped(createPage, name);
    }
    await sharedPage.context().close();
  });

  test('TC-CT-071 | should persist name/channel/traffic changes after editing a Draft and Save as Draft', async () => {
    const updatedName = `${campaignName}_edited`;

    await createPage.clickEditCampaignInResultsTable(campaignName);
    await createPage.fillName(updatedName);
    // 'mobile_v1' is the confirmed second fixture channel used by GR tests in
    // this same Xenia app/space; added on top of 'web' rather than replacing
    // it, so persistence of a multi-select change can be verified.
    await createPage.selectChannel('mobile_v1');
    await createPage.clickNext();
    await createPage.setVariantTraffic(VARIANT_ENTRY, 40);
    await createPage.assertControlTraffic(60);
    await createPage.dismissNotifications();
    await createPage.clickSaveDraft();
    await createPage.assertSaveSuccess(updatedName, 'Draft');
    console.log(`  Draft edited + saved as Draft : ${campaignName} -> ${updatedName} ✓`);

    // Track under the new name so afterAll's cleanup sweep finds it.
    createdCampaigns[0] = updatedName;

    // Reopen and verify persistence.
    await createPage.clickEditCampaignInResultsTable(updatedName);
    const fields = await createPage.getWizardFields();
    expect(fields.name).toBe(updatedName);
    expect(fields.channels.join(',')).toContain('web');
    expect(fields.channels.join(',')).toContain('mobile_v1');
    expect(fields.variantTraffic[VARIANT_ENTRY]).toBe('40');
    await createPage.closeWizard();
    console.log(`  Persistence confirmed after reopen : ${updatedName} ✓`);
  });
});

test.describe('Content Testing — Edit (Scheduled — editable start date, Update Campaign)', () => {
  let sharedPage: Page;
  let spacePage: SpacePage;
  let createPage: ContentTestingCreatePage;
  const createdCampaigns: string[] = [];
  let campaignName: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    campaignName = `Test_CT_${Date.now()}`;
    const context = await browser.newContext({ storageState: 'auth/user.json' });
    sharedPage = await context.newPage();
    createPage = new ContentTestingCreatePage(sharedPage);

    spacePage = new SpacePage(sharedPage, context);
    await spacePage.navigateToEntries(config.spaceId);
    await spacePage.openSpaceSidepanel();
    await spacePage.selectSpace(config.xeniaSpaceId, config.xeniaSpaceName);
    await spacePage.selectEnvironment('master');

    await sharedPage.getByRole('link', { name: 'Content', exact: true }).click();
    await sharedPage.getByRole('textbox', { name: 'Type to search for entries' }).fill(FIXTURE_ENTRY);
    await sharedPage.keyboard.press('Enter');
    await expect(
      sharedPage.getByRole('link', { name: FIXTURE_ENTRY, exact: true }).first(),
      `Fixture entry "${FIXTURE_ENTRY}" not found — run data setup before this suite.`,
    ).toBeVisible();

    createdCampaigns.push(campaignName);

    // Fixture state for this test is SCHEDULED: create then Save & Activate
    // with a future start date (confirmed rule: a future start lands on
    // Scheduled, not Live).
    await createPage.openEntryByName(FIXTURE_ENTRY);
    await createPage.switchToContentTestingTab();
    await createPage.clickAddCampaign();
    await createPage.fillName(campaignName);
    await createPage.selectChannel('web');
    await createPage.fillStartDate(futureDateStr(8, 9));
    await createPage.clickNext();
    await createPage.clickChooseVariant();
    await createPage.selectVariantEntry(VARIANT_ENTRY);
    await createPage.setVariantTraffic(VARIANT_ENTRY, VARIANT_TRAFFIC);
    await createPage.dismissNotifications();
    await createPage.clickSaveActivate();
    await createPage.assertSaveSuccess(campaignName, 'Scheduled');
    console.log(`\n  [Setup] Scheduled campaign created : "${campaignName}" ✓`);
  });

  test.afterAll(async () => {
    // Not reliably reachable via the global list page (confirmed live) —
    // clean up via the entry-scoped table instead.
    for (const name of createdCampaigns) {
      await cleanupCtCampaignEntryScoped(createPage, name);
    }
    await sharedPage.context().close();
  });

  test('TC-CT-074 | should keep start date editable and use Update Campaign when editing a Scheduled campaign', async () => {
    const updatedName = `${campaignName}_edited`;

    await createPage.clickEditCampaignInResultsTable(campaignName);

    // General tab — start date stays editable (unlike Live); no Save-as-Draft
    // option on a Scheduled edit.
    await expect(createPage.startDateInput()).toBeEnabled();
    await expect(createPage.saveDraftButton()).toHaveCount(0);

    await createPage.fillName(updatedName);
    await createPage.clickNext();

    // Variants tab — only "Update Campaign" (no Save-as-Draft/Activate split).
    await expect(createPage.updateCampaignButton()).toBeVisible();
    await expect(createPage.saveActivateButton()).toHaveCount(0);

    await createPage.setVariantTraffic(VARIANT_ENTRY, 30);
    await createPage.dismissNotifications();
    await createPage.clickUpdateCampaign();
    await createPage.assertSaveSuccess(updatedName, 'Scheduled');
    console.log(`  Scheduled campaign edited via Update Campaign : ${campaignName} -> ${updatedName} ✓`);

    createdCampaigns[0] = updatedName;

    // Reopen and verify persistence — status still Scheduled.
    await createPage.clickEditCampaignInResultsTable(updatedName);
    const fields = await createPage.getWizardFields();
    expect(fields.name).toBe(updatedName);
    expect(fields.variantTraffic[VARIANT_ENTRY]).toBe('30');
    await createPage.closeWizard();
    console.log(`  Persistence confirmed after reopen, status still Scheduled : ${updatedName} ✓`);
  });
});

test.describe('Content Testing — Edit (Draft -> Save & Activate, future start -> Scheduled)', () => {
  let sharedPage: Page;
  let spacePage: SpacePage;
  let createPage: ContentTestingCreatePage;
  const createdCampaigns: string[] = [];
  let campaignName: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    campaignName = `Test_CT_${Date.now()}`;
    const context = await browser.newContext({ storageState: 'auth/user.json' });
    sharedPage = await context.newPage();
    createPage = new ContentTestingCreatePage(sharedPage);

    spacePage = new SpacePage(sharedPage, context);
    await spacePage.navigateToEntries(config.spaceId);
    await spacePage.openSpaceSidepanel();
    await spacePage.selectSpace(config.xeniaSpaceId, config.xeniaSpaceName);
    await spacePage.selectEnvironment('master');

    await sharedPage.getByRole('link', { name: 'Content', exact: true }).click();
    await sharedPage.getByRole('textbox', { name: 'Type to search for entries' }).fill(FIXTURE_ENTRY);
    await sharedPage.keyboard.press('Enter');
    await expect(
      sharedPage.getByRole('link', { name: FIXTURE_ENTRY, exact: true }).first(),
      `Fixture entry "${FIXTURE_ENTRY}" not found — run data setup before this suite.`,
    ).toBeVisible();

    createdCampaigns.push(campaignName);

    await createPage.openEntryByName(FIXTURE_ENTRY);
    await createPage.switchToContentTestingTab();
    await createPage.clickAddCampaign();
    await createPage.fillName(campaignName);
    await createPage.selectChannel('web');
    await createPage.fillStartDate(futureDateStr(8, 9));
    await createPage.clickNext();
    await createPage.clickChooseVariant();
    await createPage.selectVariantEntry(VARIANT_ENTRY);
    await createPage.setVariantTraffic(VARIANT_ENTRY, VARIANT_TRAFFIC);
    await createPage.dismissNotifications();
    await createPage.clickSaveDraft();
    await createPage.assertSaveSuccess(campaignName, 'Draft');
    console.log(`\n  [Setup] Draft campaign created : "${campaignName}" ✓`);
  });

  test.afterAll(async () => {
    for (const name of createdCampaigns) {
      await cleanupCtCampaignEntryScoped(createPage, name);
    }
    await sharedPage.context().close();
  });

  test('TC-CT-072 | should transition a Draft to Scheduled when editing and Save & Activate with a future start date', async () => {
    await createPage.clickEditCampaignInResultsTable(campaignName);
    await createPage.clickNext();
    await createPage.dismissNotifications();
    await createPage.clickSaveActivate();
    await createPage.assertSaveSuccess(campaignName, 'Scheduled');
    console.log(`  Draft -> Save & Activate (future start) -> Scheduled : ${campaignName} ✓`);

    // Reopen and verify persistence.
    await createPage.clickEditCampaignInResultsTable(campaignName);
    const fields = await createPage.getWizardFields();
    expect(fields.name).toBe(campaignName);
    expect(fields.startDate).toBe(futureDateStr(8, 9));
    await createPage.closeWizard();
    console.log(`  Persistence confirmed after reopen, status Scheduled : ${campaignName} ✓`);
  });
});

test.describe('Content Testing — Edit (Draft -> change start date -> Save & Activate -> Scheduled)', () => {
  let sharedPage: Page;
  let spacePage: SpacePage;
  let createPage: ContentTestingCreatePage;
  const createdCampaigns: string[] = [];
  let campaignName: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    campaignName = `Test_CT_${Date.now()}`;
    const context = await browser.newContext({ storageState: 'auth/user.json' });
    sharedPage = await context.newPage();
    createPage = new ContentTestingCreatePage(sharedPage);

    spacePage = new SpacePage(sharedPage, context);
    await spacePage.navigateToEntries(config.spaceId);
    await spacePage.openSpaceSidepanel();
    await spacePage.selectSpace(config.xeniaSpaceId, config.xeniaSpaceName);
    await spacePage.selectEnvironment('master');

    await sharedPage.getByRole('link', { name: 'Content', exact: true }).click();
    await sharedPage.getByRole('textbox', { name: 'Type to search for entries' }).fill(FIXTURE_ENTRY);
    await sharedPage.keyboard.press('Enter');
    await expect(
      sharedPage.getByRole('link', { name: FIXTURE_ENTRY, exact: true }).first(),
      `Fixture entry "${FIXTURE_ENTRY}" not found — run data setup before this suite.`,
    ).toBeVisible();

    createdCampaigns.push(campaignName);

    await createPage.openEntryByName(FIXTURE_ENTRY);
    await createPage.switchToContentTestingTab();
    await createPage.clickAddCampaign();
    await createPage.fillName(campaignName);
    await createPage.selectChannel('web');
    await createPage.fillStartDate(futureDateStr(8, 9));
    await createPage.clickNext();
    await createPage.clickChooseVariant();
    await createPage.selectVariantEntry(VARIANT_ENTRY);
    await createPage.setVariantTraffic(VARIANT_ENTRY, VARIANT_TRAFFIC);
    await createPage.dismissNotifications();
    await createPage.clickSaveDraft();
    await createPage.assertSaveSuccess(campaignName, 'Draft');
    console.log(`\n  [Setup] Draft campaign created : "${campaignName}" ✓`);
  });

  test.afterAll(async () => {
    for (const name of createdCampaigns) {
      await cleanupCtCampaignEntryScoped(createPage, name);
    }
    await sharedPage.context().close();
  });

  // Confirmed with the user: a Draft going directly to Live via edit isn't a
  // real scenario — any date that passes the "start date >= now" Next
  // validation is never actually in the past yet, so it can only land
  // Scheduled (Live is reached by the natural passage of time once a
  // Scheduled campaign's start time arrives, not by picking an already-past
  // date during edit). This test instead validates the start-date field is
  // genuinely editable on a Draft: it changes it to a DIFFERENT future date
  // (distinct from TC-CT-072, which re-activates without changing the date)
  // and verifies the new date is what persists after Save & Activate.
  test('TC-CT-073 | should activate a Draft as Scheduled with an edited (different) future start date', async () => {
    const newStartDate = futureDateStr(10, 14);

    await createPage.clickEditCampaignInResultsTable(campaignName);
    await createPage.fillStartDate(newStartDate);
    await createPage.clickNext();
    await createPage.dismissNotifications();
    await createPage.clickSaveActivate();
    await createPage.assertSaveSuccess(campaignName, 'Scheduled');
    console.log(`  Draft -> edited start date -> Save & Activate -> Scheduled : ${campaignName} ✓`);

    // Reopen and verify the NEW start date persisted (not the original).
    await createPage.clickEditCampaignInResultsTable(campaignName);
    const fields = await createPage.getWizardFields();
    expect(fields.name).toBe(campaignName);
    expect(fields.startDate).toBe(newStartDate);
    await createPage.closeWizard();
    console.log(`  Persistence confirmed after reopen, status Scheduled, start date updated : ${campaignName} ✓`);
  });
});

test.describe('Content Testing — Edit (Live — locked fields, hidden variant controls)', () => {
  // beforeAll waits out the Live start-date grace window (up to ~90s, see
  // the poll below) on top of normal setup (create + activate, which has
  // shown real cold-start variance in this env — from ~20s up past 200s in
  // one observed run) and the test body itself — all share one timeout
  // budget against the default 120s, so give it real headroom.
  test.describe.configure({ timeout: 420_000 });

  let sharedPage: Page;
  let spacePage: SpacePage;
  let createPage: ContentTestingCreatePage;
  const createdCampaigns: string[] = [];
  let campaignName: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    campaignName = `Test_CT_${Date.now()}`;
    const context = await browser.newContext({ storageState: 'auth/user.json' });
    sharedPage = await context.newPage();
    createPage = new ContentTestingCreatePage(sharedPage);

    spacePage = new SpacePage(sharedPage, context);
    await spacePage.navigateToEntries(config.spaceId);
    await spacePage.openSpaceSidepanel();
    await spacePage.selectSpace(config.xeniaSpaceId, config.xeniaSpaceName);
    await spacePage.selectEnvironment('master');

    await sharedPage.getByRole('link', { name: 'Content', exact: true }).click();
    await sharedPage.getByRole('textbox', { name: 'Type to search for entries' }).fill(FIXTURE_ENTRY);
    await sharedPage.keyboard.press('Enter');
    await expect(
      sharedPage.getByRole('link', { name: FIXTURE_ENTRY, exact: true }).first(),
      `Fixture entry "${FIXTURE_ENTRY}" not found — run data setup before this suite.`,
    ).toBeVisible();

    createdCampaigns.push(campaignName);

    // Fixture state for this test is LIVE: create then Save & Activate.
    // nowDateStr() (not a genuinely past date) — confirmed live that a
    // genuinely past date trips the same "start date must be >= now" Next
    // validation as on create, blocking the wizard entirely. nowDateStr()
    // truncates to :00 seconds, so it's already implicitly a few seconds
    // "elapsed" by save time without ever failing that validation.
    await createPage.openEntryByName(FIXTURE_ENTRY);
    await createPage.switchToContentTestingTab();
    await createPage.clickAddCampaign();
    await createPage.fillName(campaignName);
    await createPage.selectChannel('web');
    const fillMinuteEpoch = Math.floor(Date.now() / 60000);
    await createPage.fillStartDate(nowDateStr());
    await createPage.clickNext();
    await createPage.clickChooseVariant();
    await createPage.selectVariantEntry(VARIANT_ENTRY);
    await createPage.setVariantTraffic(VARIANT_ENTRY, VARIANT_TRAFFIC);
    await createPage.dismissNotifications();
    await createPage.clickSaveActivate();
    await createPage.assertSaveSuccess(campaignName, 'Live');
    console.log(`\n  [Setup] Live campaign created : "${campaignName}" ✓`);

    // Confirmed with the user: a Live campaign's start date stays editable
    // for a full minute PAST the actual start time (e.g. start 9:14 PM ->
    // still editable until 9:15 PM) before the lock kicks in. The backend
    // stores the submitted "HH:MM:00" value (not the real fill instant), so
    // that grace window ends exactly at the fillMinuteEpoch+1 minute
    // boundary — wait for that boundary plus a few seconds' safety margin
    // (not a full extra minute) before this suite's lock-assertion test runs.
    const graceWindowEndMs = (fillMinuteEpoch + 1) * 60000 + 5000;
    await expect.poll(
      () => Date.now() >= graceWindowEndMs,
      { timeout: 90000, intervals: [3000] },
    ).toBe(true);
  });

  // SAFETY: this test edits a Live campaign — afterAll MUST Stop -> Delete,
  // exactly like TC-CT-002, so master never keeps an orphaned Live campaign.
  // Not reliably reachable via the global list page (confirmed live) — clean
  // up via the entry-scoped table instead.
  test.afterAll(async () => {
    for (const name of createdCampaigns) {
      await cleanupCtCampaignEntryScoped(createPage, name);
    }
    await sharedPage.context().close();
  });

  test('TC-CT-075 | should lock start date and channels, hide variant-management controls, but allow editing name/traffic when editing a Live campaign', async () => {
    const updatedName = `${campaignName}_edited`;

    await createPage.clickEditCampaignInResultsTable(campaignName);

    // General tab — locked fields.
    await createPage.assertStartDateDisabled();
    await createPage.assertStartDateLockMessage();
    await createPage.assertChannelsDisabled();

    // Name remains editable even on Live.
    await createPage.fillName(updatedName);
    await createPage.clickNext();

    // Variants tab — add/manage-variant controls entirely absent; traffic
    // remains editable; save is Update Campaign only.
    await createPage.assertAddVariantControlsAbsent();
    await createPage.assertVariantActionsMenuAbsent();
    await expect(createPage.updateCampaignButton()).toBeVisible();

    await createPage.setVariantTraffic(VARIANT_ENTRY, 35);
    await createPage.dismissNotifications();
    await createPage.clickUpdateCampaign();
    await createPage.assertSaveSuccess(updatedName, 'Live');
    console.log(`  Live campaign edited (locked fields confirmed) via Update Campaign : ${campaignName} -> ${updatedName} ✓`);

    createdCampaigns[0] = updatedName;

    // Reopen and verify persistence — status still Live.
    await createPage.clickEditCampaignInResultsTable(updatedName);
    const fields = await createPage.getWizardFields();
    expect(fields.name).toBe(updatedName);
    expect(fields.variantTraffic[VARIANT_ENTRY]).toBe('35');
    await createPage.closeWizard();
    console.log(`  Persistence confirmed after reopen, status still Live : ${updatedName} ✓`);
  });
});
