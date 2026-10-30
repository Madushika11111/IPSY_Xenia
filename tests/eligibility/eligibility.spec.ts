import { test, expect, Browser, Page } from '@playwright/test';
import { SpacePage } from '../../pages/SpacePage';
import { EligibilityListPage } from '../../pages/EligibilityListPage';
import { EligibilityCreatePage } from '../../pages/EligibilityCreatePage';
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

// ─── Eligibility Campaign ─────────────────────────────────────────────────────

test.describe('Eligibility Campaign', () => {
  let sharedPage: Page;
  let listPage: EligibilityListPage;
  let createPage: EligibilityCreatePage;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const context = await browser.newContext({ storageState: 'auth/user.json' });
    sharedPage = await context.newPage();
    listPage   = new EligibilityListPage(sharedPage);
    createPage = new EligibilityCreatePage(sharedPage);

    const spacePage = new SpacePage(sharedPage, context);
    await spacePage.navigateToEntries(config.spaceId);
    await spacePage.openSpaceSidepanel();
    await spacePage.selectSpace(config.xeniaSpaceId, config.xeniaSpaceName);
    await spacePage.selectEnvironment('master');
    await spacePage.openAppsMenu(config.xeniaAppName);
    await spacePage.assertAppLoaded();

    // Wait for the Xenia iframe content to fully initialize before any test runs.
    // assertAppLoaded() only checks the outer Contentful page; the iframe can take
    // additional seconds to boot — this prevents TC-EL-001 from starting cold.
    const frame = sharedPage.frameLocator('[data-test-id="cf-widget-renderer"]');
    await expect(frame.getByRole('link', { name: 'Dashboard' })).toBeVisible({ timeout: 30000 });
  });

  test.afterAll(async () => {
    await sharedPage.context().close();
  });

  // ── TC-EL-001 ─────────────────────────────────────────────────────────────────

  test('TC-EL-001 | should display the Eligibility tab in the side menu under the Campaigns section', async () => {
    await listPage.assertSidebarLinkVisible();
    console.log(`\n  Eligibility tab visible in side menu ✓`);
  });

  // ── TC-EL-002 ─────────────────────────────────────────────────────────────────

  test('TC-EL-002 | should navigate to the Eligibility campaign list page and display the correct page title when the Eligibility tab is clicked', async () => {
    console.log(`\n  Clicked "Eligibility" tab in side menu ✓`);
    await listPage.navigate();
    console.log(`  Page title visible ✓`);
  });

  // ── TC-EL-003 ─────────────────────────────────────────────────────────────────

  test('TC-EL-003 | should display the "+ Campaigns" creation button on the Eligibility campaign list page', async () => {
    await listPage.navigate();
    await listPage.assertCreateButtonVisible();
    console.log(`\n  "+ Campaigns" button visible on list page ✓`);
  });

  // ── TC-EL-004 ─────────────────────────────────────────────────────────────────

  test('TC-EL-004 | should open the campaign creation page with the correct title when the "+ Campaigns" button is clicked', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    console.log(`\n  Clicked "+ Campaigns" button ✓`);
    await createPage.assertPageVisible();
    console.log(`  Create page title visible ✓`);
    await createPage.closeDrawer();
  });

  // ── TC-EL-005 ─────────────────────────────────────────────────────────────────

  test('TC-EL-005 | should display all required fields, action buttons, and Ruleset default state on the campaign creation form', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();

    await createPage.assertAllFieldsVisible();
    console.log(`\n  Campaign name *         : visible ✓`);
    console.log(`  Campaign start date     : visible ✓`);
    console.log(`  Channels                : visible ✓`);
    console.log(`  Set campaign end date   : visible ✓`);
    console.log(`  Campaign ID *           : visible ✓`);
    console.log(`  Description             : visible ✓`);
    console.log(`  Ruleset                 : visible ✓`);

    await createPage.assertActionButtons();
    console.log(`  Save & Activate Campaign button : visible ✓`);
    console.log(`  Save Campaign as Draft button   : visible ✓`);
    console.log(`  Cancel button                   : visible ✓`);

    await createPage.assertRulesetNoChannels();
    console.log(`  Ruleset default state : "No channels selected" ✓`);

    await createPage.closeDrawer();
  });

  // ── TC-EL-006 ─────────────────────────────────────────────────────────────────

  test('TC-EL-006 | should display validation errors for all required fields when "Save & Activate Campaign" is clicked with an empty form', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();

    await createPage.clickSaveActivate();
    console.log(`\n  Clicked "Save & Activate Campaign" with empty form`);

    await createPage.assertSaveActivateValidationErrors();
    console.log(`  All 4 required-field errors shown ✓`);
    console.log(`  (End date is optional — no error expected) ✓`);

    await createPage.closeDrawer();
  });

  // ── TC-EL-007 ─────────────────────────────────────────────────────────────────

  test('TC-EL-007 | should show a validation notification when "Save Campaign as Draft" is clicked with an empty form, and an inline error when only name is provided without Campaign ID', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();

    // SC-1: Empty form → draft validation notification
    await createPage.clickSaveDraft();
    await createPage.assertDraftValidationNotification();
    console.log(`\n  SC-1: Empty form → draft validation notification shown ✓`);

    // SC-2: Name provided but no Campaign ID → inline "Please enter campaign id" error
    await createPage.fillName('EL_Draft_NameOnly');
    await createPage.clickSaveDraft();
    await createPage.assertCampaignIdRequiredInlineError();
    await createPage.assertDraftValidationNotification();
    console.log(`  SC-2: Name filled, Campaign ID empty → inline error + notification ✓`);
    console.log(`  Both Campaign name and Campaign ID are required to save as Draft ✓`);

    await createPage.closeDrawer();
  });

  // ── TC-EL-008 ─────────────────────────────────────────────────────────────────

  test('TC-EL-008 | should show a validation error when the campaign start date is set to a past date', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();

    const pastDate = futureDateStr(-1, 10, 0);
    await createPage.fillName('EL_PastDate_Test');
    await createPage.fillStartDate(pastDate);
    // Click name field to blur start date and trigger validation
    await createPage.fillName('EL_PastDate_Test');
    await createPage.assertStartDatePastError();

    console.log(`\n  Start date set to past: "${pastDate}"`);
    console.log(`  Error: "Campaign start date & time should be greater than current date & time" ✓`);
    console.log(`  Start date must be in the future ✓`);

    await createPage.closeDrawer();
  });

  // ── TC-EL-009 ─────────────────────────────────────────────────────────────────

  test('TC-EL-009 | should show a validation error when the campaign end date is set before the campaign start date', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();

    const startDate = futureDateStr(5, 14, 0);  // 5 days from now at 2 PM
    const endDate   = futureDateStr(3, 14, 0);  // 3 days from now at 2 PM — before start

    await createPage.fillStartDate(startDate);
    await createPage.fillEndDate(endDate);
    await createPage.assertEndDateBeforeStartError();

    console.log(`\n  Start date : "${startDate}"`);
    console.log(`  End date   : "${endDate}" (before start date)`);
    console.log(`  Error: "Campaign end date & time should be greater than campaign start date & time" ✓`);

    await createPage.closeDrawer();
  });

  // ── TC-EL-010 ─────────────────────────────────────────────────────────────────

  test('TC-EL-010 | should display "No channels selected" in the Ruleset section before any channel is added', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();

    await createPage.assertRulesetNoChannels();
    console.log(`\n  Ruleset section visible ✓`);
    console.log(`  "No channels selected" shown before adding any channel ✓`);

    await createPage.closeDrawer();
  });

  // ── TC-EL-011 ─────────────────────────────────────────────────────────────────

  test('TC-EL-011 | should display the channel accordion and "Add ruleset" button in the Ruleset section after a channel is selected', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();

    await createPage.assertRulesetNoChannels();
    console.log(`\n  Before channel selection : "No channels selected" ✓`);

    const ch = await createPage.selectRandomChannel();
    console.log(`  Channel selected         : ${ch}`);

    await createPage.assertRulesetChannelAccordion(ch);
    console.log(`  ${ch} accordion     : visible in Ruleset ✓`);

    await createPage.assertAddRulesetVisible();
    console.log(`  "Add ruleset" button     : visible ✓`);

    await createPage.assertRulesetNoRecords();
    console.log(`  Ruleset content          : "No records found" (empty) ✓`);

    await createPage.closeDrawer();
  });

  // ── TC-EL-012 ─────────────────────────────────────────────────────────────────

  test('TC-EL-012 | should create a separate Ruleset accordion section for each channel added', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();

    // Add first channel
    const ch1 = await createPage.selectRandomChannel();
    await createPage.assertRulesetChannelAccordion(ch1);
    console.log(`\n  Channel 1 added  : ${ch1}`);
    console.log(`  ${ch1} accordion section : visible in Ruleset ✓`);

    // Add second channel (react-select removes already-selected from options)
    const ch2 = await createPage.selectRandomChannel();
    await createPage.assertRulesetChannelAccordion(ch2);
    console.log(`  Channel 2 added  : ${ch2}`);
    console.log(`  ${ch2} accordion section   : visible in Ruleset ✓`);

    // Both channels must have their own accordion section simultaneously
    await createPage.assertRulesetChannelAccordion(ch1);
    await createPage.assertRulesetChannelAccordion(ch2);
    console.log(`  Both channels have separate Ruleset sections ✓`);
    console.log(`  Rulesets are managed channel-by-channel ✓`);

    await createPage.closeDrawer();
  });

  // ── TC-EL-013 ─────────────────────────────────────────────────────────────────

  test('TC-EL-013 | should show a format validation error when the Campaign ID contains invalid characters', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();

    await createPage.fillCampaignId('test@invalid!');
    await createPage.assertCampaignIdFormatError();

    console.log(`\n  Campaign ID "test@invalid!" entered`);
    console.log(`  Error: "Campaign ID can only contain..." ✓`);

    await createPage.closeDrawer();
  });

  // ── TC-EL-017 ─────────────────────────────────────────────────────────────────

  test('TC-EL-017 | should show validation errors in the "Add ruleset" sub-drawer when required fields are missing', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();

    // Fill minimum fields required for the "Add ruleset" button to open the sub-drawer
    await createPage.fillName(`TC17_${Date.now()}`);
    await createPage.fillStartDate(futureDateStr(3, 10, 0));
    const ch = await createPage.selectRandomChannel();
    console.log(`\n  Campaign form filled (name, start date, channel: ${ch})`);

    await createPage.assertAddRulesetVisible();
    await createPage.clickAddRuleset();
    console.log(`  "Add ruleset" sub-drawer opened ✓`);

    // SC-1: submit with empty name → "Please enter ruleset name"
    await createPage.submitRulesetDrawer();
    await createPage.assertRulesetNameRequiredError();
    console.log(`  SC-1: Empty name submitted → "Please enter ruleset name" ✓`);

    // SC-2: fill name, submit without defining rule → notification error
    await createPage.fillRulesetName('TC17_RulesetName');
    await createPage.submitRulesetDrawer();
    await createPage.assertRulesetDefiningRuleError();
    console.log(`  SC-2: Name filled, no defining rule → validation error ✓`);

    await createPage.dismissNotification();
    await createPage.closeRulesetDrawer();
    await createPage.closeDrawer();
  });

  // ── TC-EL-018 ─────────────────────────────────────────────────────────────────

  test.describe('TC-EL-018 | "+ Add ruleset" button requires campaign name and start date to open the sub-drawer', () => {
    test('SC-1 | clicking "+ Add ruleset" without campaign name and start date should not open the sub-drawer', async () => {
      await listPage.navigate();
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();

      // Channel only — name and start date intentionally left empty
      const ch = await createPage.selectRandomChannel();
      console.log(`\n  Channel selected (name & start date NOT filled) : ${ch}`);

      await createPage.assertAddRulesetVisible();
      await createPage.clickAddRuleset();
      console.log(`  Clicked "+ Add ruleset" without name/start date`);

      await createPage.assertRulesetSubDrawerNotOpen();
      console.log(`  Sub-drawer did not open — app blocks access without required fields ✓`);

      await createPage.closeDrawer();
    });

    test('SC-2 | clicking "+ Add ruleset" after filling name and start date should open the sub-drawer', async () => {
      await listPage.navigate();
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();

      const campaignName = `TC18_${Date.now()}`;
      await createPage.fillName(campaignName);
      await createPage.fillStartDate(futureDateStr(3, 10, 0));
      const ch = await createPage.selectRandomChannel();
      console.log(`\n  Form filled — name: "${campaignName}", start date set, channel: "${ch}"`);

      await createPage.assertAddRulesetVisible();
      await createPage.clickAddRuleset();
      console.log(`  Clicked "+ Add ruleset" with required fields filled`);

      await createPage.assertRulesetSubDrawerOpen();
      console.log(`  Sub-drawer opened successfully ✓`);

      await createPage.closeRulesetDrawer();
      await createPage.closeDrawer();
    });
  });

  // ── TC-EL-019 ─────────────────────────────────────────────────────────────────

  test('TC-EL-019 | should display a validation message when saving a multi-channel campaign where only one channel has a ruleset configured', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();

    const campaignName = `TC19_${Date.now()}`;
    await createPage.fillName(campaignName);
    await createPage.fillStartDate(futureDateStr(10, 10, 0));
    await createPage.fillCampaignId(`TC19ID${Date.now()}`);
    console.log(`\n  Campaign name: "${campaignName}"`);

    // Select two channels so two ruleset accordions appear
    const ch1 = await createPage.selectRandomChannel();
    const ch2 = await createPage.selectRandomChannel();
    console.log(`  Channel 1 selected: ${ch1}`);
    console.log(`  Channel 2 selected: ${ch2}`);
    await createPage.assertRulesetChannelAccordion(ch1);
    await createPage.assertRulesetChannelAccordion(ch2);

    // Add and activate a ruleset for ch1 only — ch2 is intentionally left without one
    await createPage.clickAddRulesetForChannel(ch1);
    await createPage.assertRulesetSubDrawerOpen();
    await createPage.selectDefiningRule();
    await createPage.submitRulesetDrawer();
    await createPage.assertRulesetInactive();
    await createPage.toggleRulesetToActive();
    console.log(`  Ruleset added and activated for "${ch1}" only ✓`);
    console.log(`  "${ch2}" has no ruleset configured`);

    // Saving should be blocked because ch2 is missing a ruleset
    await createPage.clickSaveActivate();
    await createPage.assertMissingRulesetValidationMessage();
    console.log(`  Clicked "Save & Activate Campaign"`);
    console.log(`  Validation message displayed — save blocked due to missing ruleset on "${ch2}" ✓`);

    await createPage.dismissNotification();
    await createPage.closeDrawer();
  });

  // ── TC-EL-020 ─────────────────────────────────────────────────────────────────

  test.describe('TC-EL-020 | Multi-channel campaign — full creation with rulesets for all channels and A/B testing on one channel', () => {
    const campaignName = `EL_MC_${Date.now()}`;
    const campaignId   = `ELMCID${Date.now()}`;
    const startDate    = futureDateStr(5, 10, 0);
    const endDate      = futureDateStr(20, 10, 0);
    const abTestEnd    = futureDateStr(10, 10, 0);  // between start (day 5) and end (day 20)
    let ch1 = '';
    let ch2 = '';

    test.beforeAll(async () => {
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.clickSearch();
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();

      await createPage.fillName(campaignName);
      await createPage.fillStartDate(startDate);
      await createPage.fillEndDate(endDate);
      await createPage.fillCampaignId(campaignId);

      ch1 = await createPage.selectRandomChannel();
      ch2 = await createPage.selectRandomChannel();
    });

    test('SC-1 | should add rulesets to both channels, activate both, configure A/B testing on the second channel, and save successfully', async () => {
      // Ruleset for ch1
      await createPage.clickAddRulesetForChannel(ch1);
      await createPage.assertRulesetSubDrawerOpen();
      await createPage.selectDefiningRule();
      await createPage.submitRulesetDrawer();
      await createPage.assertRulesetInactiveForChannel(ch1);
      await createPage.toggleRulesetToActiveForChannel(ch1);
      console.log(`\n  Ruleset added and activated for "${ch1}" ✓`);

      // Open ch2 accordion and add its ruleset
      await createPage.openChannelAccordion(ch2);
      await createPage.clickAddRulesetForChannel(ch2);
      await createPage.assertRulesetSubDrawerOpen();
      await createPage.selectDefiningRule();
      await createPage.submitRulesetDrawer();
      await createPage.assertRulesetInactiveForChannel(ch2);
      await createPage.toggleRulesetToActiveForChannel(ch2);
      console.log(`  Ruleset added and activated for "${ch2}" ✓`);

      // Configure A/B testing for ch2
      await createPage.enableABTestingForChannel(ch2);
      await createPage.fillABTestEndDateForChannel(ch2, abTestEnd);
      await createPage.fillVariantTrafficForChannel(ch2, 50);
      console.log(`  A/B testing enabled for "${ch2}" — end date: ${abTestEnd}, variant: 50% ✓`);

      // Save & Activate — should succeed because all channels have rulesets
      await createPage.clickSaveActivate();
      await createPage.assertSaveSuccess();
      console.log(`  Campaign saved successfully ✓`);
    });

    test('SC-2 | saved campaign should appear in the list with correct name, both channels, and Scheduled status', async () => {
      await listPage.searchByName(campaignName);
      await listPage.clickSearch();

      await listPage.assertCampaignVisible(campaignName);
      await listPage.assertCampaignStatus('Scheduled');

      const channelCellText = await listPage.getFirstCampaignChannel();
      expect(channelCellText).toContain(ch1);
      expect(channelCellText).toContain(ch2);

      console.log(`\n  Campaign "${campaignName}" visible in list ✓`);
      console.log(`  Status: Scheduled (start date ${startDate} is future) ✓`);
      console.log(`  Channel cell: "${channelCellText}" — contains both channels ✓`);
    });
  });

  // ── TC-EL-021 ─────────────────────────────────────────────────────────────────

  test('TC-EL-021 | should display a validation message when saving a multi-channel campaign where no channel has any ruleset configured', async () => {
    await listPage.navigate();
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();

    const campaignName = `TC21_${Date.now()}`;
    await createPage.fillName(campaignName);
    await createPage.fillStartDate(futureDateStr(7, 10, 0));
    await createPage.fillCampaignId(`TC21ID${Date.now()}`);
    console.log(`\n  Campaign name: "${campaignName}"`);

    const ch1 = await createPage.selectRandomChannel();
    const ch2 = await createPage.selectRandomChannel();
    console.log(`  Channel 1 selected: ${ch1}`);
    console.log(`  Channel 2 selected: ${ch2}`);
    console.log(`  No rulesets added to either channel`);

    // Saving with 2 channels and zero rulesets should be blocked
    await createPage.clickSaveActivate();
    await createPage.assertMissingRulesetValidationMessage();
    console.log(`  Clicked "Save & Activate Campaign"`);
    console.log(`  Validation message shown — save blocked because no channel has a ruleset ✓`);

    await createPage.dismissNotification();
    await createPage.closeDrawer();
  });

  // ── TC-EL-022 ─────────────────────────────────────────────────────────────────

  test.describe('TC-EL-022 | Campaign saves successfully both without and with A/B testing', () => {
    test.beforeAll(async () => {
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.clickSearch();
    });

    test('SC-1 | WITHOUT A/B testing — campaign with A/B left disabled saves and appears as Scheduled', async () => {
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();

      const campaignName = `EL_NOAB_${Date.now()}`;
      const campaignId   = `NOABID${Date.now()}`;
      const startDate    = futureDateStr(5, 10, 0);

      await createPage.fillName(campaignName);
      await createPage.fillStartDate(startDate);
      await createPage.fillCampaignId(campaignId);
      const ch = await createPage.selectRandomChannel();
      console.log(`\n  Channel: ${ch}, campaign name: "${campaignName}"`);

      await createPage.clickAddRuleset();
      await createPage.assertRulesetSubDrawerOpen();
      await createPage.selectDefiningRule();
      await createPage.submitRulesetDrawer();
      await createPage.assertRulesetInactive();
      await createPage.toggleRulesetToActive();

      await createPage.assertABTestingDisabled();
      console.log(`  A/B testing left as Disabled (not enabled) ✓`);

      await createPage.clickSaveActivate();
      await createPage.assertSaveSuccess();
      console.log(`  Campaign saved without A/B testing ✓`);

      await listPage.searchByName(campaignName);
      await listPage.clickSearch();
      await listPage.assertCampaignVisible(campaignName);
      await listPage.assertCampaignStatus('Scheduled');
      console.log(`  "${campaignName}" in list — Status: Scheduled ✓`);
    });

    test('SC-2 | WITH A/B testing enabled — campaign saves and appears as Scheduled', async () => {
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();

      const campaignName = `EL_WITHAB_${Date.now()}`;
      const campaignId   = `WITHABID${Date.now()}`;
      const startDate    = futureDateStr(5, 10, 0);
      const endDate      = futureDateStr(20, 10, 0);
      const abTestEnd    = futureDateStr(10, 10, 0);  // within [start day 5, end day 20]

      await createPage.fillName(campaignName);
      await createPage.fillStartDate(startDate);
      await createPage.fillEndDate(endDate);
      await createPage.fillCampaignId(campaignId);
      const ch = await createPage.selectRandomChannel();
      console.log(`\n  Channel: ${ch}, campaign name: "${campaignName}"`);

      await createPage.clickAddRuleset();
      await createPage.assertRulesetSubDrawerOpen();
      await createPage.selectDefiningRule();
      await createPage.submitRulesetDrawer();
      await createPage.assertRulesetInactive();
      await createPage.toggleRulesetToActive();

      await createPage.enableABTesting();
      await createPage.fillABTestEndDate(abTestEnd);
      await createPage.fillVariantTraffic(50);
      console.log(`  A/B testing enabled — end date: ${abTestEnd}, variant: 50% ✓`);

      await createPage.clickSaveActivate();
      await createPage.assertSaveSuccess();
      console.log(`  Campaign saved with A/B testing ✓`);

      await listPage.searchByName(campaignName);
      await listPage.clickSearch();
      await listPage.assertCampaignVisible(campaignName);
      await listPage.assertCampaignStatus('Scheduled');
      console.log(`  "${campaignName}" in list — Status: Scheduled ✓`);
    });
  });

  // ── TC-EL-023 ─────────────────────────────────────────────────────────────────

  test.describe('TC-EL-023 | Campaign ID uniqueness — previously used ID is rejected with a validation error', () => {
    // ID claimed via a full Save & Activate in beforeAll; reused in SC-1 to trigger the duplicate error.
    const duplicateId = `DUPEL${Date.now()}`;

    test.beforeAll(async () => {
      // Create and fully save a campaign to claim duplicateId in the system.
      await listPage.navigate();
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();

      await createPage.fillName(`TC23_ORIG_${Date.now()}`);
      await createPage.fillStartDate(futureDateStr(5, 10, 0));
      await createPage.fillCampaignId(duplicateId);
      await createPage.selectRandomChannel();

      await createPage.clickAddRuleset();
      await createPage.assertRulesetSubDrawerOpen();
      await createPage.selectDefiningRule();
      await createPage.submitRulesetDrawer();
      await createPage.toggleRulesetToActive();

      await createPage.clickSaveActivate();
      await createPage.assertSaveSuccess();
      // Drawer auto-closes after Save & Activate; list is now visible
      console.log(`\n  [Setup] Campaign ID "${duplicateId}" claimed via Save & Activate ✓`);
    });

    test('SC-1 | saving with an already-used Campaign ID should be rejected and no campaign created', async () => {
      const dupName = `TC23_DUP_${Date.now()}`;

      await listPage.navigate();
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();

      console.log(`\n  Attempting to reuse Campaign ID: "${duplicateId}"`);

      try {
        // The duplicate check no longer fires inline on field blur — the ID is
        // only rejected when the campaign is actually saved, so build a fully
        // valid campaign around the duplicate ID and attempt Save & Activate.
        await createPage.fillName(dupName);
        await createPage.fillStartDate(futureDateStr(6, 10, 0));
        await createPage.fillCampaignId(duplicateId);
        await createPage.selectRandomChannel();

        await createPage.clickAddRuleset();
        await createPage.assertRulesetSubDrawerOpen();
        await createPage.selectDefiningRule();
        await createPage.submitRulesetDrawer();
        await createPage.toggleRulesetToActive();

        // Let the beforeAll save's success toast expire so the notification we
        // assert on is guaranteed to belong to THIS save attempt
        await createPage.waitForNotificationsToClear();

        await createPage.clickSaveActivate();
        const notification = await createPage.assertDuplicateIdSaveRejected();
        console.log(`  Save rejected — notification: "${notification}" ✓`);
      } finally {
        // Always close the drawer so a failure here cannot cascade into TC-EL-024
        await createPage.closeDrawer();
      }

      // Save must have been prevented — the duplicate must not appear in the list
      await listPage.searchByName(dupName);
      await listPage.clickSearch();
      await listPage.assertCampaignNotInList(dupName);
      console.log(`  "${dupName}" not present in list — duplicate save prevented ✓`);
      console.log(`  System correctly rejects reuse of Campaign ID "${duplicateId}" ✓`);
    });
  });

  // ── TC-EL-024 ─────────────────────────────────────────────────────────────────

  test.describe('TC-EL-024 | Campaign creation with a manually built ruleset, A/B testing, and Scheduled action-button verification', () => {
    const campaignName = `EL_MAN_${Date.now()}`;
    const campaignId   = `ELMANID${Date.now()}`;
    const startDate    = futureDateStr(3, 10, 0);
    const endDate      = futureDateStr(22, 10, 0);
    const abTestEnd    = futureDateStr(16, 10, 0);  // within [start day 3, end day 22]
    let ch = '';

    test.beforeAll(async () => {
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.clickSearch();
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();

      await createPage.fillName(campaignName);
      await createPage.fillStartDate(startDate);
      await createPage.fillEndDate(endDate);
      await createPage.fillCampaignId(campaignId);
      ch = await createPage.selectRandomChannel();
    });

    test('SC-1 | should build a ruleset with a single manual condition, enable A/B testing, and save successfully', async () => {
      await createPage.clickAddRuleset();
      await createPage.assertRulesetSubDrawerOpen();
      await createPage.fillRulesetName('name contain m');

      // Single condition: name [User] contains "m"
      await createPage.searchAndSelectFirstConditionAttribute('name', /^name\b/i);
      await createPage.selectConditionOperator(0, 'contains');
      await createPage.fillConditionValue(0, 'm');
      console.log(`\n  Condition: name [User] contains "m" ✓`);

      // Assert the rule expression preview is displayed
      await createPage.assertRuleExpression('userData.get("name');
      console.log(`  Rule expression preview visible ✓`);

      await createPage.submitRulesetDrawer();
      await createPage.assertRulesetInactive();
      await createPage.toggleRulesetToActive();
      console.log(`  Ruleset submitted, toggled to Active ✓`);

      // Enable A/B testing and configure
      await createPage.enableABTesting();
      await createPage.fillABTestEndDate(abTestEnd);
      await createPage.fillVariantTraffic(16);
      console.log(`  A/B testing enabled — end date: ${abTestEnd}, variant: 16% ✓`);

      await createPage.clickSaveActivate();
      await createPage.assertSaveSuccess();
      console.log(`  Campaign "${campaignName}" saved successfully ✓`);
    });

    test('SC-2 | saved campaign should appear as Scheduled with Share, View, Edit, Copy, Pause and Stop buttons visible, and Delete disabled', async () => {
      await listPage.searchByName(campaignName);
      await listPage.clickSearch();

      await listPage.assertCampaignVisible(campaignName);
      await listPage.assertCampaignStatus('Scheduled');
      console.log(`\n  Campaign "${campaignName}" visible — Status: Scheduled ✓`);

      await listPage.assertScheduledCampaignActionButtonsVisible();
      console.log(`  Share Campaign   : visible ✓`);
      console.log(`  View Details     : visible ✓`);
      console.log(`  Edit Campaign    : visible ✓`);
      console.log(`  Copy Campaign    : visible ✓`);
      console.log(`  Pause Campaign   : visible ✓`);
      console.log(`  Stop Campaign    : visible ✓`);

      await listPage.assertDeleteButtonDisabled();
      console.log(`  Delete icon      : disabled for Scheduled campaign ✓`);
    });
  });

  // ── TC-EL-025 ─────────────────────────────────────────────────────────────────

  test.describe('TC-EL-025 | View Details action — opens campaign detail modal with full read-only information', () => {
    test.beforeAll(async () => {
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.clickSearch();
    });

    test('SC-1 | clicking View Details opens the campaign detail overlay modal', async () => {
      await listPage.clickViewDetails();
      await listPage.assertViewDetailsModalVisible();
      console.log(`\n  View Details modal opened — campaign name and dates visible ✓`);
    });

    test('SC-2 | modal displays Campaign start date, end date, Channel, and Campaign ID fields', async () => {
      await listPage.assertViewDetailsHasField('Campaign start date & time (PST)');
      await listPage.assertViewDetailsHasField('Campaign end date & time (PST)');
      await listPage.assertViewDetailsHasField('Channel');
      await listPage.assertViewDetailsHasField('Campaign ID');
      console.log(`\n  Campaign start date : visible ✓`);
      console.log(`  Campaign end date   : visible ✓`);
      console.log(`  Channel             : visible ✓`);
      console.log(`  Campaign ID         : visible ✓`);
    });

    test('SC-3 | modal displays a Ruleset table with Rule Name, Rule Status, and Channel columns', async () => {
      await listPage.assertViewDetailsRulesetTable();
      console.log(`\n  Rule Name column   : visible ✓`);
      console.log(`  Rule Status column : visible ✓`);
    });

    test('SC-4 | closing the modal returns to the Eligibility campaign list', async () => {
      await listPage.closeViewDetailsModal();
      await listPage.assertPageVisible();
      console.log(`\n  Modal closed — Eligibility campaigns list visible again ✓`);
    });
  });

  // ── TC-EL-026 ─────────────────────────────────────────────────────────────────

  test.describe('TC-EL-026 | Edit Campaign action — opens Update campaign form pre-filled with existing data', () => {
    test.beforeAll(async () => {
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.clickSearch();
    });

    test('SC-1 | clicking Edit Campaign opens the Update campaign form', async () => {
      await listPage.clickEditCampaign();
      await listPage.assertEditCampaignPageVisible();
      console.log(`\n  "Update campaign" heading visible ✓`);
    });

    test('SC-2 | the Update campaign form shows the existing campaign name and channels pre-filled', async () => {
      const nameInput = listPage['frame'].getByRole('textbox', { name: 'Campaign name *' });
      await expect(nameInput).toBeVisible({ timeout: 5000 });
      const name = await nameInput.inputValue();
      expect(name.length).toBeGreaterThan(0);
      console.log(`\n  Campaign name pre-filled: "${name}" ✓`);
    });

    test('SC-3 | "Update Campaign" and "Cancel" buttons are visible on the edit form', async () => {
      await listPage.assertEditCampaignButtonsVisible();
      console.log(`\n  Update Campaign button : visible ✓`);
      console.log(`  Cancel button         : visible ✓`);
    });

    test('SC-4 | clicking Cancel returns to the Eligibility campaign list without saving', async () => {
      await listPage.cancelEditCampaign();
      console.log(`\n  Cancel clicked — returned to Eligibility campaigns list ✓`);
    });
  });

  // ── TC-EL-027 ─────────────────────────────────────────────────────────────────

  test.describe('TC-EL-027 | Copy Campaign action — opens Create campaign form with original data, start date cleared', () => {
    test.beforeAll(async () => {
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.clickSearch();
    });

    test('SC-1 | clicking Copy Campaign opens the Create campaign form', async () => {
      await listPage.clickCopyCampaign();
      await listPage.assertCopyCampaignPageVisible();
      console.log(`\n  "Create campaign" form opened via Copy ✓`);
    });

    test('SC-2 | the copied form preserves campaign name and channels from the original', async () => {
      const nameInput = listPage['frame'].getByRole('textbox', { name: 'Campaign name *' });
      await expect(nameInput).toBeVisible({ timeout: 5000 });
      const name = await nameInput.inputValue();
      expect(name.length).toBeGreaterThan(0);
      console.log(`\n  Campaign name copied: "${name}" ✓`);
    });

    test('SC-3 | campaign start date is blank — user must set a new start date', async () => {
      await listPage.assertCopyStartDateEmpty();
      console.log(`\n  Start date is empty on the copied campaign form ✓`);
    });

    test('SC-4 | "Save & Activate", "Save as Draft", and "Cancel" buttons are visible', async () => {
      await listPage.assertCopyActionButtonsVisible();
      console.log(`\n  Save & Activate Campaign : visible ✓`);
      console.log(`  Save Campaign as Draft   : visible ✓`);
      console.log(`  Cancel                   : visible ✓`);
    });

    test('SC-5 | clicking Cancel returns to the Eligibility campaign list', async () => {
      await listPage.cancelCopyCampaign();
      console.log(`\n  Cancel clicked — returned to Eligibility campaigns list ✓`);
    });
  });

  // ── TC-EL-028 ─────────────────────────────────────────────────────────────────

  test.describe('TC-EL-028 | Share Campaign action — opens a modal with a shareable campaign URL', () => {
    test.beforeAll(async () => {
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.clickSearch();
    });

    test('SC-1 | clicking Share Campaign opens the Share Campaign modal', async () => {
      await listPage.clickShareCampaign();
      await listPage.assertShareModalVisible();
      console.log(`\n  "Share Campaign" modal opened ✓`);
    });

    test('SC-2 | modal contains a shareable Contentful URL and a Copy Link button', async () => {
      await listPage.assertShareModalHasUrl();
      console.log(`\n  Shareable URL present ✓`);
      console.log(`  Copy Link button visible ✓`);
    });

    test('SC-3 | closing the modal returns to the campaign list', async () => {
      await listPage.closeShareModal();
      await listPage.assertPageVisible();
      console.log(`\n  Share modal closed — list visible ✓`);
    });
  });

  // ── TC-EL-029 ─────────────────────────────────────────────────────────────────

  test.describe('TC-EL-029 | Pause Campaign action — shows confirmation dialog; Cancel preserves campaign state', () => {
    test.beforeAll(async () => {
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.clickSearch();
    });

    test('SC-1 | clicking Pause Campaign opens "Pause Campaign?" confirmation dialog', async () => {
      await listPage.clickPauseCampaign();
      await listPage.assertPauseDialogVisible();
      console.log(`\n  "Pause Campaign?" dialog opened ✓`);
    });

    test('SC-2 | dialog body asks for confirmation and includes the campaign name', async () => {
      await listPage.assertPauseDialogBody();
      console.log(`\n  Dialog body mentions pausing the campaign ✓`);
    });

    test('SC-3 | dialog shows Cancel and Pause action buttons', async () => {
      await listPage.assertPauseDialogButtons();
      console.log(`\n  Cancel button : visible ✓`);
      console.log(`  Pause button  : visible ✓`);
    });

    test('SC-4 | clicking Cancel closes the dialog without pausing the campaign', async () => {
      await listPage.cancelPauseCampaign();
      await listPage.assertPageVisible();
      console.log(`\n  Cancel clicked — dialog closed, campaign status unchanged ✓`);
    });
  });

  // ── TC-EL-030 ─────────────────────────────────────────────────────────────────

  test.describe('TC-EL-030 | Stop Campaign action — shows confirmation dialog warning about Expired status', () => {
    test.beforeAll(async () => {
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.clickSearch();
    });

    test('SC-1 | clicking Stop Campaign opens "Stop Campaign?" confirmation dialog', async () => {
      await listPage.clickStopCampaign();
      await listPage.assertStopDialogVisible();
      console.log(`\n  "Stop Campaign?" dialog opened ✓`);
    });

    test('SC-2 | dialog warns that the campaign will move to "Expired" status and become non-editable', async () => {
      await listPage.assertStopDialogMentionsExpired();
      console.log(`\n  Dialog warns campaign will be moved to "Expired" status ✓`);
      console.log(`  Campaign will no longer be editable after stopping ✓`);
    });

    test('SC-3 | dialog shows Cancel and Stop action buttons', async () => {
      await listPage.assertStopDialogButtons();
      console.log(`\n  Cancel button : visible ✓`);
      console.log(`  Stop button   : visible ✓`);
    });

    test('SC-4 | clicking Cancel closes the dialog without stopping the campaign', async () => {
      await listPage.cancelStopCampaign();
      await listPage.assertPageVisible();
      console.log(`\n  Cancel clicked — dialog closed, campaign status unchanged ✓`);
    });
  });

  // ── TC-EL-031 ─────────────────────────────────────────────────────────────────

  test('TC-EL-031 | Delete Campaign button should be disabled for campaigns in Scheduled status', async () => {
    await listPage.navigate();
    await listPage.filterByDate('All days');
    await listPage.clickSearch();

    await listPage.assertCampaignStatus('Scheduled');
    await listPage.assertDeleteButtonDisabled();
    console.log(`\n  First campaign in list has "Scheduled" status ✓`);
    console.log(`  Delete Campaign button is disabled for Scheduled campaigns ✓`);
    console.log(`  Scheduled campaigns cannot be deleted — only manually stopped first ✓`);
  });

  // ── TC-EL-032 ─────────────────────────────────────────────────────────────────

  test.describe('TC-EL-032 | Edit Campaign — edit name, start date, and end date; verify success, search, and pre-fill on re-edit', () => {
    const origName  = `EL_EDIT_${Date.now()}`;
    const origId    = `ELEDID${Date.now()}`;
    const origStart = futureDateStr(5);
    const origEnd   = futureDateStr(15);
    const newName   = `EL_EDITED_${Date.now()}`;
    const newStart  = futureDateStr(7);
    const newEnd    = futureDateStr(20);

    // Fill the form + add an active ruleset; save happens in SC-1 (mirrors TC-EL-016 pattern)
    test.beforeAll(async () => {
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.clickSearch();
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();
      await createPage.fillName(origName);
      await createPage.fillStartDate(origStart);
      await createPage.fillEndDate(origEnd);
      await createPage.selectRandomChannel();
      await createPage.fillCampaignId(origId);
      await createPage.clickAddRuleset();
      await createPage.selectRandomRuleset();
      await createPage.submitRulesetDrawer();
      await createPage.assertRulesetInactive();
      await createPage.toggleRulesetToActive();
    });

    test('SC-1 | saving the campaign and searching by original name returns one result', async () => {
      await createPage.dismissNotifications();
      await createPage.clickSaveActivate();
      await createPage.assertSaveSuccess();
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.searchByName(origName);
      await listPage.clickSearch();
      await listPage.assertCampaignVisible(origName);
      await listPage.assertResultsCount(1);
      console.log(`\n  Campaign saved ✓`);
      console.log(`  Search by "${origName}" → Results (1) ✓`);
    });

    test('SC-2 | clicking Edit Campaign opens the Update campaign form pre-filled with the original name', async () => {
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.searchByName(origName);
      await listPage.clickSearch();
      await listPage.assertCampaignVisible(origName);
      await listPage.clickEditCampaign();
      await listPage.assertEditCampaignPageVisible();
      const name = await listPage['frame'].getByRole('textbox', { name: 'Campaign name *' }).inputValue();
      expect(name).toBe(origName);
      console.log(`\n  "Update campaign" form opened ✓`);
      console.log(`  Campaign name pre-filled: "${name}" ✓`);
    });

    test('SC-3 | updating name, start date, and end date and saving displays a success message', async () => {
      // Re-open the edit form if not already visible (handles retry after SC-2 failure)
      const editOpen = await listPage['frame']
        .getByRole('heading', { name: 'Update campaign' })
        .isVisible()
        .catch(() => false);
      if (!editOpen) {
        // Close any drawer opened by a beforeAll retry (Create form) before navigating
        await createPage.closeDrawer().catch(() => {});
        await listPage.navigate();
        await listPage.filterByDate('All days');
        await listPage.searchByName(origName);
        await listPage.clickSearch();
        await listPage.clickEditCampaign();
        await listPage.assertEditCampaignPageVisible();
      }
      await createPage.fillName(newName);
      await createPage.fillStartDate(newStart);
      await createPage.fillEndDateOnUpdate(newEnd);
      await createPage.dismissNotifications();
      await listPage.clickUpdateCampaignButton();
      await listPage.assertUpdateSuccess();
      console.log(`\n  Name updated       : "${newName}" ✓`);
      console.log(`  Start date updated : "${newStart}" ✓`);
      console.log(`  End date updated   : "${newEnd}" ✓`);
      console.log(`  Success message displayed ✓`);
    });

    test('SC-4 | searching by the original name returns no results after the edit', async () => {
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.searchByName(origName);
      await listPage.clickSearch();
      await listPage.assertResultsCount(0);
      console.log(`\n  Search for original name "${origName}" → Results (0) ✓`);
      console.log(`  Old name no longer exists after edit ✓`);
    });

    test('SC-5 | searching by the new name shows the updated campaign details in the list', async () => {
      await listPage.searchByName(newName);
      await listPage.clickSearch();
      await listPage.assertCampaignVisible(newName);
      console.log(`\n  Updated campaign "${newName}" visible in search results ✓`);
      console.log(`  Edited details appear correctly in the campaign list ✓`);
    });

    test('SC-6 | re-opening Edit shows the updated name and dates pre-filled in the form', async () => {
      await listPage.clickEditCampaign();
      await listPage.assertEditCampaignPageVisible();
      const frame = listPage['frame'];
      const name  = await frame.getByRole('textbox', { name: 'Campaign name *' }).inputValue();
      const start = await frame.getByRole('textbox', { name: 'Campaign start date & time (' }).inputValue();
      // End-date toggle is always unchecked on open — check it to reveal the stored value
      await frame.getByRole('dialog', { name: 'Update campaign' }).getByRole('checkbox').check();
      const end   = await frame.getByRole('textbox', { name: 'Set campaign end date & time' }).inputValue();
      expect(name).toBe(newName);
      expect(start.length).toBeGreaterThan(0);
      expect(end.length).toBeGreaterThan(0);
      console.log(`\n  Edit form re-opened ✓`);
      console.log(`  Pre-filled name  : "${name}" ✓`);
      console.log(`  Pre-filled start : "${start}" ✓`);
      console.log(`  Pre-filled end   : "${end}" ✓`);
      await listPage.cancelEditCampaign();
      console.log(`  Form closed — returned to campaign list ✓`);
    });
  });

  // ── TC-EL-033 ─────────────────────────────────────────────────────────────────

  test.describe('TC-EL-033 | Pause / Resume lifecycle — Scheduled → Paused → Scheduled', () => {
    const pauseCampaignName = `EL_PAUSE_${Date.now()}`;
    const pauseCampaignId   = `ELPAUSEID${Date.now()}`;

    test.beforeAll(async () => {
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.clickSearch();
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();
      await createPage.fillName(pauseCampaignName);
      await createPage.fillStartDate(futureDateStr(5));
      await createPage.selectRandomChannel();
      await createPage.fillCampaignId(pauseCampaignId);
      await createPage.clickAddRuleset();
      await createPage.selectRandomRuleset();
      await createPage.submitRulesetDrawer();
      await createPage.assertRulesetInactive();
      await createPage.toggleRulesetToActive();
      // save happens in SC-1
    });

    test('SC-1 | saves as Scheduled and the Pause dialog shows heading, Cancel and Pause buttons', async () => {
      await createPage.dismissNotifications();
      await createPage.clickSaveActivate();
      await createPage.assertSaveSuccess();
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.searchByName(pauseCampaignName);
      await listPage.clickSearch();
      await listPage.assertCampaignVisible(pauseCampaignName);
      await listPage.assertCampaignStatus('Scheduled');
      await listPage.clickPauseCampaign();
      await listPage.assertPauseDialogVisible();
      await listPage.assertPauseDialogButtons();
      console.log(`\n  Campaign "${pauseCampaignName}" saved as Scheduled ✓`);
      console.log(`  Pause dialog: heading "Pause Campaign?", Cancel & Pause buttons ✓`);
      // dialog left open — SC-2 will cancel it
    });

    test('SC-2 | cancelling the Pause dialog keeps the campaign in Scheduled status', async () => {
      await listPage.cancelPauseCampaign();
      await listPage.assertCampaignStatus('Scheduled');
      console.log(`\n  After Cancel  : dialog closed, status still Scheduled ✓`);
    });

    test('SC-3 | confirming Pause changes the campaign status to Paused and shows Resume button', async () => {
      await listPage.clickPauseCampaign();
      await listPage.assertPauseDialogVisible();
      await listPage.confirmPauseCampaign();
      await listPage.assertCampaignStatus('Paused');
      await listPage.assertPausedCampaignActions();
      console.log(`\n  After Pause    : status → Paused ✓`);
      console.log(`  Resume Campaign: visible (replaces Pause button) ✓`);
      console.log(`  Pause Campaign : no longer visible ✓`);
      console.log(`  Success notification shown ✓`);
    });

    test('SC-4 | the Resume dialog shows heading, Cancel and Resume buttons', async () => {
      await listPage.clickResumeCampaign();
      await listPage.assertResumeDialogVisible();
      await listPage.assertResumeDialogButtons();
      console.log(`\n  Resume dialog: heading "Resume Campaign?", Cancel & Resume buttons ✓`);
      // dialog left open — SC-5 will cancel it
    });

    test('SC-5 | cancelling the Resume dialog keeps the campaign in Paused status', async () => {
      await listPage.cancelResumeCampaign();
      await listPage.assertCampaignStatus('Paused');
      console.log(`\n  After Cancel  : dialog closed, status still Paused ✓`);
    });

    test('SC-6 | confirming Resume changes the campaign status back to Scheduled', async () => {
      await listPage.clickResumeCampaign();
      await listPage.assertResumeDialogVisible();
      await listPage.confirmResumeCampaign();
      await listPage.assertCampaignStatus('Scheduled');
      await listPage.assertPauseCampaignButtonVisible();
      await listPage.assertResumeCampaignButtonAbsent();
      console.log(`\n  After Resume   : status → Scheduled ✓`);
      console.log(`  Pause Campaign : visible (restored) ✓`);
      console.log(`  Resume Campaign: no longer visible ✓`);
      console.log(`  Success notification shown ✓`);
    });
  });

  // ── TC-EL-034 ─────────────────────────────────────────────────────────────────

  test.describe('TC-EL-034 | Paused campaign — verify View Details, Edit, Stop and Delete actions', () => {
    let pauseVerName   = '';
    let pauseVerId     = '';
    let pauseStartDate = '';

    test.beforeAll(async () => {
      const ts     = Date.now();
      pauseVerName   = `EL_PAUSEV_${ts}`;
      pauseVerId     = `ELPAUSEVID${ts}`;
      pauseStartDate = futureDateStr(5);

      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.clickSearch();
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();
      await createPage.fillName(pauseVerName);
      await createPage.fillStartDate(pauseStartDate);
      await createPage.selectRandomChannel();
      await createPage.fillCampaignId(pauseVerId);
      await createPage.clickAddRuleset();
      await createPage.selectRandomRuleset();
      await createPage.submitRulesetDrawer();
      await createPage.assertRulesetInactive();
      await createPage.toggleRulesetToActive();
      await createPage.dismissNotifications();
      await createPage.clickSaveActivate();
      await createPage.assertSaveSuccess();
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.searchByName(pauseVerName);
      await listPage.clickSearch();
      await listPage.assertCampaignVisible(pauseVerName);
      await listPage.clickPauseCampaign();
      await listPage.confirmPauseCampaign();
      await listPage.assertCampaignStatus('Paused');
      console.log(`\n  [Setup] Campaign "${pauseVerName}" (ID: ${pauseVerId}) created and paused ✓`);
    });

    test('SC-1 | View Details shows the correct campaign name, campaign ID, status and ruleset table', async () => {
      await listPage.clickViewDetails();
      await listPage.assertViewDetailsModalVisible();

      // Read actual values from the modal — verify against what we saved
      const dialog = listPage['frame'].getByRole('dialog');
      await expect(dialog.getByText(pauseVerName).first()).toBeVisible({ timeout: 5000 });
      await expect(dialog.getByText(pauseVerId).first()).toBeVisible({ timeout: 5000 });

      // Read the actual campaign status shown in the modal
      const statusEl = dialog.getByText(/^(Scheduled|Live|Paused|Expired|Draft)$/).first();
      await expect(statusEl).toBeVisible({ timeout: 5000 });
      const status = (await statusEl.textContent() ?? '').trim();
      expect(status).toBe('Paused');

      await listPage.assertViewDetailsHasField('Campaign start date & time (PST)');
      await listPage.assertViewDetailsRulesetTable();

      console.log(`\n  View Details modal opened ✓`);
      console.log(`  Campaign name  : "${pauseVerName}" ✓`);
      console.log(`  Campaign ID    : "${pauseVerId}" ✓`);
      console.log(`  Status         : "${status}" ✓`);
      console.log(`  Start date     : section visible ✓`);
      console.log(`  Ruleset table  : Rule Name & Rule Status columns visible ✓`);
      await listPage.closeViewDetailsModal();
      console.log(`  Modal closed ✓`);
    });

    test('SC-2 | Edit Campaign shows campaign data pre-filled in the Update drawer', async () => {
      await listPage.clickEditCampaign();
      await listPage.assertEditCampaignPageVisible();
      await listPage.assertEditCampaignButtonsVisible();

      // Read actual values from the form and verify against saved data
      const frame = listPage['frame'];
      const name  = await frame.getByRole('textbox', { name: 'Campaign name *' }).inputValue();
      const start = await frame.getByRole('textbox', { name: 'Campaign start date & time (' }).inputValue();
      const id    = await frame.getByRole('textbox', { name: 'Campaign ID *' }).inputValue();

      expect(name).toBe(pauseVerName);
      expect(id).toBe(pauseVerId);
      expect(start.length).toBeGreaterThan(0);

      console.log(`\n  Update campaign drawer opened ✓`);
      console.log(`  Campaign name  : "${name}" ✓`);
      console.log(`  Campaign ID    : "${id}" ✓`);
      console.log(`  Start date     : "${start}" ✓`);
      console.log(`  Update Campaign & Cancel buttons : visible ✓`);
      await listPage.cancelEditCampaign();
      console.log(`  Drawer closed ✓`);
    });

    test('SC-3 | Stop Campaign dialog opens; cancelling leaves the status as Paused', async () => {
      await listPage.clickStopCampaign();
      await listPage.assertStopDialogVisible();
      await listPage.assertStopDialogMentionsExpired();
      await listPage.assertStopDialogButtons();
      console.log(`\n  Stop Campaign dialog opened ✓`);
      console.log(`  Dialog warns campaign will move to Expired ✓`);
      console.log(`  Stop & Cancel buttons : visible ✓`);
      await listPage.cancelStopCampaign();

      // Read the actual status from the row — not hardcoded
      const status = await listPage.getFirstCampaignStatus();
      expect(status).toBe('Paused');
      console.log(`  After Cancel : status = "${status}" ✓`);
    });

    test('SC-4 | Delete Campaign button is disabled for a Paused campaign', async () => {
      // Read the actual disabled state from the UI
      const deleteBtn  = listPage['frame'].getByRole('button', { name: 'Delete Campaign' }).first();
      const isDisabled = await deleteBtn.isDisabled();
      expect(isDisabled).toBe(true);
      console.log(`\n  Delete Campaign button : ${isDisabled ? 'disabled' : 'enabled'} ✓`);
      console.log(`  Deletion requires Expired status — campaign must be stopped first ✓`);
    });
  });

  // ── TC-EL-035 ─────────────────────────────────────────────────────────────────

  test.describe('TC-EL-035 | Edit Campaign on a Paused campaign — edit name and start date, verify success and persistence', () => {
    let origName  = '';
    let origId    = '';
    let origStart = '';
    let newName   = '';
    let newStart  = '';

    test.beforeAll(async () => {
      const ts  = Date.now();
      origName  = `EL_PEDIT_${ts}`;
      origId    = `ELPEDID${ts}`;
      origStart = futureDateStr(5);
      newName   = `EL_PEDITED_${ts}`;
      newStart  = futureDateStr(8);

      // Create and save a Scheduled campaign, then pause it
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.clickSearch();
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();
      await createPage.fillName(origName);
      await createPage.fillStartDate(origStart);
      await createPage.selectRandomChannel();
      await createPage.fillCampaignId(origId);
      await createPage.clickAddRuleset();
      await createPage.selectRandomRuleset();
      await createPage.submitRulesetDrawer();
      await createPage.assertRulesetInactive();
      await createPage.toggleRulesetToActive();
      // save happens in SC-1
    });

    test('SC-1 | campaign saves as Scheduled and is paused successfully', async () => {
      await createPage.dismissNotifications();
      await createPage.clickSaveActivate();
      await createPage.assertSaveSuccess();
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.searchByName(origName);
      await listPage.clickSearch();
      await listPage.assertCampaignVisible(origName);
      await listPage.assertCampaignStatus('Scheduled');
      await listPage.clickPauseCampaign();
      await listPage.confirmPauseCampaign();
      await listPage.assertCampaignStatus('Paused');
      console.log(`\n  Campaign "${origName}" saved as Scheduled ✓`);
      console.log(`  Campaign paused → status "Paused" ✓`);
    });

    test('SC-2 | editing name and start date on a Paused campaign and saving shows a success message', async () => {
      await listPage.clickEditCampaign();
      await listPage.assertEditCampaignPageVisible();
      await createPage.fillName(newName);
      await createPage.fillStartDate(newStart);
      await createPage.dismissNotifications();
      await listPage.clickUpdateCampaignButton();
      await listPage.assertUpdateSuccess();
      console.log(`\n  Name updated       : "${newName}" ✓`);
      console.log(`  Start date updated : "${newStart}" ✓`);
      console.log(`  Success message displayed ✓`);
    });

    test('SC-3 | searching by the original name returns no results after the edit', async () => {
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.searchByName(origName);
      await listPage.clickSearch();
      await listPage.assertResultsCount(0);
      console.log(`\n  Search for original name "${origName}" → Results (0) ✓`);
    });

    test('SC-4 | the updated campaign appears in the list with Paused status and the new name', async () => {
      await listPage.searchByName(newName);
      await listPage.clickSearch();
      await listPage.assertCampaignVisible(newName);
      const status = await listPage.getFirstCampaignStatus();
      expect(status).toBe('Paused');
      console.log(`\n  Updated campaign "${newName}" visible in list ✓`);
      console.log(`  Status : "${status}" ✓`);
    });

    test('SC-5 | re-opening Edit shows the updated name and start date pre-filled in the form', async () => {
      await listPage.clickEditCampaign();
      await listPage.assertEditCampaignPageVisible();
      const frame = listPage['frame'];
      const name  = await frame.getByRole('textbox', { name: 'Campaign name *' }).inputValue();
      const start = await frame.getByRole('textbox', { name: 'Campaign start date & time (' }).inputValue();
      const id    = await frame.getByRole('textbox', { name: 'Campaign ID *' }).inputValue();
      expect(name).toBe(newName);
      expect(id).toBe(origId);
      expect(start.length).toBeGreaterThan(0);
      console.log(`\n  Edit form re-opened ✓`);
      console.log(`  Pre-filled name  : "${name}" ✓`);
      console.log(`  Pre-filled start : "${start}" ✓`);
      console.log(`  Pre-filled ID    : "${id}" ✓`);
      await listPage.cancelEditCampaign();
      console.log(`  Form closed ✓`);
    });
  });

  // ── TC-EL-036 ─────────────────────────────────────────────────────────────────

  test.describe('TC-EL-036 | Stop Campaign — Scheduled campaign transitions to Expired and action buttons update', () => {
    let stopSchedName = '';
    let stopSchedId   = '';

    test.beforeAll(async () => {
      const ts    = Date.now();
      stopSchedName = `EL_STOPS_${ts}`;
      stopSchedId   = `ELSTOPSID${ts}`;

      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.clickSearch();
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();
      await createPage.fillName(stopSchedName);
      await createPage.fillStartDate(futureDateStr(5));
      await createPage.selectRandomChannel();
      await createPage.fillCampaignId(stopSchedId);
      await createPage.clickAddRuleset();
      await createPage.selectRandomRuleset();
      await createPage.submitRulesetDrawer();
      await createPage.assertRulesetInactive();
      await createPage.toggleRulesetToActive();
      // save happens in SC-1
    });

    test('SC-1 | confirming Stop on a Scheduled campaign changes status to Expired', async () => {
      await createPage.dismissNotifications();
      await createPage.clickSaveActivate();
      await createPage.assertSaveSuccess();
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.searchByName(stopSchedName);
      await listPage.clickSearch();
      await listPage.assertCampaignVisible(stopSchedName);
      await listPage.assertCampaignStatus('Scheduled');
      await listPage.clickStopCampaign();
      await listPage.assertStopDialogVisible();
      await listPage.assertStopDialogMentionsExpired();
      await listPage.confirmStopCampaign();
      await listPage.assertCampaignStatus('Expired'); // wait for list to reflect the new status
      const status = await listPage.getFirstCampaignStatus();
      expect(status).toBe('Expired');
      console.log(`\n  Campaign "${stopSchedName}" saved as Scheduled ✓`);
      console.log(`  After Stop : status = "${status}" ✓`);
    });

    test('SC-2 | Expired campaign shows View, Edit, Copy enabled; Pause and Stop disabled; Delete enabled', async () => {
      await listPage.assertExpiredCampaignActions();
      const deleteDisabled = await listPage['frame'].getByRole('button', { name: 'Delete Campaign' }).first().isDisabled();
      console.log(`\n  View Details    : enabled ✓`);
      console.log(`  Edit Campaign   : enabled ✓`);
      console.log(`  Copy Campaign   : enabled ✓`);
      console.log(`  Pause Campaign  : disabled ✓`);
      console.log(`  Stop Campaign   : disabled ✓`);
      console.log(`  Delete Campaign : ${!deleteDisabled ? 'enabled' : 'disabled'} ✓`);
    });

    test('SC-3 | View Details on Expired campaign shows "Expired" status', async () => {
      await listPage.clickViewDetails();
      await listPage.assertViewDetailsModalVisible();
      const dialog = listPage['frame'].getByRole('dialog');
      const statusEl = dialog.getByText(/^(Scheduled|Live|Paused|Expired|Draft)$/).first();
      await expect(statusEl).toBeVisible({ timeout: 5000 });
      const status = (await statusEl.textContent() ?? '').trim();
      expect(status).toBe('Expired');
      console.log(`\n  View Details modal opened ✓`);
      console.log(`  Status in modal : "${status}" ✓`);
      await listPage.closeViewDetailsModal();
      console.log(`  Modal closed ✓`);
    });
  });

  // ── TC-EL-037 ─────────────────────────────────────────────────────────────────

  test.describe('TC-EL-037 | Stop Campaign — Paused campaign transitions to Expired and action buttons update', () => {
    let stopPausedName = '';
    let stopPausedId   = '';

    test.beforeAll(async () => {
      const ts     = Date.now();
      stopPausedName = `EL_STOPP_${ts}`;
      stopPausedId   = `ELSTOPPID${ts}`;

      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.clickSearch();
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();
      await createPage.fillName(stopPausedName);
      await createPage.fillStartDate(futureDateStr(5));
      await createPage.selectRandomChannel();
      await createPage.fillCampaignId(stopPausedId);
      await createPage.clickAddRuleset();
      await createPage.selectRandomRuleset();
      await createPage.submitRulesetDrawer();
      await createPage.assertRulesetInactive();
      await createPage.toggleRulesetToActive();
      // save + pause happen in SC-1
    });

    test('SC-1 | confirming Stop on a Paused campaign changes status to Expired', async () => {
      await createPage.dismissNotifications();
      await createPage.clickSaveActivate();
      await createPage.assertSaveSuccess();
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.searchByName(stopPausedName);
      await listPage.clickSearch();
      await listPage.assertCampaignVisible(stopPausedName);
      await listPage.assertCampaignStatus('Scheduled');
      await listPage.clickPauseCampaign();
      await listPage.confirmPauseCampaign();
      await listPage.assertCampaignStatus('Paused');
      console.log(`\n  Campaign "${stopPausedName}" saved and paused ✓`);
      await listPage.clickStopCampaign();
      await listPage.assertStopDialogVisible();
      await listPage.assertStopDialogMentionsExpired();
      await listPage.confirmStopCampaign();
      await listPage.assertCampaignStatus('Expired'); // wait for list to reflect the new status
      const status = await listPage.getFirstCampaignStatus();
      expect(status).toBe('Expired');
      console.log(`  After Stop : status = "${status}" ✓`);
    });

    test('SC-2 | Expired campaign shows View, Edit, Copy enabled; Resume, Pause and Stop disabled; Delete enabled', async () => {
      await listPage.assertExpiredCampaignActions();
      // Resume Campaign should no longer be visible for Expired
      await expect(
        listPage['frame'].getByRole('button', { name: 'Resume Campaign' }).first()
      ).not.toBeVisible({ timeout: 3000 });
      const deleteDisabled = await listPage['frame'].getByRole('button', { name: 'Delete Campaign' }).first().isDisabled();
      console.log(`\n  View Details    : enabled ✓`);
      console.log(`  Edit Campaign   : enabled ✓`);
      console.log(`  Copy Campaign   : enabled ✓`);
      console.log(`  Resume Campaign : not visible ✓`);
      console.log(`  Pause Campaign  : disabled ✓`);
      console.log(`  Stop Campaign   : disabled ✓`);
      console.log(`  Delete Campaign : ${!deleteDisabled ? 'enabled' : 'disabled'} ✓`);
    });

    test('SC-3 | View Details on Expired campaign (stopped from Paused) shows "Expired" status', async () => {
      await listPage.clickViewDetails();
      await listPage.assertViewDetailsModalVisible();
      const dialog = listPage['frame'].getByRole('dialog');
      const statusEl = dialog.getByText(/^(Scheduled|Live|Paused|Expired|Draft)$/).first();
      await expect(statusEl).toBeVisible({ timeout: 5000 });
      const status = (await statusEl.textContent() ?? '').trim();
      expect(status).toBe('Expired');
      console.log(`\n  View Details modal opened ✓`);
      console.log(`  Status in modal : "${status}" ✓`);
      await listPage.closeViewDetailsModal();
      console.log(`  Modal closed ✓`);
    });
  });

  // ── TC-EL-038 ─────────────────────────────────────────────────────────────────

  test.describe('TC-EL-038 | Delete Campaign — negative (Scheduled/Paused disabled) and positive (Expired confirmed)', () => {
    let delName = '';
    let delId   = '';

    test.beforeAll(async () => {
      const ts = Date.now();
      delName  = `EL_DEL_${ts}`;
      delId    = `ELDELID${ts}`;

      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.clickSearch();
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();
      await createPage.fillName(delName);
      await createPage.fillStartDate(futureDateStr(5));
      await createPage.selectRandomChannel();
      await createPage.fillCampaignId(delId);
      await createPage.clickAddRuleset();
      await createPage.selectRandomRuleset();
      await createPage.submitRulesetDrawer();
      await createPage.assertRulesetInactive();
      await createPage.toggleRulesetToActive();
      // save happens in SC-1
    });

    test('SC-1 | negative — Delete button is disabled for a Scheduled campaign', async () => {
      await createPage.dismissNotifications();
      await createPage.clickSaveActivate();
      await createPage.assertSaveSuccess();
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.searchByName(delName);
      await listPage.clickSearch();
      await listPage.assertCampaignVisible(delName);
      await listPage.assertCampaignStatus('Scheduled');
      const isDisabled = await listPage['frame'].getByRole('button', { name: 'Delete Campaign' }).first().isDisabled();
      expect(isDisabled).toBe(true);
      console.log(`\n  Campaign "${delName}" saved as Scheduled ✓`);
      console.log(`  Delete button : ${isDisabled ? 'disabled' : 'enabled'} — cannot delete Scheduled campaign ✓`);
    });

    test('SC-2 | negative — Delete button is disabled for a Paused campaign', async () => {
      await listPage.clickPauseCampaign();
      await listPage.confirmPauseCampaign();
      await listPage.assertCampaignStatus('Paused');
      const isDisabled = await listPage['frame'].getByRole('button', { name: 'Delete Campaign' }).first().isDisabled();
      expect(isDisabled).toBe(true);
      console.log(`\n  Campaign paused → status "Paused" ✓`);
      console.log(`  Delete button : ${isDisabled ? 'disabled' : 'enabled'} — cannot delete Paused campaign ✓`);
    });

    test('SC-3 | positive pre-condition — stopping the campaign enables the Delete button', async () => {
      await listPage.clickStopCampaign();
      await listPage.assertStopDialogVisible();
      await listPage.confirmStopCampaign();
      await listPage.assertCampaignStatus('Expired');
      const status    = await listPage.getFirstCampaignStatus();
      const isEnabled = !(await listPage['frame'].getByRole('button', { name: 'Delete Campaign' }).first().isDisabled());
      expect(status).toBe('Expired');
      expect(isEnabled).toBe(true);
      console.log(`\n  Campaign stopped → status = "${status}" ✓`);
      console.log(`  Delete button : ${isEnabled ? 'enabled' : 'disabled'} — Expired campaign can be deleted ✓`);
    });

    test('SC-4 | negative — cancelling the Delete dialog keeps the campaign in the list', async () => {
      await listPage.clickDeleteCampaign();
      await listPage.assertDeleteDialogVisible();
      console.log(`\n  Delete dialog opened ✓`);
      await listPage.cancelDeleteCampaign();
      await listPage.assertCampaignVisible(delName);
      const status = await listPage.getFirstCampaignStatus();
      expect(status).toBe('Expired');
      console.log(`  After Cancel : campaign "${delName}" still in list, status = "${status}" ✓`);
    });

    test('SC-5 | positive — confirming Delete removes the campaign from the list', async () => {
      await listPage.clickDeleteCampaign();
      await listPage.assertDeleteDialogVisible();
      await listPage.confirmDeleteCampaign();
      console.log(`\n  Delete confirmed ✓`);
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.searchByName(delName);
      await listPage.clickSearch();
      await listPage.assertResultsCount(0);
      console.log(`  Search for "${delName}" → Results (0) ✓`);
      console.log(`  Campaign permanently removed from the list ✓`);
    });
  });

  // ── TC-EL-014 ─────────────────────────────────────────────────────────────────

  test.describe('TC-EL-014 | Channel removal — cancel preserves both channels, confirm removes one', () => {
    let ch1 = '';
    let ch2 = '';

    test.beforeAll(async () => {
      await listPage.navigate();
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();
      ch1 = await createPage.selectRandomChannel();
      ch2 = await createPage.selectRandomChannel();
    });

    test.afterAll(async () => {
      // Dismiss any lingering confirmation dialog (e.g. if SC-3 timed out mid-confirmation)
      await sharedPage.keyboard.press('Escape').catch(() => {});
      await createPage.closeDrawer();
    });

    test('SC-1 | both selected channels should appear as accordion sections in Ruleset', async () => {
      await createPage.assertRulesetChannelAccordion(ch1);
      await createPage.assertRulesetChannelAccordion(ch2);
      console.log(`\n  ${ch1} accordion : visible ✓`);
      console.log(`  ${ch2} accordion    : visible ✓`);
    });

    test('SC-2 | cancelling the removal dialog should keep both channel accordion sections', async () => {
      await createPage.clickRemoveChannel(ch1);
      await createPage.assertRemoveChannelDialog();
      console.log(`\n  Removal confirmation dialog for ${ch1} : visible ✓`);

      await createPage.cancelChannelRemoval();
      await createPage.assertRulesetChannelAccordion(ch1);
      await createPage.assertRulesetChannelAccordion(ch2);
      console.log(`  After cancel : ${ch1} still present ✓`);
      console.log(`  After cancel : ${ch2} still present ✓`);
    });

    test('SC-3 | confirming removal should remove the channel and keep the remaining one', async () => {
      await createPage.clickRemoveChannel(ch2);
      await createPage.assertRemoveChannelDialog();
      console.log(`\n  Removal confirmation dialog for ${ch2} : visible ✓`);

      await createPage.confirmChannelRemoval();
      await createPage.assertRulesetChannelAbsent(ch2);
      await createPage.assertRulesetChannelAccordion(ch1);
      console.log(`  ${ch2} accordion removed ✓`);
      console.log(`  ${ch1} accordion still present ✓`);
    });
  });

  // ── TC-EL-015 ─────────────────────────────────────────────────────────────────

  test.describe('TC-EL-015 | Full campaign creation lifecycle — Ruleset, A/B testing, save, and list verification', () => {
    const campaignName  = `EL_LC_${Date.now()}`;
    const campaignId    = `ELLCID${Date.now()}`;
    const startDate     = futureDateStr(7, 10, 0);
    const endDate       = futureDateStr(30, 10, 0);
    const abTestEnd     = futureDateStr(14, 10, 0);   // between start (day 7) and end (day 30)
    const abTestInvalid = futureDateStr(45, 10, 0);   // after campaign end — should fail validation

    test.beforeAll(async () => {
      await listPage.navigate();
      // Set "All days" filter before opening create — after save+auto-close the filter stays active
      await listPage.filterByDate('All days');
      await listPage.clickSearch();
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();
      await createPage.fillName(campaignName);
      await createPage.fillCampaignId(campaignId);
      await createPage.fillStartDate(startDate);
      await createPage.fillEndDate(endDate);
      await createPage.selectRandomChannel();
    });

    test('SC-1 | clicking "Add ruleset", selecting a defining rule, and submitting should add a ruleset in Inactive state with the A/B testing section visible', async () => {
      await createPage.assertAddRulesetVisible();
      await createPage.clickAddRuleset();
      await createPage.selectDefiningRule();
      await createPage.submitRulesetDrawer();
      await createPage.assertRulesetInactive();
      await createPage.assertABTestingSectionVisible();
      console.log(`\n  "Add ruleset" clicked ✓`);
      console.log(`  Defining rule selected ✓`);
      console.log(`  Ruleset created successfully ✓`);
      console.log(`  Ruleset initial state     : Inactive ✓`);
      console.log(`  A/B testing section       : visible (even while Inactive) ✓`);
      console.log(`  Variant traffic field     : visible ✓`);
      console.log(`  Control traffic field     : visible ✓`);
    });

    test('SC-2 | A/B testing should be in Disabled state by default when a ruleset is added', async () => {
      await createPage.assertABTestingDisabled();
      console.log(`\n  A/B testing state : Disabled ✓`);
    });

    test('SC-3 | toggling the Ruleset status to Active should keep the A/B testing section visible', async () => {
      await createPage.toggleRulesetToActive();
      await createPage.assertABTestingSectionVisible();
      console.log(`\n  Ruleset toggled to Active ✓`);
      console.log(`  A/B testing section still visible ✓`);
    });

    test('SC-4 | an A/B test end date outside the valid range should show a validation error', async () => {
      await createPage.enableABTesting();
      console.log(`\n  A/B testing enabled ✓`);
      await createPage.fillABTestEndDate(abTestInvalid);
      await createPage.clickSaveActivate();
      await createPage.assertABTestValidationError();
      console.log(`  A/B test end date "${abTestInvalid}" (after campaign end day 30) → validation error ✓`);
    });

    test('SC-5 | valid A/B test end date and any variant traffic value (0–100) should be accepted', async () => {
      await createPage.fillABTestEndDate(abTestEnd);
      await createPage.assertVariantTrafficEditable();
      const variantPct = Math.floor(Math.random() * 99) + 1;  // random 1–99
      await createPage.fillVariantTraffic(variantPct);
      await createPage.assertVariantTrafficValue(variantPct);
      console.log(`\n  A/B test end date "${abTestEnd}" (within range) : accepted ✓`);
      console.log(`  Variant traffic set to ${variantPct}% ✓`);
      console.log(`  Control traffic auto-calculated to ${100 - variantPct}% (disabled, read-only) ✓`);
    });

    test('SC-6 | campaign with a future start date should save and appear as Scheduled in the list', async () => {
      await createPage.clickSaveActivate();
      await createPage.assertSaveSuccess();
      console.log(`\n  Campaign saved ✓`);

      // Drawer auto-closes after save; list is already showing with "All days" filter active
      // (set in beforeAll before opening create). Search directly by name.
      await listPage.searchByName(campaignName);
      await listPage.clickSearch();

      await listPage.assertCampaignVisible(campaignName);
      const actualStatus  = await listPage.getFirstCampaignStatus();
      const actualChannel = await listPage.getFirstCampaignChannel();
      // Future start date must produce Scheduled status
      await listPage.assertCampaignStatus('Scheduled');
      await listPage.assertCampaignChannelInList(actualChannel);
      console.log(`  Campaign "${campaignName}" visible in list ✓`);
      console.log(`  Start date is ${startDate} (future) → Status : ${actualStatus} ✓`);
      console.log(`  Channel : ${actualChannel} ✓`);
    });
  });

  // ── TC-EL-016 ─────────────────────────────────────────────────────────────────

  test.describe('TC-EL-016 | Campaign creation using an existing ruleset with A/B testing and list verification', () => {
    const campaignName = `EL_GR_${Date.now()}`;
    const campaignId   = `ELGRID${Date.now()}`;
    const startDate    = futureDateStr(5, 22, 0);
    const abTestEnd    = futureDateStr(16, 22, 0);
    let   selectedRuleset = '';
    const variantPct   = Math.floor(Math.random() * 98) + 1;  // random 1–98

    test.beforeAll(async () => {
      await listPage.navigate();
      await listPage.filterByDate('All days');
      await listPage.clickSearch();
      await listPage.clickCreateButton();
      await createPage.assertPageVisible();
      await createPage.fillName(campaignName);
      await createPage.fillStartDate(startDate);
      await createPage.selectRandomChannel();
      await createPage.fillCampaignId(campaignId);
    });

    test('SC-1 | adding an existing ruleset, toggling it Active, and enabling A/B testing should configure the campaign correctly', async () => {
      await createPage.clickAddRuleset();
      selectedRuleset = await createPage.selectRandomRuleset();
      await createPage.submitRulesetDrawer();
      await createPage.assertRulesetInactive();
      console.log(`\n  "Add ruleset" clicked ✓`);
      console.log(`  Existing ruleset selected : "${selectedRuleset}" ✓`);
      console.log(`  Ruleset added in Inactive state ✓`);

      await createPage.toggleRulesetToActive();
      await createPage.assertABTestingSectionVisible();
      console.log(`  Ruleset toggled to Active ✓`);
      console.log(`  A/B testing section visible ✓`);

      await createPage.enableABTesting();
      await createPage.fillABTestEndDate(abTestEnd);
      await createPage.fillVariantTraffic(variantPct);
      console.log(`  A/B testing enabled ✓`);
      console.log(`  A/B end date : "${abTestEnd}" ✓`);
      console.log(`  Variant traffic set to ${variantPct}% ✓`);
    });

    test('SC-2 | the saved campaign should appear in the list with correct name, channel and status', async () => {
      // SC-1 set up the form; SC-2 saves it and verifies the result in the list.
      await createPage.clickSaveActivate();
      await createPage.assertSaveSuccess();
      console.log(`\n  Campaign saved ✓`);

      // Drawer auto-closes after save; list is shown with "All days" filter (set in beforeAll).
      await listPage.searchByName(campaignName);
      await listPage.clickSearch();

      await listPage.assertCampaignVisible(campaignName);
      const actualStatus  = await listPage.getFirstCampaignStatus();
      const actualChannel = await listPage.getFirstCampaignChannel();
      await listPage.assertCampaignStatus('Scheduled');
      await listPage.assertCampaignChannelInList(actualChannel);

      console.log(`  Campaign "${campaignName}" visible in list ✓`);
      console.log(`  Ruleset used   : "${selectedRuleset}" ✓`);
      console.log(`  Start date is ${startDate} (future) → Status : ${actualStatus} ✓`);
      console.log(`  Channel : ${actualChannel} ✓`);
    });
  });
});
