import { test, expect, Browser, Page } from '@playwright/test';
import { SpacePage } from '../../pages/SpacePage';
import { PersonalizationCreatePage } from '../../pages/PersonalizationCreatePage';
import { CampaignListPage } from '../../pages/CampaignListPage';
import { config } from '../../config/config';
import { loadTestData } from '../../utils/helpers';
import { PersonalizationTestData } from '../../data/types';

// ─── Bug-fix verification: V1 server (master / Xenia-Version1_QAV1) ─────────
// Per explicit instruction, this suite targets the V1 server — the SAME
// environment the default Personalization automation suite
// (tests/personalization/p13n-creation.spec.ts) already uses — not the
// isolated qa/QAV2 deployment the Redirection bug-fix suite uses.
//
// Confirmed live: Personalization has the identical "content required for
// every rule" validation bug as Redirection — an Active ruleset with an
// Active rule that has no experience content (no control content / variant
// added) blocks Save & Activate with the exact same message text, "Add
// content for every rule".

const data = loadTestData<PersonalizationTestData>('personalization.json');

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

test.describe('Personalization Campaign — Bug-fix Verification (V1 server / master / Xenia-Version1_QAV1)', () => {
  let sharedPage: Page;
  let createPage: PersonalizationCreatePage;
  let listPage:   CampaignListPage;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const context  = await browser.newContext({ storageState: 'auth/user.json' });
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

  // ── TC-BF-P13N-001 ───────────────────────────────────────────────────────────
  // Mirrors Redirection's TC-BF-RD-001: Active ruleset + Active rule with no
  // content blocks Save & Activate; adding the missing content (a control
  // entry) then lets it succeed.

  test('TC-BF-P13N-001 | Draft campaign with a content-less rule, reopened via Edit, blocks Save & Activate with "Add content for every rule", then succeeds once content is added', async () => {
    const campaignName = `P13N_BF_${Date.now()}`;
    const startDate     = futureDateStr(30, 10, 0);
    const abEndDate     = futureDateStr(37, 10, 0);

    // ── Build and save as Draft (no content added) ───────────────────────────
    await listPage.clickCreateButton();
    await createPage.assertPageVisible();
    await createPage.fillName(campaignName);
    await createPage.fillStartDate(startDate);
    await createPage.selectChannel(data.channel);
    console.log(`  Campaign                 : "${campaignName}", ${startDate}, channel "${data.channel}" ✓`);

    await createPage.clickAddRuleset(data.channel);
    await createPage.assertAddRulesetDialogVisible();
    await createPage.selectRulesetTemplate(data.rulesetTemplate);
    await createPage.submitRulesetDrawer();
    await createPage.assertRulesetInList(data.channel, data.rulesetTemplate);
    console.log(`  Ruleset added            : "${data.rulesetTemplate}" (from template) ✓`);

    await createPage.toggleRulesetToActive(data.channel, data.rulesetTemplate);
    await createPage.assertRulesetActive(data.channel, data.rulesetTemplate);
    await createPage.waitForNotificationsToClear();
    console.log(`  Ruleset status           : Active ✓`);

    await createPage.clickAddRules(data.channel);
    await createPage.assertRuleDialogVisible();
    await createPage.clickAddRuleInList();
    await createPage.selectRuleTemplate(data.ruleTemplate);
    await createPage.fillRuleName(data.ruleTemplate);
    await createPage.submitRuleDrawer();
    await createPage.assertRuleInList(data.ruleTemplate);
    console.log(`  Rule added               : "${data.ruleTemplate}" (from template) ✓`);

    await createPage.toggleRuleToActive(data.ruleTemplate);
    await createPage.assertRuleActive(data.ruleTemplate);
    await createPage.waitForNotificationsToClear();
    console.log(`  Rule status              : Active ✓`);

    // Deliberately skip Phase 2c (Add contents) — rule is Active with zero content.
    console.log(`  Rule content             : none — "Add contents" never clicked ✓`);

    await createPage.clickContinueOnRuleDialog();
    console.log(`  Rule dialog              : Continue clicked without adding content ✓`);

    await createPage.waitForNotificationsToClear();
    await createPage.clickSaveDraft();
    const draftToast = await createPage.assertSaveSuccess();
    console.log(`  Save Campaign as Draft   : clicked — app message "${draftToast}" ✓`);

    // ── Verify it saved as Draft ──────────────────────────────────────────────
    await listPage.searchByName(campaignName);
    await listPage.assertCampaignVisible(campaignName);
    await listPage.assertRowStatus(campaignName, 'Draft');
    console.log(`  Draft save status        : "Draft" ✓`);

    // ── Reopen via Edit Campaign and try Save & Activate WITHOUT content ─────
    await listPage.clickEditCampaignForRow(campaignName);
    await createPage.assertEditDrawerVisible();
    console.log(`  Update campaign drawer   : reopened ✓`);

    await createPage.clickSaveActivate();
    console.log(`  Save & Activate clicked  : Active ruleset still has a content-less rule ✓`);

    const actualBlockMsg   = await createPage.getToastText();
    const expectedBlockMsg = 'Add content for every rule';
    console.log(`  Validation message`);
    console.log(`    Expected               : "${expectedBlockMsg}"`);
    console.log(`    Actual                 : "${actualBlockMsg}"`);
    expect(
      actualBlockMsg,
      `Content-less-rule validation mismatch\n  Expected : "${expectedBlockMsg}"\n  Actual   : "${actualBlockMsg}"`
    ).toBe(expectedBlockMsg);
    console.log(`    Match    : ✓`);

    // The "Update campaign" drawer stays open — save was blocked, not merely slow.
    await createPage.assertEditDrawerVisible();
    console.log(`  Update campaign drawer   : still open — Save & Activate was blocked ✓`);

    // Add the missing content — reopen the Rule dialog (now "View rules (1)")
    // and add control content + a variant (with A/B testing) to the existing
    // rule. Confirmed live: adding ONLY control content (deliberately omitting
    // a variant) left the "Add experience" dialog stuck open in this
    // Edit-campaign context — switching to the full control+variant+A/B
    // combination already proven reliable in p13n-creation.spec.ts.
    await createPage.waitForNotificationsToClear();
    await createPage.clickViewRules(data.channel);
    await createPage.assertRuleDialogVisible();
    await createPage.clickAddContents();
    await createPage.assertAddExperienceDialogVisible();
    await createPage.clickAddControlContents();
    await createPage.selectExistingEntry(data.controlEntry);
    await createPage.clickChooseVariant();
    await createPage.selectExistingEntry(data.variantEntry);
    await createPage.enableABTesting();
    await createPage.fillABTestEndDate(abEndDate);
    await createPage.fillPrimaryTraffic(data.variantTraffic);
    await createPage.submitExperience();
    console.log(`  Content added            : control "${data.controlEntry}", variant "${data.variantEntry}" @ ${data.variantTraffic}/${100 - data.variantTraffic} ✓`);

    await createPage.clickContinueOnRuleDialog();
    await createPage.waitForNotificationsToClear();
    console.log(`  Rule dialog              : Continue clicked with content added ✓`);

    // clickUpdateCampaign() (not clickSaveActivate()) — the "Update campaign"
    // drawer's submit click is documented as needing its own retry-until-closed
    // handling (see PersonalizationCreatePage.clickUpdateCampaign()).
    await createPage.clickUpdateCampaign();
    const actualSuccessMsg = await createPage.assertSaveSuccess();
    console.log(`  Save & Activate (retry)  : app message "${actualSuccessMsg}" ✓`);

    await listPage.searchByName(campaignName);
    await listPage.assertCampaignVisible(campaignName);
    await listPage.assertRowStatus(campaignName, 'Scheduled');
    console.log(`  Final campaign status    : "Scheduled" ✓`);
  });
});
