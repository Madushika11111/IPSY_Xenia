import { test, expect, Browser, Page } from '@playwright/test';
import { SpacePage } from '../../pages/SpacePage';
import { MarketingListPage } from '../../pages/MarketingListPage';
import { MarketingCreatePage } from '../../pages/MarketingCreatePage';
import { config } from '../../config/config';

// ─── Bug-fix verification: V1 server (master / Xenia-Version1_QAV1) ─────────
// Marketing is an APP-LEVEL campaign type (same tier as Gradual Rollout /
// Eligibility), reached via the "Marketing" nav link inside the Xenia widget
// — NOT entry-scoped like Content Personalization / Content Testing.
//
// Confirmed live this session: Marketing's list page shares the same
// underlying component as Gradual Rollout's — the Pause/Resume/Stop/Delete
// confirmation-dialog pattern ("<Action> Campaign?" heading + Cancel/<Action>
// buttons) is identical. See pages/MarketingListPage.ts and
// pages/MarketingCreatePage.ts for the full set of confirmed field/locking
// behaviors (CID and start date lock once Live; Region becomes read-only
// once the campaign exists; a fresh create additionally requires picking at
// least one Program before it can advance past Step 1).

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

test.describe('Marketing — Bug-fix Verification (V1 server / master / Xenia-Version1_QAV1)', () => {
  let sharedPage: Page;
  let listPage: MarketingListPage;
  let createPage: MarketingCreatePage;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const context = await browser.newContext({ storageState: 'auth/user.json' });
    sharedPage = await context.newPage();
    listPage   = new MarketingListPage(sharedPage);
    createPage = new MarketingCreatePage(sharedPage);

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

  // ── TC-BF-MK-001 ────────────────────────────────────────────────────────
  // POSITIVE: clicking the "Marketing" nav link opens the Marketing campaigns
  // list page — verified via the page's own title/heading.

  test('TC-BF-MK-001 | Clicking the Marketing nav link opens the Marketing campaigns list page, verified by its page title', async () => {
    await listPage.navigate();

    const frame = sharedPage.frameLocator('[data-test-id="cf-widget-renderer"]');
    const pageTitle = frame.getByRole('heading', { name: 'Marketing campaigns' });

    await expect(pageTitle, 'Marketing campaigns page title must be visible after clicking the Marketing nav link').toBeVisible({ timeout: 10000 });
    const titleText = (await pageTitle.textContent())?.trim();
    expect(titleText, 'page title text must read exactly "Marketing campaigns"').toBe('Marketing campaigns');

    console.log(`\n  Marketing nav link clicked — page title : "${titleText}" ✓`);
  });

  // ── TC-BF-MK-002 ────────────────────────────────────────────────────────
  // POSITIVE: clicking the create-campaign button opens the campaign creation
  // wizard — verified via its own "Create new campaign" title.
  //
  // Note: confirmed live, the Marketing list page's create-campaign control is
  // the "Campaigns" button next to the page heading (same convention as
  // Gradual Rollout's create button) — there is no separate "+ Campaign"
  // labeled button on this page; it is the only control that opens this wizard.

  test('TC-BF-MK-002 | Clicking the create-campaign button opens the campaign creation form, verified by the "Create new campaign" title', async () => {
    await listPage.clickCreateButton();

    const title = createPage.step1Heading();
    await expect(title, '"Create new campaign" title must be visible after clicking the create-campaign button').toBeVisible({ timeout: 10000 });
    const titleText = (await title.textContent())?.trim();
    expect(titleText, 'wizard title text must read exactly "Create new campaign"').toBe('Create new campaign');

    console.log(`\n  Create-campaign button clicked — wizard title : "${titleText}" ✓`);

    await createPage.clickCancel();
  });

  // ── TC-BF-MK-003 ────────────────────────────────────────────────────────
  // NEGATIVE→POSITIVE gating: "Setup Campaign Rules & Content" starts
  // disabled and only enables once every required Step 1 field (Campaign
  // name, Campaign start date, Region) is filled — verified field-by-field,
  // then verified it correctly re-disables when a required field is cleared.
  //
  // Confirmed live: Region's react-select has no visible "clear" affordance
  // once a value is picked, so only name and start date are exercised for
  // the clear-and-recheck half of this test — Region's contribution to the
  // gate is covered by the add-field-by-field half instead.

  test('TC-BF-MK-003 | Negative — "Setup Campaign Rules & Content" stays disabled until every required field is filled, and re-disables if a required field is cleared', async () => {
    await listPage.clickCreateButton();
    const setupBtn = createPage.setupButton();

    await expect(setupBtn, 'Setup button must start disabled on a fresh wizard').toBeDisabled();
    console.log(`\n  Initial state                          : disabled ✓`);

    await createPage.fillName('MK_QA_Gating');
    await expect(setupBtn, 'Setup button must stay disabled with only the name filled').toBeDisabled();
    console.log(`  After Campaign name only               : disabled ✓`);

    await createPage.fillStartDate(futureDateStr(5, 10, 0));
    await expect(setupBtn, 'Setup button must stay disabled without Region').toBeDisabled();
    console.log(`  After name + start date                : disabled ✓`);

    await createPage.selectRegion('United States');
    await expect(setupBtn, 'Setup button must enable once name + start date + Region are all filled').toBeEnabled();
    console.log(`  After name + start date + Region       : enabled ✓`);

    // ── Remove required fields one at a time and confirm it re-disables ──
    await createPage.nameInput().clear();
    await createPage.cidInput().click(); // blur
    await expect(setupBtn, 'Setup button must re-disable when the name is cleared').toBeDisabled();
    console.log(`  After clearing name                    : disabled ✓`);

    await createPage.fillName('MK_QA_Gating');
    await expect(setupBtn, 'Setup button must re-enable once the name is restored').toBeEnabled();
    console.log(`  After restoring name                   : enabled ✓`);

    await createPage.startDateInput().clear();
    await createPage.nameInput().click(); // blur
    await expect(setupBtn, 'Setup button must re-disable when the start date is cleared').toBeDisabled();
    console.log(`  After clearing start date              : disabled ✓`);

    await createPage.clickCancel();
  });

  // ── TC-BF-MK-004 ────────────────────────────────────────────────────────
  // POSITIVE: typing the Campaign name auto-generates a fresh "MAR_<timestamp>"
  // Campaign Management ID. Confirmed live: once generated, the ID is NOT tied
  // to the name's current value — clearing the name does not clear the ID, and
  // typing a different name does not regenerate or change it. Also confirmed:
  // filling every OTHER Step 1 field (start date, Region, Description) with no
  // name ever typed does not generate an ID at all — the name is specifically
  // what triggers generation.

  test('TC-BF-MK-004 | Typing the Campaign name auto-generates the Campaign Management ID; the ID survives clearing/changing the name, and never generates without a name', async () => {
    await listPage.clickCreateButton();

    // ── Other fields filled, NO name yet — cmgmtId must stay empty ──
    expect(await createPage.getCmgmtId(), 'cmgmtId must start empty').toBe('');
    await createPage.fillStartDate(futureDateStr(5, 10, 0));
    await createPage.selectRegion('United States');
    await createPage.fillDescription('no name yet');
    expect(
      await createPage.getCmgmtId(),
      'cmgmtId must stay empty when every other Step 1 field is filled but the name is not'
    ).toBe('');
    console.log(`\n  Start date + Region + Description filled, NO name : cmgmtId stays empty ✓`);

    // ── Typing the name generates a fresh ID ──
    await createPage.fillName('MK_QA_CmgmtId');
    const generatedId = await createPage.getCmgmtId();
    expect(generatedId, 'cmgmtId must be a fresh MAR_<timestamp> value once the name is typed').toMatch(/^MAR_\d+$/);
    await expect(createPage.cmgmtIdInput(), 'cmgmtId field must stay disabled (read-only)').toBeDisabled();
    console.log(`  Campaign name typed — Campaign Management ID generated : "${generatedId}" ✓`);

    // ── Clearing the name must NOT clear the generated ID ──
    await createPage.nameInput().clear();
    await createPage.cidInput().click(); // blur
    expect(
      await createPage.getCmgmtId(),
      'cmgmtId must remain unchanged after the name is cleared'
    ).toBe(generatedId);
    console.log(`  Name cleared — Campaign Management ID unchanged : "${await createPage.getCmgmtId()}" ✓`);

    // ── Typing a DIFFERENT name must NOT change the generated ID ──
    await createPage.fillName('MK_QA_CmgmtId_Renamed');
    expect(
      await createPage.getCmgmtId(),
      'cmgmtId must stay the same even when a different name is typed'
    ).toBe(generatedId);
    console.log(`  Different name typed — Campaign Management ID still unchanged : "${await createPage.getCmgmtId()}" ✓`);

    await createPage.clickCancel();
  });

  // ── TC-BF-MK-005 ────────────────────────────────────────────────────────
  // NEGATIVE: entering a past/expired Campaign start date shows an inline
  // validation message directly under the field (NOT a host-page toast), and
  // the Setup button stays gated disabled. Compares the ACTUAL message text
  // against the EXPECTED text to catch any wording drift, rather than a loose
  // substring/regex match.

  test('TC-BF-MK-005 | Negative — entering a past Campaign start date shows the exact validation message "Campaign start date & time (PST) should be greater than current date & time"', async () => {
    await listPage.clickCreateButton();

    await createPage.fillName('MK_QA_PastDate');
    await createPage.fillStartDate(pastDateStr(1));
    console.log(`\n  Past start date entered (yesterday)`);

    const expectedMessage = 'Campaign start date & time (PST) should be greater than current date & time';
    const errorLocator = createPage.pastStartDateErrorText();
    await expect(errorLocator, 'validation message must be visible for a past start date').toBeVisible({ timeout: 5000 });
    const actualMessage = (await errorLocator.textContent())?.trim();

    console.log(`  Expected message : "${expectedMessage}"`);
    console.log(`  Actual message   : "${actualMessage}"`);
    expect(actualMessage, 'actual validation message must match the expected text exactly').toBe(expectedMessage);
    console.log(`  Actual message matches expected message ✓`);

    await expect(createPage.setupButton(), 'Setup button must stay disabled while the start date is in the past').toBeDisabled();
    console.log(`  Setup button stays disabled ✓`);

    await createPage.clickCancel();
  });

  // ── TC-BF-MK-006 ────────────────────────────────────────────────────────
  // POSITIVE: with Region = United States, the four Type chips show the
  // expected counts ("Acquisition (7)", "Reactivation (7)", "Upgrade (3)",
  // "Upsell (1)"), Acquisition is selected by default, and switching between
  // chips swaps the Program table to the expected set of rows for each type.
  // Confirmed live: Acquisition and Reactivation happen to render the
  // identical 7-row set.

  test('TC-BF-MK-006 | Selecting Region "United States" shows the expected Type chip counts and each Type\'s Program table matches the expected rows', async () => {
    await listPage.clickCreateButton();

    await createPage.fillName('MK_QA_Types');
    await createPage.fillStartDate(futureDateStr(5, 10, 0));
    await createPage.selectRegion('United States');

    // ── Chip labels ──
    for (const chip of ['Acquisition (7)', 'Reactivation (7)', 'Upgrade (3)', 'Upsell (1)']) {
      await expect(createPage.typeChip(chip.split(' ')[0] as any), `Type chip "${chip}" must be visible`).toHaveText(chip);
    }
    console.log(`\n  Type chips : "Acquisition (7)", "Reactivation (7)", "Upgrade (3)", "Upsell (1)" ✓`);

    // ── Acquisition selected by default ──
    expect(await createPage.isTypeSelected('Acquisition'), 'Acquisition must be selected by default').toBe(true);
    console.log(`  Acquisition selected by default ✓`);

    const expectedRows: Record<string, string[]> = {
      Acquisition: [
        'WELLNESS | Quarterly',
        'GB_PLUS | Annually',
        'GB_PLUS | Every 2 months',
        'GB_PLUS | Monthly',
        'GB | Every 2 months',
        'GB | Annually',
        'GB | Monthly',
      ],
      Reactivation: [
        'WELLNESS | Quarterly',
        'GB_PLUS | Annually',
        'GB_PLUS | Every 2 months',
        'GB_PLUS | Monthly',
        'GB | Every 2 months',
        'GB | Annually',
        'GB | Monthly',
      ],
      Upgrade: [
        'GBX | Quarterly',
        'GB | Annually',
        'GB_PLUS | Annually',
      ],
      Upsell: [
        'BB | Monthly',
      ],
    };

    for (const typeName of ['Acquisition', 'Reactivation', 'Upgrade', 'Upsell'] as const) {
      if (typeName !== 'Acquisition') {
        await createPage.selectType(typeName);
      }
      const actualRows = await createPage.getProgramRows();
      const expected = expectedRows[typeName];
      console.log(`\n  ${typeName} (${expected.length}) — expected : ${JSON.stringify(expected)}`);
      console.log(`  ${typeName} (${actualRows.length}) — actual   : ${JSON.stringify(actualRows)}`);
      expect(actualRows, `${typeName}'s Program table rows must match the expected set exactly`).toEqual(expected);
      console.log(`  ${typeName} rows match expected ✓`);
    }

    await createPage.clickCancel();
  });

  // ── TC-BF-MK-007 ────────────────────────────────────────────────────────
  // POSITIVE: with Region = Mexico, only two Type chips exist — "Acquisition
  // (3)" and "Reactivation (3)" — Upgrade/Upsell are absent entirely (not
  // merely disabled). Acquisition is selected by default. Program rows are
  // read LIVE from the page (never hardcoded) and printed to the console
  // before being compared against the expected set.

  test('TC-BF-MK-007 | Selecting Region "Mexico" shows only Acquisition(3)/Reactivation(3) Type chips, with Acquisition selected by default and matching program rows', async () => {
    await listPage.clickCreateButton();

    await createPage.fillName('MK_QA_Mexico');
    await createPage.fillStartDate(futureDateStr(5, 10, 0));
    await createPage.selectRegion('Mexico');

    // ── Only Acquisition(3)/Reactivation(3) exist — Upgrade/Upsell absent ──
    await expect(createPage.typeChip('Acquisition'), 'Acquisition chip must read "Acquisition (3)"').toHaveText('Acquisition (3)');
    await expect(createPage.typeChip('Reactivation'), 'Reactivation chip must read "Reactivation (3)"').toHaveText('Reactivation (3)');
    expect(await createPage.isTypeChipPresent('Upgrade'), 'Upgrade chip must not exist for Mexico').toBe(false);
    expect(await createPage.isTypeChipPresent('Upsell'), 'Upsell chip must not exist for Mexico').toBe(false);
    console.log(`\n  Mexico Type chips : "Acquisition (3)", "Reactivation (3)" — no Upgrade/Upsell ✓`);

    // ── Acquisition selected by default ──
    expect(await createPage.isTypeSelected('Acquisition'), 'Acquisition must be selected by default').toBe(true);
    console.log(`  Acquisition selected by default ✓`);

    const expectedRows = ['GB | Quarterly', 'GB | Every 2 months', 'GB | Monthly'];

    // ── Acquisition's available programs — read live, printed, then compared ──
    const acquisitionRows = await createPage.getProgramRows();
    console.log(`\n  Acquisition — available programs (live) : ${JSON.stringify(acquisitionRows)}`);
    expect(acquisitionRows, 'Acquisition programs must match the expected set').toEqual(expectedRows);
    console.log(`  Acquisition programs match expected ✓`);

    // ── Reactivation's available programs — read live, printed, then compared ──
    await createPage.selectType('Reactivation');
    const reactivationRows = await createPage.getProgramRows();
    console.log(`\n  Reactivation — available programs (live) : ${JSON.stringify(reactivationRows)}`);
    expect(reactivationRows, 'Reactivation programs must match the expected set').toEqual(expectedRows);
    console.log(`  Reactivation programs match expected ✓`);

    await createPage.clickCancel();
  });

  // ── TC-BF-MK-008 ────────────────────────────────────────────────────────
  // NEGATIVE: clicking "Setup Campaign Rules & Content" with every other
  // Step 1 field filled but NO Program selected shows the host-page toast
  // "Please select at least one program" and does not advance past Step 1.
  // The actual message is read LIVE from the toast element (role=alert) —
  // never hardcoded — and compared against the expected text.

  test('TC-BF-MK-008 | Negative — clicking Setup without selecting a program shows the exact validation message "Please select at least one program"', async () => {
    await listPage.clickCreateButton();

    await createPage.fillName('MK_QA_NoProgram');
    await createPage.fillStartDate(futureDateStr(5, 10, 0));
    await createPage.selectRegion('United States');
    await expect(createPage.setupButton()).toBeEnabled();

    await createPage.clickSetupCampaignRulesAndContent();
    console.log(`\n  Setup clicked with NO program selected`);

    const expectedMessage = 'Please select at least one program';
    // Read via a generic role=alert locator — NOT the exact-text locator — so the
    // actual message is captured dynamically rather than hardcoded into the match.
    const alert = sharedPage.getByRole('alert').first();
    await expect(alert, 'a validation toast must appear when no program is selected').toBeVisible({ timeout: 5000 });
    const actualMessage = (await alert.textContent())?.trim();

    console.log(`  Expected message : "${expectedMessage}"`);
    console.log(`  Actual message   : "${actualMessage}"`);
    expect(actualMessage, 'actual validation message must match the expected text exactly').toBe(expectedMessage);
    console.log(`  Actual message matches expected message ✓`);

    await expect(createPage.step2Heading(), 'wizard must stay on Step 1, not advance to Step 2').not.toBeVisible();
    console.log(`  Wizard stays on Step 1 ✓`);

    await createPage.clickCancel();
  });

  // ── TC-BF-MK-009 ────────────────────────────────────────────────────────
  // POSITIVE: with every required field filled AND a program selected,
  // clicking "Setup Campaign Rules & Content" navigates to the Step 2 page
  // — verified via its own page title, comparing actual vs expected.

  test('TC-BF-MK-009 | Selecting a program and clicking Setup Campaign Rules & Content navigates to the "Setup Campaign Rules & Content" page, verified by its page title', async () => {
    await listPage.clickCreateButton();

    await createPage.fillName('MK_QA_Step2Nav');
    await createPage.fillStartDate(futureDateStr(5, 10, 0));
    await createPage.selectRegion('United States');
    await createPage.selectFirstProgram();
    console.log(`\n  Name + start date + Region filled, first program selected`);

    await createPage.clickSetupCampaignRulesAndContent();

    const expectedTitle = 'Setup Campaign Rules & Content';
    const titleLocator = createPage.step2Heading();
    await expect(titleLocator, '"Setup Campaign Rules & Content" title must be visible after clicking the button').toBeVisible({ timeout: 10000 });
    const actualTitle = (await titleLocator.textContent())?.trim();

    console.log(`  Expected page title : "${expectedTitle}"`);
    console.log(`  Actual page title   : "${actualTitle}"`);
    expect(actualTitle, 'actual page title must match the expected title exactly').toBe(expectedTitle);
    console.log(`  Actual title matches expected title ✓`);

    await createPage.clickCancel();
  });

  // ── TC-BF-MK-010 ────────────────────────────────────────────────────────
  // NEGATIVE: selecting a program, then picking a REAL cycle (the first menu
  // option, "No cycle", is a disabled placeholder and cannot actually be
  // selected) enables that row's Gift Product ID field. Leaving it empty and
  // clicking "Setup Campaign Rules & Content" shows the host-page toast
  // "Please remove or complete uncompleted gift ID rows" and does not advance
  // past Step 1. The actual message is read LIVE from the toast — never
  // hardcoded — and compared against the expected text.

  test('TC-BF-MK-010 | Negative — selecting a cycle without completing the Gift Product ID shows the exact validation message "Please remove or complete uncompleted gift ID rows"', async () => {
    await listPage.clickCreateButton();

    await createPage.fillName('MK_QA_GiftId');
    await createPage.fillStartDate(futureDateStr(5, 10, 0));
    await createPage.selectRegion('United States');
    await createPage.selectFirstProgram();

    const pickedCycle = await createPage.selectCycleForProgramRow(0);
    console.log(`\n  Program selected, cycle picked : "${pickedCycle}"`);

    const giftInput = createPage.giftProductIdInputForRow(0);
    await expect(giftInput, 'Gift Product ID field must become enabled once a cycle is picked').toBeEnabled();
    expect(await giftInput.inputValue(), 'Gift Product ID is left intentionally empty').toBe('');
    console.log(`  Gift Product ID field enabled but left empty`);

    await createPage.clickSetupCampaignRulesAndContent();

    const expectedMessage = 'Please remove or complete uncompleted gift ID rows';
    // Read via a generic role=alert locator — NOT the exact-text locator — so the
    // actual message is captured dynamically rather than hardcoded into the match.
    const alert = sharedPage.getByRole('alert').first();
    await expect(alert, 'a validation toast must appear for an incomplete gift-ID row').toBeVisible({ timeout: 5000 });
    const actualMessage = (await alert.textContent())?.trim();

    console.log(`  Expected message : "${expectedMessage}"`);
    console.log(`  Actual message   : "${actualMessage}"`);
    expect(actualMessage, 'actual validation message must match the expected text exactly').toBe(expectedMessage);
    console.log(`  Actual message matches expected message ✓`);

    await expect(createPage.step2Heading(), 'wizard must stay on Step 1, not advance to Step 2').not.toBeVisible();
    console.log(`  Wizard stays on Step 1 ✓`);

    await createPage.clickCancel();
  });

  // ── TC-BF-MK-011 ────────────────────────────────────────────────────────
  // POSITIVE: a program row's "−" (Remove parameter) icon starts disabled and
  // enables as soon as that program is selected — it does NOT wait for the
  // cycle/Gift ID to be completed. The "+" (Add parameter) icon starts (and
  // stays) disabled until BOTH a real cycle is picked AND the Gift Product ID
  // is filled for that row. Confirmed live: neither icon exposes a disabled
  // attribute — enabled state is read from the icon's own cursor/opacity style.

  test('TC-BF-MK-011 | The "−" icon enables once a program is selected; the "+" icon only enables once that row\'s cycle AND Gift Product ID are both completed', async () => {
    await listPage.clickCreateButton();

    await createPage.fillName('MK_QA_PlusMinus');
    await createPage.fillStartDate(futureDateStr(5, 10, 0));
    await createPage.selectRegion('United States');

    // ── Before selecting the program: both icons disabled ──
    expect(await createPage.isRemoveParameterIconEnabled(0), '"−" icon must start disabled before the program is selected').toBe(false);
    expect(await createPage.isAddParameterIconEnabled(0), '"+" icon must start disabled before the program is selected').toBe(false);
    console.log(`\n  Before selecting the program : "−" disabled, "+" disabled ✓`);

    // ── Selecting the program enables "−" immediately, "+" stays disabled ──
    await createPage.selectFirstProgram();
    expect(await createPage.isRemoveParameterIconEnabled(0), '"−" icon must enable as soon as the program is selected').toBe(true);
    expect(await createPage.isAddParameterIconEnabled(0), '"+" icon must stay disabled until cycle + Gift ID are completed').toBe(false);
    console.log(`  Program selected              : "−" enabled, "+" still disabled ✓`);

    // ── Completing cycle + Gift ID enables "+" too; "−" stays enabled ──
    const pickedCycle = await createPage.selectCycleForProgramRow(0);
    await createPage.giftProductIdInputForRow(0).fill('GF_TEST_PLUSMINUS');
    console.log(`  Cycle picked : "${pickedCycle}", Gift Product ID filled`);

    expect(await createPage.isAddParameterIconEnabled(0), '"+" icon must enable once cycle + Gift ID are both completed').toBe(true);
    expect(await createPage.isRemoveParameterIconEnabled(0), '"−" icon must remain enabled').toBe(true);
    console.log(`  Cycle + Gift ID completed     : "+" enabled, "−" still enabled ✓`);

    await createPage.clickCancel();
  });

  // ── TC-BF-MK-012 ────────────────────────────────────────────────────────
  // POSITIVE: once every REAL cycle option for a program has been used (only
  // the disabled "No cycle" placeholder remains), the "+" icon re-disables —
  // there's nothing left for it to add. Confirmed live for the WELLNESS /
  // Quarterly row (Region = United States): exactly 2 real cycles exist
  // ("Oct 1, 2026" and "Jan 1, 2027").

  test('TC-BF-MK-012 | The "+" icon disables again once every available cycle for a program has been selected', async () => {
    await listPage.clickCreateButton();

    await createPage.fillName('MK_QA_MaxCycle');
    await createPage.fillStartDate(futureDateStr(5, 10, 0));
    await createPage.selectRegion('United States');
    await createPage.selectFirstProgram();

    // ── First cycle completed — "+" enables (one real cycle still available) ──
    const cycle1 = await createPage.selectCycleForProgramRow(0);
    await createPage.giftProductIdInputForRow(0).fill('GF_MAXCYCLE_1');
    expect(await createPage.isAddParameterIconEnabled(0), '"+" must be enabled after the first cycle is completed').toBe(true);
    console.log(`\n  First cycle completed  : "${cycle1}" — "+" enabled ✓`);

    // ── Add and complete the second (last remaining) cycle via "+" ──
    const cycle2 = await createPage.addAnotherCycleForProgramRow(0, 'GF_MAXCYCLE_2');
    console.log(`  Second cycle completed : "${cycle2}" (via "+")`);

    expect(cycle1, 'the two cycles used must be different').not.toBe(cycle2);

    // ── No real cycles remain — "+" must disable again ──
    expect(await createPage.isAddParameterIconEnabled(0), '"+" must disable once every real cycle has been used').toBe(false);
    console.log(`  All available cycles used — "+" disabled ✓`);

    await createPage.clickCancel();
  });

  // ── TC-BF-MK-013 ────────────────────────────────────────────────────────
  // POSITIVE: after every available cycle is used (confirmed in TC-012 —
  // "+" disables), removing one of the completed cycle entries via its "−"
  // icon frees up a slot again and re-enables "+".

  test('TC-BF-MK-013 | Removing an added cycle re-enables the "+" icon', async () => {
    await listPage.clickCreateButton();

    await createPage.fillName('MK_QA_RemoveCycle');
    await createPage.fillStartDate(futureDateStr(5, 10, 0));
    await createPage.selectRegion('United States');
    await createPage.selectFirstProgram();

    const cycle1 = await createPage.selectCycleForProgramRow(0);
    await createPage.giftProductIdInputForRow(0).fill('GF_RC_1');
    const cycle2 = await createPage.addAnotherCycleForProgramRow(0, 'GF_RC_2');
    console.log(`\n  Both cycles used : "${cycle1}", "${cycle2}"`);

    expect(await createPage.isAddParameterIconEnabled(0), '"+" must be disabled once both cycles are used').toBe(false);
    console.log(`  "+" disabled (no cycles left) ✓`);

    await createPage.removeLastCycleForProgramRow(0);
    console.log(`  Removed the last cycle entry ("${cycle2}") via "−"`);

    expect(await createPage.isAddParameterIconEnabled(0), '"+" must re-enable once a cycle slot is freed up by removing an entry').toBe(true);
    console.log(`  "+" re-enabled ✓`);

    await createPage.clickCancel();
  });

  // ── TC-BF-MK-014 ────────────────────────────────────────────────────────
  // POSITIVE: "Save as Draft" is available directly on Step 1 — confirmed
  // live, it's visible as soon as name + start date + Region are filled,
  // even before ever clicking "Setup Campaign Rules & Content". Saving from
  // here creates a Draft campaign, and reopening it via Edit must show all
  // the previously entered details correctly pre-filled.

  test('TC-BF-MK-014 | Clicking "Save as Draft" directly on Step 1 saves a Draft campaign, and reopening it preserves the previously entered details', async () => {
    const name = `MK_QA_Step1Draft_${Date.now()}`;
    const startDate = futureDateStr(7, 10, 0);
    const description = 'Step 1 direct draft save';

    await listPage.clickCreateButton();
    await createPage.fillName(name);
    await createPage.fillStartDate(startDate);
    await createPage.selectRegion('United States');
    await createPage.fillDescription(description);

    await expect(createPage.saveAsDraftButton(), '"Save as Draft" must be available directly on Step 1').toBeVisible({ timeout: 5000 });
    console.log(`\n  Name, start date, Region, Description filled — "Save as Draft" visible on Step 1 ✓`);

    await createPage.clickSaveAsDraft();
    await expect(createPage.step1Heading(), 'wizard must close after a successful Save as Draft').not.toBeVisible({ timeout: 10000 });
    console.log(`  Saved as Draft directly from Step 1 ✓`);

    await listPage.searchAndAssertVisible(name);
    await listPage.assertRowStatus(name, 'Draft');
    console.log(`  Campaign "${name}" visible in list — Status: Draft ✓`);

    await listPage.clickEditCampaign(name);
    await expect(createPage.updateHeading(), '"Update the campaign" title must be visible').toBeVisible({ timeout: 10000 });

    const reopenedName        = await createPage.nameInput().inputValue();
    const reopenedStartDate   = await createPage.startDateInput().inputValue();
    const reopenedDescription = await createPage.descriptionInput().inputValue();
    const reopenedRegion      = await createPage.getRegionText();

    console.log(`\n  Reopened — name        : "${reopenedName}"`);
    console.log(`  Reopened — start date  : "${reopenedStartDate}"`);
    console.log(`  Reopened — description : "${reopenedDescription}"`);
    console.log(`  Reopened — region      : "${reopenedRegion}"`);

    expect(reopenedName, 'name must be preserved').toBe(name);
    expect(reopenedStartDate, 'start date must be preserved').toBe(startDate);
    expect(reopenedDescription, 'description must be preserved').toBe(description);
    expect(reopenedRegion, 'region must be preserved').toBe('United States');
    console.log(`  All previously entered details preserved correctly ✓`);

    await createPage.clickCancel();

    // ── Cleanup: this is the first test in the suite that actually persists
    // a real campaign — sweep it so it doesn't linger in the live list. ──
    await listPage.searchAndAssertVisible(name);
    await listPage.clickDeleteCampaign(name);
    await listPage.assertDeleteDialog(name);
    await listPage.confirmDelete();
    await listPage.assertNoResults();
    console.log(`  [Cleanup] "${name}" deleted ✓`);
  });

  // ── TC-BF-MK-015 ────────────────────────────────────────────────────────
  // POSITIVE: a Draft campaign saved directly from Step 1 (TC-014's flow, no
  // program ever selected) can be reopened via Edit to continue the
  // creation. Confirmed live: "Update Campaign Rules & Content" enforces the
  // same "select at least one program" requirement as a fresh create's
  // "Setup" button — selecting a program and clicking it again successfully
  // advances to Step 2, titled "Update Campaign Rules & Content" (NOT
  // "Setup Campaign Rules & Content" like fresh create — distinct wording,
  // same underlying Step 2 content).

  test('TC-BF-MK-015 | Reopening a Draft campaign via Edit lets the user continue the creation — selecting a program and clicking "Update Campaign Rules & Content" advances to the "Update Campaign Rules & Content" page', async () => {
    const name = `MK_QA_ContinueDraft_${Date.now()}`;
    const startDate = futureDateStr(7, 10, 0);

    // ── Create a minimal Draft from Step 1, same as TC-014 ──
    await listPage.clickCreateButton();
    await createPage.fillName(name);
    await createPage.fillStartDate(startDate);
    await createPage.selectRegion('United States');
    await createPage.clickSaveAsDraft();
    await expect(createPage.step1Heading()).not.toBeVisible({ timeout: 10000 });
    console.log(`\n  Draft "${name}" created from Step 1 (no program selected yet)`);

    await listPage.searchAndAssertVisible(name);
    await listPage.assertRowStatus(name, 'Draft');

    // ── Reopen via Edit to continue the creation ──
    await listPage.clickEditCampaign(name);
    await expect(createPage.updateHeading(), '"Update the campaign" title must be visible').toBeVisible({ timeout: 10000 });
    console.log(`  Reopened via Edit — "Update the campaign" ✓`);

    // ── Clicking Update without a program shows the same required-program validation ──
    // Matched by its specific text (not a generic "first alert" grab) — the Draft-save
    // success toast from a moment ago can still be lingering/dismissing in the DOM.
    const expectedMessage = 'Please select at least one program';
    const toast = createPage.programRequiredToast();
    await createPage.clickUpdateCampaignRulesAndContent();
    await expect(toast, 'the required-program validation toast must appear when no program is selected').toBeVisible({ timeout: 5000 });
    await expect(createPage.updateStep2Heading(), 'must not advance to Step 2 without a program').not.toBeVisible();
    console.log(`  Clicking "Update Campaign Rules & Content" without a program : "${expectedMessage}" — stays on Step 1 ✓`);

    // ── Selecting a program and retrying successfully continues the creation ──
    await createPage.selectFirstProgram();
    await createPage.clickUpdateCampaignRulesAndContent();

    const expectedTitle = 'Update Campaign Rules & Content';
    const titleLocator = createPage.updateStep2Heading();
    await expect(titleLocator, 'Step 2 title must be visible once a program is selected').toBeVisible({ timeout: 10000 });
    const actualTitle = (await titleLocator.textContent())?.trim();
    expect(actualTitle, 'actual Step 2 title must match the expected title exactly').toBe(expectedTitle);
    console.log(`  Program selected, Update clicked again — advanced to : "${actualTitle}" ✓`);
    console.log(`  Draft campaign creation successfully continued ✓`);

    await createPage.clickCancel();

    // ── Cleanup ──
    await listPage.searchAndAssertVisible(name);
    await listPage.clickDeleteCampaign(name);
    await listPage.assertDeleteDialog(name);
    await listPage.confirmDelete();
    await listPage.assertNoResults();
    console.log(`  [Cleanup] "${name}" deleted ✓`);
  });

  // ── TC-BF-MK-016 ────────────────────────────────────────────────────────
  // POSITIVE: on Step 2, clicking "+ Add ruleset" opens the "Add ruleset"
  // page, which defaults its Defining rule to the campaign's own Campaign
  // Management ID (Attribute: "Campaign Management ID [Session]", Operator:
  // "Equals"). The Value must exactly match the cmgmtId auto-generated on
  // Step 1 — read live from both places and compared, not hardcoded.

  test('TC-BF-MK-016 | Clicking "+ Add ruleset" opens the "Add ruleset" page, defaulting the rule to the Step 1 Campaign Management ID', async () => {
    await listPage.clickCreateButton();

    await createPage.fillName('MK_QA_AddRuleset');
    await createPage.fillStartDate(futureDateStr(5, 10, 0));
    await createPage.selectRegion('United States');
    await createPage.selectFirstProgram();

    const step1CmgmtId = await createPage.getCmgmtId();
    console.log(`\n  Step 1 Campaign Management ID : "${step1CmgmtId}"`);

    await createPage.clickSetupCampaignRulesAndContent();
    await expect(createPage.step2Heading()).toBeVisible({ timeout: 10000 });

    await createPage.clickAddRulesetLink();
    console.log(`  "+ Add ruleset" clicked — "Add ruleset" page opened ✓`);

    const defaultValue = await createPage.getAddRulesetDefaultValue();
    console.log(`  "Add ruleset" default rule Value : "${defaultValue}"`);

    expect(defaultValue, 'the default rule\'s Value must exactly match the Step 1 Campaign Management ID').toBe(step1CmgmtId);
    console.log(`  Matches Step 1's Campaign Management ID exactly ✓`);

    await createPage.cancelAddRulesetDialog();
    await createPage.clickCancel();
  });

  // ── TC-BF-MK-017 ────────────────────────────────────────────────────────
  // NEGATIVE: clicking the "Add ruleset" submit button inside the "Add
  // ruleset" dialog without entering a Name shows an INLINE validation error
  // (not a host-page toast) and the dialog stays open.

  test('TC-BF-MK-017 | Negative — clicking "Add ruleset" without a Name shows the exact validation message "Please enter ruleset name"', async () => {
    await listPage.clickCreateButton();

    await createPage.fillName('MK_QA_RulesetName');
    await createPage.fillStartDate(futureDateStr(5, 10, 0));
    await createPage.selectRegion('United States');
    await createPage.selectFirstProgram();
    await createPage.clickSetupCampaignRulesAndContent();
    await expect(createPage.step2Heading()).toBeVisible({ timeout: 10000 });

    await createPage.clickAddRulesetLink();
    console.log(`\n  "Add ruleset" dialog opened (Name left empty)`);

    await createPage.clickAddRulesetSubmit();

    const expectedMessage = 'Please enter ruleset name';
    const errorLocator = createPage.rulesetNameRequiredError();
    await expect(errorLocator, 'inline validation message must be visible when Name is empty').toBeVisible({ timeout: 5000 });
    const actualMessage = (await errorLocator.textContent())?.trim();

    console.log(`  Expected message : "${expectedMessage}"`);
    console.log(`  Actual message   : "${actualMessage}"`);
    expect(actualMessage, 'actual validation message must match the expected text exactly').toBe(expectedMessage);
    console.log(`  Actual message matches expected message ✓`);

    await expect(createPage.addRulesetDialog(), 'the "Add ruleset" dialog must stay open').toBeVisible();
    console.log(`  "Add ruleset" dialog stays open ✓`);

    await createPage.cancelAddRulesetDialog();
    await createPage.clickCancel();
  });
});
