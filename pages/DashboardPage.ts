import { FrameLocator, Locator, Page, expect } from '@playwright/test';

export class DashboardPage {
  private readonly frame: FrameLocator;

  static readonly STATUS_CARDS = ['Live', 'Scheduled', 'Paused', 'Draft', 'Expired'] as const;

  static readonly CAMPAIGN_TYPES = [
    'Personalization',
    'Content testing',
    'Marketing',
    'Redirection',
    'Gradual rollout',
    'Eligibility',
  ] as const;

  // Maps each status card name → the href query param used in its campaign links.
  static readonly STATUS_HREF: Record<string, string> = {
    Live:      'active-running',
    Scheduled: 'active-scheduled',
    Paused:    'inactive-running',
    Draft:     'draft',
    Expired:   'stopped',
  };

  constructor(page: Page) {
    this.frame = page.frameLocator('[data-test-id="cf-widget-renderer"]');
  }

  // ─── Dashboard ────────────────────────────────────────────────────────────────

  async assertDashboardVisible() {
    await expect(this.frame.getByRole('link', { name: 'Dashboard' })).toBeVisible({ timeout: 20000 });
    await expect(this.frame.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20000 });
  }

  // ─── Status Cards ─────────────────────────────────────────────────────────────

  async assertAllStatusCardsVisible() {
    for (const card of DashboardPage.STATUS_CARDS) {
      await expect(this.frame.getByRole('heading', { name: card })).toBeVisible();
    }
  }

  // ─── Generic status card methods ──────────────────────────────────────────────

  // Navigates up 3 levels from the h3 heading to reach the card container div.
  private getStatusCard(cardName: string): Locator {
    return this.frame
      .getByRole('heading', { name: cardName, exact: true, level: 3 })
      .locator('..')   // header-row div
      .locator('..')   // header div (contains badge)
      .locator('..');  // card container div
  }

  async openStatusCard(cardName: string): Promise<void> {
    const hrefParam = DashboardPage.STATUS_HREF[cardName];
    const firstLink = this.frame.locator(`a[href*="status=${hrefParam}"]`).first();
    if (await firstLink.isVisible()) return;
    await this.frame.getByRole('heading', { name: cardName, exact: true, level: 3 }).click();
    await expect(firstLink).toBeVisible({ timeout: 10000 });
  }

  async getCampaignCount(campaignType: string, cardName: string): Promise<number> {
    const hrefParam = DashboardPage.STATUS_HREF[cardName];
    const link = this.frame
      .locator(`a[href*="status=${hrefParam}"]`)
      .filter({ hasText: new RegExp(campaignType, 'i') });
    const text = await link.textContent() ?? '';
    const match = text.match(/-\s*(\d+)\s*$/);
    return match ? parseInt(match[1], 10) : 0;
  }

  async getAllCampaignCounts(cardName: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const type of DashboardPage.CAMPAIGN_TYPES) {
      counts[type] = await this.getCampaignCount(type, cardName);
    }
    return counts;
  }

  async assertCountMatchesSum(cardName: string): Promise<void> {
    const card = this.getStatusCard(cardName);
    const displayedTotal = (await card.locator('[data-slot="badge"]').textContent() ?? '?').trim();

    const counts = await this.getAllCampaignCounts(cardName);
    const sum    = Object.values(counts).reduce((a, b) => a + b, 0);

    console.log(`\n  ── ${cardName} Card Breakdown ──────────────`);
    console.log(`  Displayed total      : ${displayedTotal}`);
    console.log('  ─────────────────────────────────────────');
    for (const [type, count] of Object.entries(counts)) {
      console.log(`  ${type.padEnd(20)} : ${count}`);
    }
    console.log('  ─────────────────────────────────────────');
    console.log(`  Total (sum)          : ${sum}`);
    console.log('  ─────────────────────────────────────────\n');

    await expect(
      card.locator('[data-slot="badge"]'),
      `${cardName} card should display total ${sum} = sum of all campaign type counts`
    ).toHaveText(String(sum));
  }

  // ─── Navigation ───────────────────────────────────────────────────────────────

  async navigateToDashboard(): Promise<void> {
    await this.frame.getByRole('link', { name: 'Dashboard' }).click();
    await expect(
      this.frame.getByRole('heading', { name: 'Dashboard' })
    ).toBeVisible({ timeout: 20000 });
  }

  async clickViewAllCampaigns(): Promise<void> {
    await this.frame.getByRole('link', { name: 'View all campaigns' }).click();
  }

  async clickStatusCampaignTypeLink(campaignType: string, cardName: string): Promise<void> {
    const hrefParam = DashboardPage.STATUS_HREF[cardName];
    await this.frame
      .locator(`a[href*="status=${hrefParam}"]`)
      .filter({ hasText: new RegExp(campaignType, 'i') })
      .click();
  }

  async clickLiveCampaignTypeLink(campaignType: string): Promise<void> {
    return this.clickStatusCampaignTypeLink(campaignType, 'Live');
  }

  // ─── Live card — delegates to generic methods (backward compat) ───────────────

  async openLiveCard()                                         { return this.openStatusCard('Live'); }
  async getCampaignLiveCount(type: string)                     { return this.getCampaignCount(type, 'Live'); }
  async getAllCampaignLiveCounts()                              { return this.getAllCampaignCounts('Live'); }
  async assertLiveCountMatchesSum()                            { return this.assertCountMatchesSum('Live'); }
}
