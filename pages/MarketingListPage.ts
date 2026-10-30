import { Page, FrameLocator, Locator, expect } from '@playwright/test';

/**
 * MarketingListPage
 *
 * The app-level Marketing campaigns list (reached via the "Marketing" nav
 * link, same level as Gradual Rollout / Eligibility — NOT entry-scoped like
 * Content Personalization / Content Testing). Columns: checkbox, Name, Start
 * date & time (PST), End date & time (PST), Channels, Status, Entries,
 * Actions. Filters: Search by name, Search by ID (CMGMT ID / CID combined
 * field), Status (button, multi-select dropdown), Date (combobox).
 *
 * Confirmed live: the Pause/Resume/Stop/Delete confirmation-dialog pattern
 * (heading "<Action> Campaign?" + Cancel/<Action> buttons) is IDENTICAL to
 * Gradual Rollout's — same underlying list-page component. The one quirk is
 * the Stop dialog's body text, which uses typographic curly quotes (“ ”)
 * around the campaign name and "Expired", unlike every other dialog's
 * straight quotes (") — preserved exactly below.
 *
 * Row lookup uses an EXACT cell-name match rather than a text-containing row
 * filter: Marketing campaign names routinely collide as prefixes of each
 * other (e.g. "mar_cycle test" vs "mar_cycle test_schedule duplicate" —
 * same class of bug as the "CPDRAFT2SCHED"/"DRAFT" substring issue
 * documented elsewhere in this suite), which would make a substring-based
 * row filter hit Playwright strict-mode violations.
 */
export class MarketingListPage {
  private readonly frame: FrameLocator;

  constructor(private readonly page: Page) {
    this.frame = page.frameLocator('[data-test-id="cf-widget-renderer"]');
  }

  // ─── Navigation ──────────────────────────────────────────────────────────────

  async navigate(): Promise<void> {
    // Defensive: if a previous test left the wizard drawer open, close it first.
    const staleClose = this.frame.locator('.rs-drawer-header-close');
    if (await staleClose.isVisible({ timeout: 500 }).catch(() => false)) {
      await staleClose.click().catch(() => {});
    }
    await this.frame.getByRole('link', { name: 'Marketing', exact: true }).click({ timeout: 15000 });
    await this.assertPageVisible();
    await this.resetFilters();
  }

  async assertPageVisible(): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { name: 'Marketing campaigns' })
    ).toBeVisible({ timeout: 10000 });
  }

  /**
   * Clears the name/ID search fields and status filter via Reset, then
   * unconditionally forces the Date filter to "All days" and re-searches.
   * Confirmed live: the Date filter can start on an arbitrary persisted
   * Custom range rather than "Today" — any value other than "All days" can
   * silently hide a campaign whose start date falls outside that range.
   */
  async resetFilters(): Promise<void> {
    // Confirmed live: the host page's "API/Asset Bandwidth" usage-limit banner
    // can briefly overlap the widget iframe right after navigation and
    // intercept pointer events on the first click attempt — settle first.
    await this.page.waitForLoadState('networkidle').catch(() => {});
    const resetBtn = this.frame.getByRole('button', { name: 'Reset' });
    if (await resetBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await resetBtn.click({ timeout: 10000 });
    }
    await this.setDateFilterToAllDays();
  }

  async setDateFilterToAllDays(): Promise<void> {
    const dateFilter = this.frame.getByRole('combobox').first();
    const current = ((await dateFilter.textContent().catch(() => '')) ?? '').trim();
    if (current === 'All days') return;
    await expect(async () => {
      await dateFilter.click({ timeout: 5000 });
      await expect(this.frame.getByRole('option', { name: 'All days' })).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 15000 });
    await this.frame.getByRole('option', { name: 'All days' }).click({ timeout: 10000 });
    await this.clickSearch();
  }

  async clickSearch(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Search' }).click({ timeout: 10000 });
  }

  async searchByName(name: string): Promise<void> {
    await this.frame.getByRole('textbox', { name: 'Enter campaign name' }).fill(name);
    await this.clickSearch();
  }

  async searchById(id: string): Promise<void> {
    await this.frame.getByRole('textbox', { name: 'Enter CMGMT ID / CID' }).fill(id);
    await this.clickSearch();
  }

  // ─── List-level assertions ───────────────────────────────────────────────────

  async getTotalCampaignCount(): Promise<number> {
    const el = this.frame.getByText(/\d+ Campaigns/).first();
    await expect(el).toBeVisible({ timeout: 10000 });
    const text = (await el.textContent()) ?? '';
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  async getResultsCount(): Promise<number> {
    const el = this.frame.getByRole('heading', { name: /Results \(/ });
    await expect(el).toBeVisible({ timeout: 10000 });
    const text = (await el.textContent()) ?? '';
    const match = text.match(/\((\d+)\)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  async assertNoResults(): Promise<void> {
    await expect(
      this.frame.getByRole('cell', { name: 'No results.' })
    ).toBeVisible({ timeout: 10000 });
  }

  async assertCampaignVisible(name: string): Promise<void> {
    await expect(
      this.frame.getByRole('cell', { name, exact: true }).first()
    ).toBeVisible({ timeout: 15000 });
  }

  // Retries searchByName every 2s until the campaign cell appears (up to 30s) —
  // guards against backend search-index latency right after a save.
  async searchAndAssertVisible(name: string): Promise<void> {
    await expect.poll(
      async () => {
        await this.searchByName(name);
        return this.frame.getByRole('cell', { name, exact: true }).first().isVisible();
      },
      { timeout: 30000, intervals: [2000] }
    ).toBeTruthy();
  }

  // ─── Create button ───────────────────────────────────────────────────────────

  async clickCreateButton(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Campaigns' }).nth(1).click();
  }

  // ─── Row lookup (exact-name, collision-safe) ────────────────────────────────

  private row(name: string): Locator {
    return this.frame.getByRole('cell', { name, exact: true }).locator('xpath=ancestor::tr[1]');
  }

  async assertRowStatus(name: string, status: string): Promise<void> {
    await expect(this.row(name).getByText(status, { exact: true })).toBeVisible({ timeout: 10000 });
  }

  // ─── Row-scoped action buttons ───────────────────────────────────────────────

  async clickEditCampaign(name: string): Promise<void> {
    await this.row(name).getByRole('button', { name: 'Edit Campaign' }).click({ timeout: 15000 });
  }

  async clickCopyCampaign(name: string): Promise<void> {
    await this.row(name).getByRole('button', { name: 'Copy Campaign' }).click({ timeout: 15000 });
  }

  async clickPauseCampaign(name: string): Promise<void> {
    await this.row(name).getByRole('button', { name: 'Pause Campaign' }).click({ timeout: 15000 });
  }

  async clickResumeCampaign(name: string): Promise<void> {
    await this.row(name).getByRole('button', { name: 'Resume Campaign' }).click({ timeout: 15000 });
  }

  async clickStopCampaign(name: string): Promise<void> {
    await this.row(name).getByRole('button', { name: 'Stop Campaign' }).click({ timeout: 15000 });
  }

  async clickDeleteCampaign(name: string): Promise<void> {
    await this.row(name).getByRole('button', { name: 'Delete Campaign' }).click({ timeout: 15000 });
  }

  async isViewDetailsDisabled(name: string): Promise<boolean> {
    return this.row(name).getByRole('button', { name: 'View Details' }).isDisabled();
  }

  async isEditEnabled(name: string): Promise<boolean> {
    return this.row(name).getByRole('button', { name: 'Edit Campaign' }).isEnabled();
  }

  async isCopyEnabled(name: string): Promise<boolean> {
    return this.row(name).getByRole('button', { name: 'Copy Campaign' }).isEnabled();
  }

  async isPauseDisabled(name: string): Promise<boolean> {
    return this.row(name).getByRole('button', { name: 'Pause Campaign' }).isDisabled();
  }

  async isStopDisabled(name: string): Promise<boolean> {
    return this.row(name).getByRole('button', { name: 'Stop Campaign' }).isDisabled();
  }

  async isDeleteEnabled(name: string): Promise<boolean> {
    return this.row(name).getByRole('button', { name: 'Delete Campaign' }).isEnabled();
  }

  // ─── Confirmation dialogs ────────────────────────────────────────────────────
  // Confirmed live: shared "<Action> Campaign?" heading + Cancel/<Action>
  // button pattern across Pause, Resume, Stop and Delete.

  private confirmDialog(): Locator {
    return this.frame.getByRole('alertdialog');
  }

  async assertPauseDialog(name: string): Promise<void> {
    await expect(this.confirmDialog().getByRole('heading', { name: 'Pause Campaign?' })).toBeVisible({ timeout: 10000 });
    await expect(
      this.confirmDialog().getByText(`Are you sure you want to pause the campaign "${name}"?`)
    ).toBeVisible();
  }

  async confirmPause(): Promise<void> {
    await this.confirmDialog().getByRole('button', { name: 'Pause' }).click();
  }

  async cancelPause(): Promise<void> {
    await this.confirmDialog().getByRole('button', { name: 'Cancel' }).click();
  }

  async assertResumeDialog(name: string): Promise<void> {
    await expect(this.confirmDialog().getByRole('heading', { name: 'Resume Campaign?' })).toBeVisible({ timeout: 10000 });
    await expect(
      this.confirmDialog().getByText(`Are you sure you want to resume the campaign "${name}"?`)
    ).toBeVisible();
  }

  async confirmResume(): Promise<void> {
    await this.confirmDialog().getByRole('button', { name: 'Resume' }).click();
  }

  async cancelResume(): Promise<void> {
    await this.confirmDialog().getByRole('button', { name: 'Cancel' }).click();
  }

  /** Confirmed live: this body text uses curly quotes (“ ”), unlike Pause/Resume/Delete's straight quotes — preserved exactly. */
  async assertStopDialog(name: string): Promise<void> {
    await expect(this.confirmDialog().getByRole('heading', { name: 'Stop Campaign?' })).toBeVisible({ timeout: 10000 });
    await expect(
      this.confirmDialog().getByText(`The campaign “${name}” will be moved to the “Expired” status and will no longer be editable.`)
    ).toBeVisible();
  }

  async confirmStop(): Promise<void> {
    await this.confirmDialog().getByRole('button', { name: 'Stop' }).click();
  }

  async cancelStop(): Promise<void> {
    await this.confirmDialog().getByRole('button', { name: 'Cancel' }).click();
  }

  async assertDeleteDialog(name: string): Promise<void> {
    await expect(this.confirmDialog().getByRole('heading', { name: 'Delete Campaign?' })).toBeVisible({ timeout: 10000 });
    await expect(
      this.confirmDialog().getByText(`Are you sure you want to delete the campaign "${name}"? This action cannot be undone.`)
    ).toBeVisible();
  }

  async confirmDelete(): Promise<void> {
    await this.confirmDialog().getByRole('button', { name: 'Delete' }).click();
  }

  async cancelDelete(): Promise<void> {
    await this.confirmDialog().getByRole('button', { name: 'Cancel' }).click();
  }

  // ─── Toasts ──────────────────────────────────────────────────────────────────

  /** Success toasts render as a host-page alert OUTSIDE the Xenia iframe. */
  async getLastToastText(): Promise<string | null> {
    const alert = this.page.getByRole('alert').first();
    if (!(await alert.isVisible({ timeout: 8000 }).catch(() => false))) return null;
    return ((await alert.textContent()) ?? '').trim() || null;
  }
}
