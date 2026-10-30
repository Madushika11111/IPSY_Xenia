import { test, expect, Browser, Page } from '@playwright/test';
import { SpacePage } from '../../pages/SpacePage';
import { DashboardPage } from '../../pages/DashboardPage';
import { AdvancedSearchPage } from '../../pages/AdvancedSearchPage';
import { CampaignListPage } from '../../pages/CampaignListPage';
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

// ─── TC-021 to TC-025 | Xenia Dashboard ──────────────────────────────────────
// Navigate to the Xenia app ONCE in beforeAll — all tests share the same page.

test.describe('Xenia Dashboard', () => {
  let sharedPage: Page;
  let dashboardPage: DashboardPage;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const context = await browser.newContext({ storageState: 'auth/user.json' });
    sharedPage    = await context.newPage();

    const spacePage = new SpacePage(sharedPage, context);
    dashboardPage   = new DashboardPage(sharedPage);

    await spacePage.navigateToEntries(config.spaceId);
    await spacePage.openSpaceSidepanel();
    await spacePage.selectSpace(config.xeniaSpaceId, config.xeniaSpaceName);
    await spacePage.selectEnvironment('master');
    await spacePage.openAppsMenu(config.xeniaAppName);
    await spacePage.assertAppLoaded();
  });

  test.afterAll(async () => {
    await sharedPage.context().close();
  });

  // ── TC-021 ──────────────────────────────────────────────────────────────────

  test('TC-021 | should display the Dashboard page after navigating to the Xenia app', async () => {
    await dashboardPage.assertDashboardVisible();
  });

  // ── TC-022 ──────────────────────────────────────────────────────────────────

  test('TC-022 | should display all 5 status cards on the Dashboard (Live, Scheduled, Paused, Draft, Expired)', async () => {
    await dashboardPage.assertDashboardVisible();
    await dashboardPage.assertAllStatusCardsVisible();
  });

  // ── TC-023 ──────────────────────────────────────────────────────────────────

  test('TC-023 | should display the Live card with a visible total campaign count', async () => {
    await dashboardPage.assertDashboardVisible();
    await dashboardPage.openLiveCard();

    const counts = await dashboardPage.getAllCampaignLiveCounts();
    const sum    = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`\n  Live card total count: ${sum}`);
    expect(sum).toBeGreaterThanOrEqual(0);
  });

  // ── TC-024 ──────────────────────────────────────────────────────────────────

  test('TC-024 | should display all 6 campaign types with their individual live counts inside the Live card', async () => {
    await dashboardPage.assertDashboardVisible();
    await dashboardPage.openLiveCard();

    const counts = await dashboardPage.getAllCampaignLiveCounts();

    console.log('\n  Campaign Type            | Live Count');
    console.log('  ─────────────────────────────────────');
    for (const [type, count] of Object.entries(counts)) {
      console.log(`  ${type.padEnd(24)} | ${count}`);
      expect(count, `${type} live count should be a non-negative number`).toBeGreaterThanOrEqual(0);
    }

    for (const type of DashboardPage.CAMPAIGN_TYPES) {
      expect(
        Object.keys(counts),
        `Campaign type "${type}" should be listed in the Live card`
      ).toContain(type);
    }
  });

  // ── TC-025 ──────────────────────────────────────────────────────────────────

  test('TC-025 | should verify Live card total count equals sum of all campaign type live counts', async () => {
    await dashboardPage.assertDashboardVisible();
    await dashboardPage.openLiveCard();
    await dashboardPage.assertLiveCountMatchesSum();
  });

  // ── TC-026 ──────────────────────────────────────────────────────────────────

  test('TC-026 | should verify Scheduled card total count equals sum of all campaign type counts', async () => {
    await dashboardPage.assertDashboardVisible();
    await dashboardPage.openStatusCard('Scheduled');
    await dashboardPage.assertCountMatchesSum('Scheduled');
  });

  // ── TC-027 ──────────────────────────────────────────────────────────────────

  test('TC-027 | should verify Paused card total count equals sum of all campaign type counts', async () => {
    await dashboardPage.assertDashboardVisible();
    await dashboardPage.openStatusCard('Paused');
    await dashboardPage.assertCountMatchesSum('Paused');
  });

  // ── TC-028 ──────────────────────────────────────────────────────────────────

  test('TC-028 | should verify Draft card total count equals sum of all campaign type counts', async () => {
    await dashboardPage.assertDashboardVisible();
    await dashboardPage.openStatusCard('Draft');
    await dashboardPage.assertCountMatchesSum('Draft');
  });

  // ── TC-029 ──────────────────────────────────────────────────────────────────

  test('TC-029 | should verify Expired card total count equals sum of all campaign type counts', async () => {
    await dashboardPage.assertDashboardVisible();
    await dashboardPage.openStatusCard('Expired');
    await dashboardPage.assertCountMatchesSum('Expired');
  });

  // ── TC-030 ──────────────────────────────────────────────────────────────────

  test('TC-030 | should navigate to Advanced Search page when clicking "View all campaigns"', async () => {
    await dashboardPage.assertDashboardVisible();
    await dashboardPage.clickViewAllCampaigns();
    const advancedSearchPage = new AdvancedSearchPage(sharedPage);
    await advancedSearchPage.assertPageVisible();
  });

  // ── TC-031 ──────────────────────────────────────────────────────────────────
  // For each campaign type in the Live card:
  //   • Reads the count shown on the Dashboard link (e.g. "Personalization - 11" → 11)
  //   • Clicks the link and verifies the campaign list page loads with Live + All days filters
  //   • Asserts Results count = Dashboard count (data consistency)
  //   • Asserts Total campaigns count ≥ Results count (filtered is a subset of all)

  test('TC-031 | should navigate from each Live card campaign type link to the campaign page with correct filters and counts', async () => {
    await dashboardPage.navigateToDashboard();
    const campaignListPage = new CampaignListPage(sharedPage);

    for (const campaignType of DashboardPage.CAMPAIGN_TYPES) {
      await dashboardPage.openStatusCard('Live');

      const dashboardCount = await dashboardPage.getCampaignCount(campaignType, 'Live');
      console.log(`\n  ▶  ${campaignType} | Dashboard Live count: ${dashboardCount}`);

      await dashboardPage.clickLiveCampaignTypeLink(campaignType);
      await campaignListPage.assertPageVisible(campaignType);
      await campaignListPage.assertFilters('Live');
      await campaignListPage.assertCountsValid(dashboardCount);

      await campaignListPage.navigateToDashboard();
    }
  });

  // ── TC-032 ──────────────────────────────────────────────────────────────────

  test('TC-032 | should navigate from each Scheduled card campaign type link to the campaign page with correct filters and counts', async () => {
    await dashboardPage.navigateToDashboard();
    const campaignListPage = new CampaignListPage(sharedPage);

    for (const campaignType of DashboardPage.CAMPAIGN_TYPES) {
      await dashboardPage.openStatusCard('Scheduled');

      const dashboardCount = await dashboardPage.getCampaignCount(campaignType, 'Scheduled');
      console.log(`\n  ▶  ${campaignType} | Dashboard Scheduled count: ${dashboardCount}`);

      await dashboardPage.clickStatusCampaignTypeLink(campaignType, 'Scheduled');
      await campaignListPage.assertPageVisible(campaignType);
      await campaignListPage.assertFilters('Scheduled');
      await campaignListPage.assertCountsValid(dashboardCount);

      await campaignListPage.navigateToDashboard();
    }
  });

  // ── TC-033 ──────────────────────────────────────────────────────────────────

  test('TC-033 | should navigate from each Paused card campaign type link to the campaign page with correct filters and counts', async () => {
    await dashboardPage.navigateToDashboard();
    const campaignListPage = new CampaignListPage(sharedPage);

    for (const campaignType of DashboardPage.CAMPAIGN_TYPES) {
      await dashboardPage.openStatusCard('Paused');

      const dashboardCount = await dashboardPage.getCampaignCount(campaignType, 'Paused');
      console.log(`\n  ▶  ${campaignType} | Dashboard Paused count: ${dashboardCount}`);

      await dashboardPage.clickStatusCampaignTypeLink(campaignType, 'Paused');
      await campaignListPage.assertPageVisible(campaignType);
      await campaignListPage.assertFilters('Paused');
      await campaignListPage.assertCountsValid(dashboardCount);

      await campaignListPage.navigateToDashboard();
    }
  });

  // ── TC-034 ──────────────────────────────────────────────────────────────────

  test('TC-034 | should navigate from each Draft card campaign type link to the campaign page with correct filters and counts', async () => {
    await dashboardPage.navigateToDashboard();
    const campaignListPage = new CampaignListPage(sharedPage);

    for (const campaignType of DashboardPage.CAMPAIGN_TYPES) {
      await dashboardPage.openStatusCard('Draft');

      const dashboardCount = await dashboardPage.getCampaignCount(campaignType, 'Draft');
      console.log(`\n  ▶  ${campaignType} | Dashboard Draft count: ${dashboardCount}`);

      await dashboardPage.clickStatusCampaignTypeLink(campaignType, 'Draft');
      await campaignListPage.assertPageVisible(campaignType);
      await campaignListPage.assertFilters('Draft');
      await campaignListPage.assertCountsValid(dashboardCount);

      await campaignListPage.navigateToDashboard();
    }
  });

  // ── TC-035 ──────────────────────────────────────────────────────────────────

  test('TC-035 | should navigate from each Expired card campaign type link to the campaign page with correct filters and counts', async () => {
    await dashboardPage.navigateToDashboard();
    const campaignListPage = new CampaignListPage(sharedPage);

    for (const campaignType of DashboardPage.CAMPAIGN_TYPES) {
      await dashboardPage.openStatusCard('Expired');

      const dashboardCount = await dashboardPage.getCampaignCount(campaignType, 'Expired');
      console.log(`\n  ▶  ${campaignType} | Dashboard Expired count: ${dashboardCount}`);

      await dashboardPage.clickStatusCampaignTypeLink(campaignType, 'Expired');
      await campaignListPage.assertPageVisible(campaignType);
      await campaignListPage.assertFilters('Expired');
      await campaignListPage.assertCountsValid(dashboardCount);

      await campaignListPage.navigateToDashboard();
    }
  });
});
