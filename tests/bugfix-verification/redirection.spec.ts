import { test, expect, Browser, Page } from '@playwright/test';
import { SpacePage } from '../../pages/SpacePage';
import { RedirectionListPage } from '../../pages/RedirectionListPage';
import { RedirectionCreatePage } from '../../pages/RedirectionCreatePage';
import { config } from '../../config/config';

// ─── Bug-fix verification environment ────────────────────────────────────────
// This suite targets a SEPARATE deployment used to verify a specific bug fix —
// NOT the default automation environment (master / Xenia-Version1_QAV1) the
// rest of the Redirection suite (tests/redirection/redirection.spec.ts) uses.
// Space is the same (config.xeniaSpaceId), but the environment and app differ.
const BUGFIX_ENV      = 'qa';
const BUGFIX_APP_NAME = 'Xenia-Version1_QAV2';

const shortId = () => Date.now().toString(36);

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

// ─── TC-BF-RD-001 | Redirection — "Add content for every rule" bug fix ───────
// One browser context and page for this file — the Xenia app (qa / QAV2) is
// opened once in beforeAll.

test.describe('Redirection Campaign — Bug-fix Verification (qa / Xenia-Version1_QAV2)', () => {
  let sharedPage: Page;
  let rdListPage:   RedirectionListPage;
  let rdCreatePage: RedirectionCreatePage;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const context  = await browser.newContext({ storageState: 'auth/user.json' });
    sharedPage     = await context.newPage();
    rdListPage     = new RedirectionListPage(sharedPage);
    rdCreatePage   = new RedirectionCreatePage(sharedPage);

    const spacePage = new SpacePage(sharedPage, context);
    await spacePage.navigateToEntries(config.spaceId);
    await spacePage.openSpaceSidepanel();
    await spacePage.selectSpace(config.xeniaSpaceId, config.xeniaSpaceName);
    await spacePage.selectEnvironment(BUGFIX_ENV);
    await spacePage.openAppsMenu(BUGFIX_APP_NAME);
    await spacePage.assertAppLoaded();

    // assertAppLoaded() only confirms the Contentful nav is mounted — the Xenia app
    // inside the iframe renders asynchronously and may still be showing a spinner.
    await sharedPage
      .frameLocator('[data-test-id="cf-widget-renderer"]')
      .getByRole('link', { name: 'Dashboard' })
      .waitFor({ state: 'visible', timeout: 60000 });
  });

  test.afterAll(async () => {
    await sharedPage.context().close();
  });

  // ── TC-BF-RD-001 ─────────────────────────────────────────────────────────────
  // Repro steps (as provided): create a campaign with a ruleset + rule, click
  // Continue on the Rule panel WITHOUT adding a Redirection URL, save it as
  // Draft, reopen it via Edit, then click Save & Activate — verify the
  // validation message displays correctly, then add the Redirection URL and
  // verify the campaign saves correctly to Scheduled (future start date).
  //
  // Confirmed live: the validation only fires when the RULESET is toggled
  // Active. With the ruleset left Inactive, Save & Activate silently succeeds
  // even with an incomplete rule — so this test explicitly activates the
  // ruleset as part of reproducing the bug scenario.

  test('TC-BF-RD-001 | Draft campaign with an Active ruleset and a content-less rule blocks Save & Activate with "Add content for every rule", then succeeds as Scheduled once the Redirection URL is added', async () => {
    const frame = sharedPage.frameLocator('[data-test-id="cf-widget-renderer"]');

    // 1. Start from a clean Redirection campaigns list page
    await rdListPage.navigate();
    console.log(`\n  Starting point           : Redirection campaigns page (qa / ${BUGFIX_APP_NAME}) ✓`);

    // 2. Open the Create campaign drawer
    await rdListPage.clickCreateButton();
    await rdCreatePage.assertCreateDrawerVisible();
    console.log(`  Create campaign drawer   : opened ✓`);

    // 3. Fill Campaign name — short & unique (long names don't display correctly in the UI)
    const campaignName = `RD_BF_${shortId()}`;
    await rdCreatePage.fillCampaignName(campaignName);
    console.log(`  Campaign name            : "${campaignName}" ✓`);

    // 4. Fill a valid future start date — drives the later Scheduled-status check
    const futureDate = '2030-01-01T12:00';
    await rdCreatePage.fillStartDateTime(futureDate);
    console.log(`  Start date & time        : "${futureDate}" (future) ✓`);

    // 5. Select a channel
    await rdCreatePage.selectChannelByName('Mobile');
    console.log(`  Channel                  : "Mobile" selected ✓`);

    // 6. Add a Ruleset from a template (data-agnostic — any template is valid)
    await rdCreatePage.clickAddRuleset();
    await rdCreatePage.assertAddRulesetPanelHeading();
    await rdCreatePage.openTemplateDropdown();
    const rulesetTemplate = await rdCreatePage.selectFirstAvailableTemplate();
    await rdCreatePage.submitAddRulesetPanel();
    await rdCreatePage.assertRulesetAddedToTable(rulesetTemplate);
    console.log(`  Ruleset added            : "${rulesetTemplate}" (from template) ✓`);

    // 7. Toggle the ruleset Inactive → Active
    await rdCreatePage.clickRulesetInactiveToggle();
    const activeStatus = await rdCreatePage.assertRulesetStatusActive();
    console.log(`  Ruleset status           : "${activeStatus}" ✓`);

    // 8. Add a rule under the ruleset from a template
    await rdCreatePage.clickCustomAddRule();
    await rdCreatePage.assertRulePanelHeading();
    await rdCreatePage.clickAddRuleInsideRulePanel();
    await rdCreatePage.assertAddRulePanelHeading();
    await rdCreatePage.openAddRulePanelTemplateDropdown();
    const ruleTemplate = await rdCreatePage.selectFirstAvailableRuleTemplate();
    await rdCreatePage.submitAddRulePanel();
    console.log(`  Rule added               : "${ruleTemplate}" (from template) ✓`);

    // 9. Rule row shows "+ Add Redirection URL" — no content added yet
    const addUrlLabel = await rdCreatePage.assertRuleRowAddRedirectionUrlButton();
    console.log(`  Rule content             : none — "${addUrlLabel.trim()}" ✓`);

    // 10. Click Continue on the Rule panel WITHOUT adding a Redirection URL
    await rdCreatePage.clickContinueRulePanel();
    await rdCreatePage.assertCreateDrawerVisible();
    console.log(`  Rule panel               : Continue clicked without adding content ✓`);

    // 11. Back on page 1 — Save Campaign as Draft
    await rdCreatePage.clickSaveDraft();
    console.log(`  Save Campaign as Draft   : clicked ✓`);

    // 12. Verify the campaign is saved and appears as Draft in the list
    await rdListPage.searchByName(campaignName);
    await rdListPage.assertCampaignRowVisible(campaignName);
    const draftStatus = await rdListPage.getCampaignStatusCellText(campaignName);
    console.log(`  Draft save status`);
    console.log(`    Expected               : "Draft"`);
    console.log(`    Actual                 : "${draftStatus}"`);
    expect(draftStatus, `Campaign status after Draft save mismatch\n  Expected : "Draft"\n  Actual   : "${draftStatus}"`).toBe('Draft');
    console.log(`    Match    : ✓`);

    // 13. Reopen the Draft campaign via Edit Campaign
    await rdListPage.clickEditCampaign(campaignName);
    await rdCreatePage.assertUpdateDrawerVisible();
    console.log(`  Update campaign drawer   : reopened ✓`);

    // 14. Click Save & Activate Campaign — ruleset is Active but its rule has no content
    await rdCreatePage.clickSaveActivate();
    console.log(`  Save & Activate clicked  : Active ruleset has a content-less rule ✓`);

    // 15. Capture the validation message live and compare to the expected text
    const actualBlockMsg   = await rdCreatePage.assertDraftValidationNotification();
    const expectedBlockMsg = 'Add content for every rule';
    console.log(`  Validation message`);
    console.log(`    Expected               : "${expectedBlockMsg}"`);
    console.log(`    Actual                 : "${actualBlockMsg}"`);
    expect(
      actualBlockMsg,
      `Incomplete-rule-content validation mismatch\n  Expected : "${expectedBlockMsg}"\n  Actual   : "${actualBlockMsg}"`
    ).toBe(expectedBlockMsg);
    console.log(`    Match    : ✓`);
    await rdCreatePage.dismissNotificationIfVisible();

    // 16. The drawer stays open, campaign remains unsaved/Draft — save was blocked
    await rdCreatePage.assertUpdateDrawerVisible();
    console.log(`  Update campaign drawer   : still open — Save & Activate was blocked ✓`);

    // 17. Add the missing content — a Redirection URL — to the rule
    await rdCreatePage.clickCustomAddRule();
    await rdCreatePage.assertRulePanelHeading();
    await rdCreatePage.clickAddRedirectionUrl();
    await rdCreatePage.assertAddExperiencePanelVisible();
    await rdCreatePage.fillDefaultPathname('/old-page');
    await rdCreatePage.fillRedirectionPathname('/new-page');
    await rdCreatePage.submitAddExperience();
    await rdCreatePage.assertViewRedirectionUrlButtonVisible();
    console.log(`  Redirection URL added    : /old-page → /new-page ✓`);

    // 18. Continue back to the Update campaign drawer
    await rdCreatePage.clickContinueRulePanel();
    await rdCreatePage.assertUpdateDrawerVisible();
    console.log(`  Rule panel               : Continue clicked with content added ✓`);

    // 19. Click Save & Activate Campaign again — should now succeed
    await rdCreatePage.clickSaveActivate();
    const actualSuccessMsg   = await rdCreatePage.assertDraftValidationNotification();
    const expectedSuccessMsg = 'Campaign update successfully';
    console.log(`  Save & Activate (retry)`);
    console.log(`    Expected               : "${expectedSuccessMsg}"`);
    console.log(`    Actual                 : "${actualSuccessMsg}"`);
    expect(
      actualSuccessMsg,
      `Save & Activate success message mismatch\n  Expected : "${expectedSuccessMsg}"\n  Actual   : "${actualSuccessMsg}"`
    ).toBe(expectedSuccessMsg);
    console.log(`    Match    : ✓`);

    // 20. Verify the campaign now shows Scheduled status in the list (future start date)
    await expect(frame.getByRole('heading', { name: 'Update campaign' })).not.toBeVisible({ timeout: 15000 });
    const finalStatus = await rdListPage.getCampaignStatusCellText(campaignName);
    console.log(`  Final campaign status`);
    console.log(`    Expected               : "Scheduled"`);
    console.log(`    Actual                 : "${finalStatus}"`);
    expect(
      finalStatus,
      `Final campaign status mismatch\n  Expected : "Scheduled"\n  Actual   : "${finalStatus}"`
    ).toBe('Scheduled');
    console.log(`    Match    : ✓`);
  });

  // ── TC-BF-RD-002 ─────────────────────────────────────────────────────────────
  // Confirmed live: leaving the ruleset Inactive does NOT bypass the content
  // requirement — it still blocks Save & Activate, but with a DIFFERENT message
  // than the Active-ruleset case ("Some rules have missing fields...", not
  // "Add content for every rule"). Once content is added the save succeeds even
  // with the ruleset still Inactive.

  test('TC-BF-RD-002 | Inactive ruleset with a content-less rule blocks Save & Activate with "Some rules have missing fields...", then succeeds once content is added', async () => {
    await rdListPage.navigate();
    await rdListPage.clickCreateButton();
    await rdCreatePage.assertCreateDrawerVisible();

    const campaignName = `RD_BF_${shortId()}`;
    await rdCreatePage.fillCampaignName(campaignName);
    await rdCreatePage.fillStartDateTime('2030-01-01T12:00');
    await rdCreatePage.selectChannelByName('Mobile');
    console.log(`  Campaign                 : "${campaignName}", Mobile, 2030-01-01T12:00 ✓`);

    await rdCreatePage.clickAddRuleset();
    await rdCreatePage.assertAddRulesetPanelHeading();
    await rdCreatePage.openTemplateDropdown();
    const rulesetTemplate = await rdCreatePage.selectFirstAvailableTemplate();
    await rdCreatePage.submitAddRulesetPanel();
    await rdCreatePage.assertRulesetAddedToTable(rulesetTemplate);

    const rulesetStatus = await rdCreatePage.assertRulesetStatusInactive();
    console.log(`  Ruleset added            : "${rulesetTemplate}" — status "${rulesetStatus}" (left Inactive) ✓`);

    await rdCreatePage.clickCustomAddRule();
    await rdCreatePage.assertRulePanelHeading();
    await rdCreatePage.clickAddRuleInsideRulePanel();
    await rdCreatePage.assertAddRulePanelHeading();
    await rdCreatePage.openAddRulePanelTemplateDropdown();
    const ruleTemplate = await rdCreatePage.selectFirstAvailableRuleTemplate();
    await rdCreatePage.submitAddRulePanel();
    console.log(`  Rule added               : "${ruleTemplate}" (content-less) ✓`);

    await rdCreatePage.clickContinueRulePanel();
    await rdCreatePage.clickSaveActivate();
    console.log(`  Save & Activate clicked  : Inactive ruleset has a content-less rule ✓`);

    const actualBlockMsg   = await rdCreatePage.assertDraftValidationNotification();
    const expectedBlockMsg = 'Some rules have missing fields. Please complete all required fields before proceeding.';
    console.log(`  Validation message`);
    console.log(`    Expected               : "${expectedBlockMsg}"`);
    console.log(`    Actual                 : "${actualBlockMsg}"`);
    expect(
      actualBlockMsg,
      `Inactive-ruleset validation mismatch\n  Expected : "${expectedBlockMsg}"\n  Actual   : "${actualBlockMsg}"`
    ).toBe(expectedBlockMsg);
    console.log(`    Match    : ✓`);
    await rdCreatePage.dismissNotificationIfVisible();
    await rdCreatePage.assertCreateDrawerVisible();
    console.log(`  Create campaign drawer   : still open — Save & Activate was blocked ✓`);

    await rdCreatePage.clickCustomAddRule();
    await rdCreatePage.assertRulePanelHeading();
    await rdCreatePage.clickAddRedirectionUrl();
    await rdCreatePage.assertAddExperiencePanelVisible();
    await rdCreatePage.fillDefaultPathname('/old-page');
    await rdCreatePage.fillRedirectionPathname('/new-page');
    await rdCreatePage.submitAddExperience();
    await rdCreatePage.assertViewRedirectionUrlButtonVisible();
    await rdCreatePage.clickContinueRulePanel();
    console.log(`  Redirection URL added    : /old-page → /new-page (ruleset still Inactive) ✓`);

    await rdCreatePage.clickSaveActivate();
    const actualSuccessMsg   = await rdCreatePage.assertDraftValidationNotification();
    const expectedSuccessMsg = 'Save campaign successfully';
    console.log(`  Save & Activate (retry)`);
    console.log(`    Expected               : "${expectedSuccessMsg}"`);
    console.log(`    Actual                 : "${actualSuccessMsg}"`);
    expect(
      actualSuccessMsg,
      `Save & Activate success message mismatch\n  Expected : "${expectedSuccessMsg}"\n  Actual   : "${actualSuccessMsg}"`
    ).toBe(expectedSuccessMsg);
    console.log(`    Match    : ✓`);

    await rdListPage.searchByName(campaignName);
    const finalStatus = await rdListPage.getCampaignStatusCellText(campaignName);
    console.log(`  Final campaign status`);
    console.log(`    Expected               : "Scheduled"`);
    console.log(`    Actual                 : "${finalStatus}"`);
    expect(finalStatus, `Final campaign status mismatch\n  Expected : "Scheduled"\n  Actual   : "${finalStatus}"`).toBe('Scheduled');
    console.log(`    Match    : ✓`);
  });

  // ── TC-BF-RD-003 ─────────────────────────────────────────────────────────────
  // Regression check: the pre-existing "Active ruleset, zero rules" validation
  // (already covered as TC-RD-022 in the default automation suite) must be
  // unaffected by this fix, in this same qa/QAV2 deployment.

  test('TC-BF-RD-003 | Active ruleset with zero rules blocks Save & Activate with "Add rule for every rule set"', async () => {
    await rdListPage.navigate();
    await rdListPage.clickCreateButton();
    await rdCreatePage.assertCreateDrawerVisible();

    const campaignName = `RD_BF_${shortId()}`;
    await rdCreatePage.fillCampaignName(campaignName);
    await rdCreatePage.fillStartDateTime('2030-01-01T12:00');
    await rdCreatePage.selectChannelByName('Mobile');

    await rdCreatePage.clickAddRuleset();
    await rdCreatePage.assertAddRulesetPanelHeading();
    await rdCreatePage.openTemplateDropdown();
    const rulesetTemplate = await rdCreatePage.selectFirstAvailableTemplate();
    await rdCreatePage.submitAddRulesetPanel();
    await rdCreatePage.assertRulesetAddedToTable(rulesetTemplate);

    await rdCreatePage.clickRulesetInactiveToggle();
    const activeStatus = await rdCreatePage.assertRulesetStatusActive();
    console.log(`  Ruleset                  : "${rulesetTemplate}" — status "${activeStatus}", zero rules ✓`);

    await rdCreatePage.clickSaveActivate();
    const actualMsg   = await rdCreatePage.assertDraftValidationNotification();
    const expectedMsg = 'Add rule for every rule set';
    console.log(`  Validation message`);
    console.log(`    Expected               : "${expectedMsg}"`);
    console.log(`    Actual                 : "${actualMsg}"`);
    expect(actualMsg, `Zero-rule validation mismatch\n  Expected : "${expectedMsg}"\n  Actual   : "${actualMsg}"`).toBe(expectedMsg);
    console.log(`    Match    : ✓`);
    await rdCreatePage.dismissNotificationIfVisible();

    await rdCreatePage.clickSaveDraft();
    console.log(`  Cleanup                  : saved as Draft ✓`);
  });

  // ── TC-BF-RD-004 ─────────────────────────────────────────────────────────────
  // Active ruleset with TWO rules, only one of which has content — confirms the
  // block still fires (partial completeness is not enough) and that it surfaces
  // the generic "Some rules..." message rather than the singular one.

  test('TC-BF-RD-004 | Active ruleset with one complete and one content-less rule blocks Save & Activate with "Some rules have missing fields..."', async () => {
    await rdListPage.navigate();
    await rdListPage.clickCreateButton();
    await rdCreatePage.assertCreateDrawerVisible();

    const campaignName = `RD_BF_${shortId()}`;
    await rdCreatePage.fillCampaignName(campaignName);
    await rdCreatePage.fillStartDateTime('2030-01-01T12:00');
    await rdCreatePage.selectChannelByName('Mobile');

    await rdCreatePage.clickAddRuleset();
    await rdCreatePage.assertAddRulesetPanelHeading();
    await rdCreatePage.openTemplateDropdown();
    const rulesetTemplate = await rdCreatePage.selectFirstAvailableTemplate();
    await rdCreatePage.submitAddRulesetPanel();
    await rdCreatePage.assertRulesetAddedToTable(rulesetTemplate);

    await rdCreatePage.clickRulesetInactiveToggle();
    await rdCreatePage.assertRulesetStatusActive();

    // Rule 1 — given content
    await rdCreatePage.clickCustomAddRule();
    await rdCreatePage.assertRulePanelHeading();
    await rdCreatePage.clickAddRuleInsideRulePanel();
    await rdCreatePage.assertAddRulePanelHeading();
    await rdCreatePage.openAddRulePanelTemplateDropdown();
    const rule1 = await rdCreatePage.selectFirstAvailableRuleTemplate();
    await rdCreatePage.submitAddRulePanel();
    await rdCreatePage.clickAddRedirectionUrl();
    await rdCreatePage.assertAddExperiencePanelVisible();
    await rdCreatePage.fillDefaultPathname('/old-page');
    await rdCreatePage.fillRedirectionPathname('/new-page');
    await rdCreatePage.submitAddExperience();
    await rdCreatePage.assertViewRedirectionUrlButtonVisible();
    console.log(`  Rule 1                   : "${rule1}" — content added ✓`);

    // Rule 2 — left content-less
    await rdCreatePage.clickAddRuleInsideRulePanel();
    await rdCreatePage.assertAddRulePanelHeading();
    await rdCreatePage.openAddRulePanelTemplateDropdown();
    const rule2 = await rdCreatePage.selectFirstAvailableRuleTemplate();
    await rdCreatePage.submitAddRulePanel();
    console.log(`  Rule 2                   : "${rule2}" — content-less ✓`);

    await rdCreatePage.clickContinueRulePanel();
    await rdCreatePage.clickSaveActivate();
    const actualMsg   = await rdCreatePage.assertDraftValidationNotification();
    const expectedMsg = 'Some rules have missing fields. Please complete all required fields before proceeding.';
    console.log(`  Validation message`);
    console.log(`    Expected               : "${expectedMsg}"`);
    console.log(`    Actual                 : "${actualMsg}"`);
    expect(actualMsg, `Partial-completeness validation mismatch\n  Expected : "${expectedMsg}"\n  Actual   : "${actualMsg}"`).toBe(expectedMsg);
    console.log(`    Match    : ✓`);
    await rdCreatePage.dismissNotificationIfVisible();

    await rdCreatePage.clickSaveDraft();
    console.log(`  Cleanup                  : saved as Draft ✓`);
  });

  // ── TC-BF-RD-005 ─────────────────────────────────────────────────────────────
  // Confirmed live: the Add experience panel does not allow "removing" content —
  // reopening it (View Redirection URL) and clearing both pathnames to blank is
  // rejected client-side, with inline "required" errors plus a page-level toast.

  test('TC-BF-RD-005 | Clearing an already-added Redirection URL back to blank is blocked client-side, not accepted as removed content', async () => {
    await rdListPage.navigate();
    await rdListPage.clickCreateButton();
    await rdCreatePage.assertCreateDrawerVisible();

    const campaignName = `RD_BF_${shortId()}`;
    await rdCreatePage.fillCampaignName(campaignName);
    await rdCreatePage.fillStartDateTime('2030-01-01T12:00');
    await rdCreatePage.selectChannelByName('Mobile');

    await rdCreatePage.clickAddRuleset();
    await rdCreatePage.assertAddRulesetPanelHeading();
    await rdCreatePage.openTemplateDropdown();
    const rulesetTemplate = await rdCreatePage.selectFirstAvailableTemplate();
    await rdCreatePage.submitAddRulesetPanel();
    await rdCreatePage.assertRulesetAddedToTable(rulesetTemplate);

    await rdCreatePage.clickCustomAddRule();
    await rdCreatePage.assertRulePanelHeading();
    await rdCreatePage.clickAddRuleInsideRulePanel();
    await rdCreatePage.assertAddRulePanelHeading();
    await rdCreatePage.openAddRulePanelTemplateDropdown();
    const ruleTemplate = await rdCreatePage.selectFirstAvailableRuleTemplate();
    await rdCreatePage.submitAddRulePanel();
    await rdCreatePage.clickAddRedirectionUrl();
    await rdCreatePage.assertAddExperiencePanelVisible();
    await rdCreatePage.fillDefaultPathname('/old-page');
    await rdCreatePage.fillRedirectionPathname('/new-page');
    await rdCreatePage.submitAddExperience();
    await rdCreatePage.assertViewRedirectionUrlButtonVisible();
    console.log(`  Rule                     : "${ruleTemplate}" — content added (/old-page → /new-page) ✓`);

    // Reopen the existing content and clear both pathnames to blank
    await rdCreatePage.clickViewRedirectionUrl();
    await rdCreatePage.assertAddExperiencePanelVisible();
    await rdCreatePage.fillDefaultPathname('');
    await rdCreatePage.fillRedirectionPathname('');
    await rdCreatePage.clickAddExperienceSubmitExpectingRejection();
    console.log(`  Pathnames cleared        : submitted blank ✓`);

    const validation = await rdCreatePage.assertPathnamesRequiredValidation();
    console.log(`  Client-side validation`);
    console.log(`    Default Pathname field : "${validation.defaultError}"`);
    console.log(`    Redirection field      : "${validation.redirectionError}"`);
    console.log(`    Toast                  : "${validation.toastMsg}"`);
    expect(validation.defaultError, 'Default Pathname field error mismatch').toBe('Default Pathname is required');
    expect(validation.redirectionError, 'Redirection Pathname field error mismatch').toBe('Redirection Pathname is required');
    expect(validation.toastMsg, 'Toast message mismatch').toBe('Please fill out both the Default pathname and Redirection pathname.');
    console.log(`    Match    : ✓ (content cannot be blanked back out — blocked, not removed)`);
    await rdCreatePage.dismissNotificationIfVisible();

    // Restore valid content and close out cleanly
    await rdCreatePage.fillDefaultPathname('/old-page');
    await rdCreatePage.fillRedirectionPathname('/new-page');
    await rdCreatePage.submitAddExperience();
    await rdCreatePage.assertViewRedirectionUrlButtonVisible();
    await rdCreatePage.clickContinueRulePanel();
    await rdCreatePage.clickSaveDraft();
    console.log(`  Cleanup                  : content restored, saved as Draft ✓`);
  });

  // ── TC-BF-RD-006 ─────────────────────────────────────────────────────────────
  // Confirmed live: toggling the ruleset Active → Inactive AFTER hitting the
  // block does NOT let Save & Activate succeed — the rule still lacks content,
  // so it blocks again (with the Inactive-ruleset message).

  test('TC-BF-RD-006 | Toggling the ruleset back to Inactive after a block does not bypass the content requirement', async () => {
    await rdListPage.navigate();
    await rdListPage.clickCreateButton();
    await rdCreatePage.assertCreateDrawerVisible();

    const campaignName = `RD_BF_${shortId()}`;
    await rdCreatePage.fillCampaignName(campaignName);
    await rdCreatePage.fillStartDateTime('2030-01-01T12:00');
    await rdCreatePage.selectChannelByName('Mobile');

    await rdCreatePage.clickAddRuleset();
    await rdCreatePage.assertAddRulesetPanelHeading();
    await rdCreatePage.openTemplateDropdown();
    const rulesetTemplate = await rdCreatePage.selectFirstAvailableTemplate();
    await rdCreatePage.submitAddRulesetPanel();
    await rdCreatePage.assertRulesetAddedToTable(rulesetTemplate);

    await rdCreatePage.clickRulesetInactiveToggle();
    await rdCreatePage.assertRulesetStatusActive();

    await rdCreatePage.clickCustomAddRule();
    await rdCreatePage.assertRulePanelHeading();
    await rdCreatePage.clickAddRuleInsideRulePanel();
    await rdCreatePage.assertAddRulePanelHeading();
    await rdCreatePage.openAddRulePanelTemplateDropdown();
    const ruleTemplate = await rdCreatePage.selectFirstAvailableRuleTemplate();
    await rdCreatePage.submitAddRulePanel();
    await rdCreatePage.clickContinueRulePanel();
    console.log(`  Setup                    : ruleset "${rulesetTemplate}" Active, rule "${ruleTemplate}" content-less ✓`);

    // Confirmed live (TC-BF-RD-001 vs this test, identical setup): the app is
    // NOT fully deterministic about which of its two block messages appears for
    // an Active ruleset with a single content-less rule — it usually says "Add
    // content for every rule" but has also been observed saying the generic
    // "Some rules have missing fields..." for the exact same setup. This test's
    // point is proving the later Inactive-toggle doesn't bypass the block, not
    // pinning down which of the two valid messages appears here, so accept
    // either rather than hardcoding one.
    const validFirstBlockMessages = [
      'Add content for every rule',
      'Some rules have missing fields. Please complete all required fields before proceeding.',
    ];
    await rdCreatePage.clickSaveActivate();
    const firstMsg = await rdCreatePage.assertDraftValidationNotification();
    console.log(`  First block              : "${firstMsg}" ✓`);
    expect(validFirstBlockMessages, `Unexpected first-block message: "${firstMsg}"`).toContain(firstMsg);
    await rdCreatePage.dismissNotificationIfVisible();

    // Toggle the ruleset back to Inactive — rule is still content-less
    await rdCreatePage.clickRulesetActiveToggle();
    const toggledStatus = await rdCreatePage.assertRulesetStatusInactive();
    console.log(`  Ruleset re-toggled       : "${toggledStatus}" ✓`);

    await rdCreatePage.clickSaveActivate();
    const secondMsg   = await rdCreatePage.assertDraftValidationNotification();
    const expectedMsg = 'Some rules have missing fields. Please complete all required fields before proceeding.';
    console.log(`  Second Save & Activate`);
    console.log(`    Expected               : "${expectedMsg}"`);
    console.log(`    Actual                 : "${secondMsg}"`);
    expect(
      secondMsg,
      `Post-toggle validation mismatch\n  Expected : "${expectedMsg}"\n  Actual   : "${secondMsg}"`
    ).toBe(expectedMsg);
    console.log(`    Match    : ✓ (still blocked — toggling ruleset state does not bypass the content requirement)`);
    await rdCreatePage.dismissNotificationIfVisible();

    await rdCreatePage.clickSaveDraft();
    console.log(`  Cleanup                  : saved as Draft ✓`);
  });

  // ── TC-BF-RD-007 ─────────────────────────────────────────────────────────────
  // Two channels, two rulesets: Mobile (Active, complete rule) + WEB (Active,
  // content-less rule) — confirms the validation checks ALL rulesets on the
  // campaign, not just the first one encountered.

  test('TC-BF-RD-007 | Two Active rulesets across two channels — one complete, one content-less — blocks Save & Activate with "Some rules have missing fields..."', async () => {
    await rdListPage.navigate();
    await rdListPage.clickCreateButton();
    await rdCreatePage.assertCreateDrawerVisible();

    const campaignName = `RD_BF_${shortId()}`;
    await rdCreatePage.fillCampaignName(campaignName);
    await rdCreatePage.fillStartDateTime('2030-01-01T12:00');
    await rdCreatePage.selectChannelByName('Mobile');
    await rdCreatePage.selectAdditionalChannelByName('WEB');
    console.log(`  Campaign                 : "${campaignName}" — channels Mobile + WEB ✓`);

    // Mobile ruleset — Active, complete rule
    await rdCreatePage.clickAddRulesetForChannel('Mobile');
    await rdCreatePage.assertAddRulesetPanelHeading();
    await rdCreatePage.openTemplateDropdown();
    const mobileRuleset = await rdCreatePage.selectFirstAvailableTemplate();
    await rdCreatePage.submitAddRulesetPanel();

    await rdCreatePage.toggleRulesetForChannel('Mobile');
    const mobileStatus = await rdCreatePage.getRulesetStatusTextForChannel('Mobile');
    console.log(`  Mobile ruleset           : "${mobileRuleset}" — status "${mobileStatus}" ✓`);

    await rdCreatePage.clickAddRulesInRulesetForChannel('Mobile');
    await rdCreatePage.assertRulePanelHeading();
    await rdCreatePage.clickAddRuleInsideRulePanel();
    await rdCreatePage.assertAddRulePanelHeading();
    await rdCreatePage.openAddRulePanelTemplateDropdown();
    const mobileRule = await rdCreatePage.selectFirstAvailableRuleTemplate();
    await rdCreatePage.submitAddRulePanel();
    await rdCreatePage.clickAddRedirectionUrl();
    await rdCreatePage.assertAddExperiencePanelVisible();
    await rdCreatePage.fillDefaultPathname('/old-page');
    await rdCreatePage.fillRedirectionPathname('/new-page');
    await rdCreatePage.submitAddExperience();
    await rdCreatePage.assertViewRedirectionUrlButtonVisible();
    await rdCreatePage.clickContinueRulePanel();
    console.log(`  Mobile rule              : "${mobileRule}" — content added ✓`);

    // WEB ruleset — Active, content-less rule
    await rdCreatePage.clickAddRulesetForChannel('WEB');
    await rdCreatePage.assertAddRulesetPanelHeading();
    await rdCreatePage.openTemplateDropdown();
    const webRuleset = await rdCreatePage.selectFirstAvailableTemplate();
    await rdCreatePage.submitAddRulesetPanel();

    await rdCreatePage.toggleRulesetForChannel('WEB');
    const webStatus = await rdCreatePage.getRulesetStatusTextForChannel('WEB');
    console.log(`  WEB ruleset              : "${webRuleset}" — status "${webStatus}" ✓`);

    await rdCreatePage.clickAddRulesInRulesetForChannel('WEB');
    await rdCreatePage.assertRulePanelHeading();
    await rdCreatePage.clickAddRuleInsideRulePanel();
    await rdCreatePage.assertAddRulePanelHeading();
    await rdCreatePage.openAddRulePanelTemplateDropdown();
    const webRule = await rdCreatePage.selectFirstAvailableRuleTemplate();
    await rdCreatePage.submitAddRulePanel();
    await rdCreatePage.clickContinueRulePanel();
    console.log(`  WEB rule                 : "${webRule}" — content-less ✓`);

    await rdCreatePage.clickSaveActivate();
    const actualMsg   = await rdCreatePage.assertDraftValidationNotification();
    const expectedMsg = 'Some rules have missing fields. Please complete all required fields before proceeding.';
    console.log(`  Validation message`);
    console.log(`    Expected               : "${expectedMsg}"`);
    console.log(`    Actual                 : "${actualMsg}"`);
    expect(
      actualMsg,
      `Multi-ruleset validation mismatch\n  Expected : "${expectedMsg}"\n  Actual   : "${actualMsg}"`
    ).toBe(expectedMsg);
    console.log(`    Match    : ✓ (validation checked every ruleset, not just the first)`);
    await rdCreatePage.dismissNotificationIfVisible();

    await rdCreatePage.clickSaveDraft();
    console.log(`  Cleanup                  : saved as Draft ✓`);
  });

  // ── TC-BF-RD-008 ─────────────────────────────────────────────────────────────
  // The validation must also apply when editing an ALREADY-Scheduled campaign
  // (not just on first activation): adding a new content-less rule and clicking
  // "Update Campaign" (same underlying action as Save & Activate) is blocked
  // the same way.

  test('TC-BF-RD-008 | Editing an already-Scheduled campaign to add a new content-less rule blocks "Update Campaign" the same way', async () => {
    await rdListPage.navigate();
    await rdListPage.clickCreateButton();
    await rdCreatePage.assertCreateDrawerVisible();

    const campaignName = `RD_BF_${shortId()}`;
    await rdCreatePage.fillCampaignName(campaignName);
    await rdCreatePage.fillStartDateTime('2030-01-01T12:00');
    await rdCreatePage.selectChannelByName('Mobile');

    await rdCreatePage.clickAddRuleset();
    await rdCreatePage.assertAddRulesetPanelHeading();
    await rdCreatePage.openTemplateDropdown();
    const rulesetTemplate = await rdCreatePage.selectFirstAvailableTemplate();
    await rdCreatePage.submitAddRulesetPanel();
    await rdCreatePage.assertRulesetAddedToTable(rulesetTemplate);

    await rdCreatePage.clickCustomAddRule();
    await rdCreatePage.assertRulePanelHeading();
    await rdCreatePage.clickAddRuleInsideRulePanel();
    await rdCreatePage.assertAddRulePanelHeading();
    await rdCreatePage.openAddRulePanelTemplateDropdown();
    const ruleTemplate = await rdCreatePage.selectFirstAvailableRuleTemplate();
    await rdCreatePage.submitAddRulePanel();
    await rdCreatePage.clickAddRedirectionUrl();
    await rdCreatePage.assertAddExperiencePanelVisible();
    await rdCreatePage.fillDefaultPathname('/old-page');
    await rdCreatePage.fillRedirectionPathname('/new-page');
    await rdCreatePage.submitAddExperience();
    await rdCreatePage.assertViewRedirectionUrlButtonVisible();
    await rdCreatePage.clickContinueRulePanel();

    // Get this campaign fully activated to Scheduled first (ruleset left Inactive
    // is enough once its one rule has content — confirmed in TC-BF-RD-002)
    await rdCreatePage.clickSaveActivate();
    await rdCreatePage.assertDraftValidationNotification();
    await rdCreatePage.dismissNotificationIfVisible();

    await rdListPage.searchByName(campaignName);
    const setupStatus = await rdListPage.getCampaignStatusCellText(campaignName);
    console.log(`  Setup                    : "${campaignName}" — "${ruleTemplate}" with content, status "${setupStatus}" ✓`);
    expect(setupStatus, 'Setup campaign must reach Scheduled before editing it').toBe('Scheduled');

    // Reopen it via Edit Campaign and add a NEW content-less rule
    await rdListPage.clickEditCampaign(campaignName);
    await rdCreatePage.assertUpdateDrawerVisible();
    console.log(`  Update campaign drawer   : reopened ✓`);

    await rdCreatePage.clickCustomAddRule();
    await rdCreatePage.assertRulePanelHeading();
    await rdCreatePage.clickAddRuleInsideRulePanel();
    await rdCreatePage.assertAddRulePanelHeading();
    await rdCreatePage.openAddRulePanelTemplateDropdown();
    const newRule = await rdCreatePage.selectFirstAvailableRuleTemplate();
    await rdCreatePage.submitAddRulePanel();
    await rdCreatePage.clickContinueRulePanel();
    console.log(`  New rule added           : "${newRule}" — content-less ✓`);

    // "Update Campaign" (Scheduled-campaign edit) uses the same submit action as
    // Save & Activate — clickSaveActivate() targets that same testid.
    await rdCreatePage.clickSaveActivate();
    const actualMsg   = await rdCreatePage.assertDraftValidationNotification();
    const expectedMsg = 'Some rules have missing fields. Please complete all required fields before proceeding.';
    console.log(`  Update Campaign clicked`);
    console.log(`    Expected               : "${expectedMsg}"`);
    console.log(`    Actual                 : "${actualMsg}"`);
    expect(
      actualMsg,
      `Mid-lifecycle-edit validation mismatch\n  Expected : "${expectedMsg}"\n  Actual   : "${actualMsg}"`
    ).toBe(expectedMsg);
    console.log(`    Match    : ✓ (validation applies to editing an already-Scheduled campaign, not just first activation)`);
    await rdCreatePage.dismissNotificationIfVisible();

    await rdCreatePage.assertUpdateDrawerVisible();
    await rdCreatePage.closeDrawer();
    console.log(`  Cleanup                  : drawer closed without saving the incomplete edit ✓`);
  });
});
