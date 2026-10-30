import { FrameLocator, Page, expect } from '@playwright/test';

/**
 * ContentTestingListPage
 *
 * The global `/ab-testing` list page — unlike campaign CREATION (entry-scoped,
 * see ContentTestingCreatePage.ts), row-level lifecycle actions (Pause/Resume/
 * Stop/Delete/Copy/Share/View Details) are available here with the exact same
 * structure as GradualRolloutListPage.ts: same columns, same status-gated
 * disabled states, same in-iframe confirmation-dialog pattern (heading text,
 * Cancel/confirm button labels) — confirmed live. Only the success-notification
 * selectors below are a best-informed starting guess (mirrored from GR's
 * per-action split) rather than independently pre-confirmed; verify against a
 * real run and adjust if the assertion fails.
 */
export class ContentTestingListPage {
  private readonly frame: FrameLocator;

  constructor(private readonly page: Page) {
    this.frame = page.frameLocator('[data-test-id="cf-widget-renderer"]');
  }

  // ─── Navigation ──────────────────────────────────────────────────────────────

  async navigate(): Promise<void> {
    await this.frame.getByRole('link', { name: 'Content testing', exact: true }).click();
    await this.assertPageVisible();
    await this.resetFilters();
  }

  async assertPageVisible(): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { name: 'Content testing campaigns' })
    ).toBeVisible({ timeout: 10000 });
  }

  async resetFilters(): Promise<void> {
    const resetBtn = this.frame.getByRole('button', { name: 'Reset' });
    if (await resetBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await resetBtn.click();
    }
  }

  // ─── Search ──────────────────────────────────────────────────────────────────

  async searchByName(name: string): Promise<void> {
    await this.frame.getByRole('textbox', { name: 'Enter campaign name' }).fill(name);
    await this.frame.getByRole('button', { name: 'Search' }).click();
  }

  async assertCampaignVisible(name: string): Promise<void> {
    await expect(
      this.frame.getByRole('cell', { name, exact: true }).first()
    ).toBeVisible({ timeout: 10000 });
  }

  async assertNoResults(): Promise<void> {
    await expect(
      this.frame.getByRole('cell', { name: 'No results.' })
    ).toBeVisible({ timeout: 10000 });
  }

  /** Returns '—' (not the literal status text) when no row is present — used by cleanup to exit quietly. */
  async getListRowStatus(): Promise<string> {
    for (const s of ['Scheduled', 'Live', 'Paused', 'Expired', 'Draft']) {
      if (await this.frame.getByRole('cell', { name: s, exact: true }).isVisible().catch(() => false)) {
        return s;
      }
    }
    return '—';
  }

  /**
   * Searches fresh and polls until the row's status matches. A single
   * immediate read right after Pause/Resume/Stop can race the UI update (the
   * toast dismisses before the status cell re-renders) — confirmed live, a
   * one-shot getListRowStatus() call read the pre-transition status while a
   * check moments later already showed the settled one. Polling avoids that.
   */
  async assertRowStatus(name: string, status: string): Promise<void> {
    await expect.poll(
      async () => {
        await this.searchByName(name);
        return this.getListRowStatus();
      },
      { timeout: 10000, intervals: [500, 1000] }
    ).toBe(status);
  }

  // ─── Pause ───────────────────────────────────────────────────────────────────

  async clickPauseCampaign(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Pause Campaign' }).first().click();
  }

  async assertPauseDialog(): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { name: 'Pause Campaign?' })
    ).toBeVisible({ timeout: 5000 });
  }

  async confirmPause(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Pause' }).click();
    await expect(this.page.locator('[data-test-id="cf-ui-notification"]').last()).toBeVisible({ timeout: 10000 });
    await this.page.locator('[data-test-id="cf-ui-notification"]').last().click();
  }

  async cancelPause(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Cancel' }).click();
  }

  // ─── Resume ──────────────────────────────────────────────────────────────────

  async clickResumeCampaign(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Resume Campaign' }).first().click();
  }

  async assertResumeDialog(): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { name: 'Resume Campaign?' })
    ).toBeVisible({ timeout: 5000 });
  }

  async confirmResume(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Resume' }).click();
    await expect(this.page.locator('[data-test-id="cf-ui-notification"]').last()).toBeVisible({ timeout: 10000 });
    await this.page.locator('[data-test-id="cf-ui-notification"]').last().click();
  }

  async cancelResume(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Cancel' }).click();
  }

  // ─── Stop ────────────────────────────────────────────────────────────────────

  async clickStopCampaign(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Stop Campaign' }).first().click();
  }

  /** Confirmed live text: 'The campaign "<name>" will be moved to the "Expired" status and will no longer be editable.' */
  async assertStopDialog(): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { name: 'Stop Campaign?' })
    ).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByText(/will be moved to the .Expired. status/)).toBeVisible();
  }

  async confirmStop(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Stop' }).click();
    await expect(this.page.locator('[data-test-id="cf-ui-paragraph"]').first()).toBeVisible({ timeout: 10000 });
    await this.page.locator('[data-test-id="cf-ui-paragraph"]').first().click();
  }

  async cancelStop(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Cancel' }).click();
  }

  // ─── Delete (Expired/Draft campaigns only) ──────────────────────────────────

  async clickDeleteCampaign(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Delete Campaign' }).first().click();
  }

  /** Confirmed live text: 'Are you sure you want to delete the campaign "<name>"? This action cannot be undone.' */
  async assertDeleteDialog(): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { name: 'Delete Campaign?' })
    ).toBeVisible({ timeout: 5000 });
  }

  async confirmDelete(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Delete' }).click();
    await expect(this.page.locator('[data-test-id="cf-ui-paragraph"]').first()).toBeVisible({ timeout: 10000 });
    await this.page.locator('[data-test-id="cf-ui-paragraph"]').first().click();
  }

  async cancelDelete(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Cancel' }).click();
  }
}
