import { FrameLocator, Page, expect } from '@playwright/test';

export class RedirectionListPage {
  readonly frame: FrameLocator;

  constructor(private readonly page: Page) {
    this.frame = page.frameLocator('[data-test-id="cf-widget-renderer"]');
  }

  // ─── Sidebar ──────────────────────────────────────────────────────────────────

  async assertSidebarLinkVisible(): Promise<void> {
    await expect(
      this.frame.getByRole('link', { name: 'Redirection', exact: true })
    ).toBeVisible({ timeout: 20000 });
  }

  async getSidebarLinkText(): Promise<string> {
    return (
      (await this.frame
        .getByRole('link', { name: 'Redirection', exact: true })
        .textContent()) ?? ''
    ).trim();
  }

  // ─── Navigation ──────────────────────────────────────────────────────────────

  async navigate(): Promise<void> {
    await this.frame.getByRole('link', { name: 'Redirection', exact: true }).click();
    await this.assertPageVisible();
    const resetBtn = this.frame.getByRole('button', { name: 'Reset' });
    if (await resetBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await resetBtn.click();
    }
  }

  // ─── List page assertions ─────────────────────────────────────────────────────

  async assertPageVisible(): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { name: 'Redirection campaigns' })
    ).toBeVisible({ timeout: 10000 });
  }

  // ─── Create button ────────────────────────────────────────────────────────────

  async assertCreateButtonVisible(): Promise<void> {
    // nth(1) — the first Campaigns button is the sidebar nav link (role=button),
    // the second is the "+Campaigns" action button on the list page.
    await expect(
      this.frame.getByRole('button', { name: 'Campaigns' }).nth(1)
    ).toBeVisible({ timeout: 10000 });
  }

  async clickCreateButton(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Campaigns' }).nth(1).click();
  }

  // ─── Search & filter (TC-RD-021) ─────────────────────────────────────────────

  async setDateFilterAllDays(): Promise<void> {
    // Default filter is "Today" (by campaign start date) — campaigns with a
    // future start date (this suite standardises on 2030-xx-xx) are hidden by
    // the default filter unless it is widened to "All days" before searching.
    const dateCombo = this.frame.getByRole('combobox').filter({ hasText: 'Today' });
    if (await dateCombo.isVisible({ timeout: 2000 }).catch(() => false)) {
      await dateCombo.click();
      await this.frame.getByRole('option', { name: 'All days' }).click();
    }
  }

  async searchByName(name: string): Promise<void> {
    await this.frame.getByRole('textbox', { name: 'Enter campaign name' }).fill(name);
    await this.setDateFilterAllDays();
    await this.frame.getByRole('button', { name: 'Search' }).click();
  }

  // ─── List verification (TC-RD-021) ───────────────────────────────────────────

  async assertCampaignRowVisible(name: string): Promise<void> {
    await expect(
      this.frame.getByRole('cell', { name, exact: true })
    ).toBeVisible({ timeout: 10000 });
  }

  async getCampaignStatusCellText(name: string): Promise<string> {
    // Status vocabulary is fixed (from the Status filter menu): Live, Scheduled,
    // Paused, Draft, Expired. Scope the row via its name cell, then read the status.
    const row = this.frame.getByRole('row').filter({
      has: this.frame.getByRole('cell', { name, exact: true }),
    });
    const statusCell = row.getByRole('cell', { name: /^(Live|Scheduled|Paused|Draft|Expired)$/ });
    await expect(statusCell).toBeVisible({ timeout: 10000 });
    return (await statusCell.textContent())?.trim() ?? '';
  }

  async clickViewDetails(name: string): Promise<void> {
    const row = this.frame.getByRole('row').filter({
      has: this.frame.getByRole('cell', { name, exact: true }),
    });
    await row.getByRole('button', { name: 'View Details' }).click();
  }

  async assertViewDetailsHeading(name: string, expectedStatus: string): Promise<string> {
    const heading = this.frame.getByRole('heading', { name: `${name} ${expectedStatus}` });
    await expect(heading).toBeVisible({ timeout: 10000 });
    return (await heading.textContent())?.trim() ?? '';
  }

  async assertViewDetailsPathnames(defaultPath: string, redirectPath: string): Promise<void> {
    await expect(this.frame.getByRole('cell', { name: defaultPath, exact: true })).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByRole('cell', { name: redirectPath, exact: true })).toBeVisible({ timeout: 5000 });
  }

  async closeViewDetailsModal(): Promise<void> {
    await this.frame.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  }

  // ─── Edit Campaign (bug-fix verification: Draft → Edit → Save & Activate) ────

  async clickEditCampaign(name: string): Promise<void> {
    const row = this.frame.getByRole('row').filter({
      has: this.frame.getByRole('cell', { name, exact: true }),
    });
    await row.getByRole('button', { name: 'Edit Campaign' }).click();
  }
}
