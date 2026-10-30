import { FrameLocator, Page, expect } from '@playwright/test';

export class ChannelPage {
  private readonly frame: FrameLocator;

  constructor(private readonly page: Page) {
    this.frame = page.frameLocator('[data-test-id="cf-widget-renderer"]');
  }

  private channelsHeading() {
    return this.frame
      .getByRole('heading', { name: /^Channels\b/i })
      .first()
      .or(this.frame.locator('h1, h2, h3').filter({ hasText: /^Channels\b/i }).first());
  }

  private addChannelTrigger() {
    return this.frame.getByTestId('add-button').or(this.frame.getByText('Add channel', { exact: true }));
  }

  private configurationButton() {
    return this.frame.getByRole('button', { name: 'Configuration' });
  }

  private async waitForAppNavReady(timeout = 60000): Promise<void> {
    await expect(
      this.frame.getByRole('link', { name: 'Dashboard' }).first()
    ).toBeVisible({ timeout });
  }

  // ─── Navigation ──────────────────────────────────────────────────────────────

  async assertConfigurationVisible(): Promise<void> {
    await this.waitForAppNavReady();
    await expect(
      this.configurationButton()
    ).toBeVisible({ timeout: 30000 });
  }

  // async clickConfiguration(): Promise<void> {
  //   await this.assertConfigurationVisible();
  //   const channelsVisible = await this.frame
  //     .getByRole('link', { name: 'Channels' })
  //     .isVisible()
  //     .catch(() => false);
  //   if (!channelsVisible) {
  //     await this.frame.getByRole('button', { name: 'Configuration' }).click();
  //   }
  // }

  async clickConfiguration(): Promise<void> {
    await this.assertConfigurationVisible();

    const configButton = this.configurationButton();
    const channelsLink = this.frame.getByRole('link', { name: 'Channels', exact: true });
    const channelsAlreadyVisible = await channelsLink.isVisible().catch(() => false);
    if (!channelsAlreadyVisible) {
      await configButton.click();
      await expect(channelsLink).toBeVisible({ timeout: 10000 });
    } else {
      await expect(channelsLink).toBeVisible({ timeout: 5000 });
    }
  }

  async assertChannelsLinkVisible(): Promise<void> {
    await this.waitForAppNavReady();
    await expect(
      this.frame.getByRole('link', { name: 'Channels', exact: true })
    ).toBeVisible({ timeout: 10000 });
  }

  async clickChannels(): Promise<void> {
    const channelsLink = this.frame.locator('a[href="/channels"]').first();
    await expect(channelsLink).toBeVisible({ timeout: 10000 });
    await channelsLink.scrollIntoViewIfNeeded();
    await channelsLink.click({ timeout: 5000 }).catch(async () => {
      // Fallback to DOM click when pointer events are intercepted by animated nav layers
      await channelsLink.dispatchEvent('click');
    });
    await this.assertPageVisible();
  }

  async navigate(): Promise<void> {
    await this.clickConfiguration();
    await this.assertChannelsLinkVisible();
    await this.clickChannels();
    await this.assertPageVisible();
  }

  async assertPageVisible(): Promise<void> {
    try {
      await expect(this.channelsHeading()).toBeVisible({ timeout: 45000 });
      return;
    } catch {
      // Some loads render table/search first; accept those as page-ready signals.
    }

    await expect(this.frame.getByRole('button', { name: 'Go' })).toBeVisible({ timeout: 20000 });
    await expect(this.frame.getByRole('columnheader', { name: 'No' })).toBeVisible({ timeout: 20000 });
  }

  async getAndLogPageHeading(): Promise<string> {
    const el = this.channelsHeading();
    await expect(el).toBeVisible({ timeout: 60000 });
    return (await el.textContent() ?? '').trim();
  }

  async getChannelCount(): Promise<number> {
    await this.assertPageVisible();

    const heading = this.channelsHeading();
    const headingVisible = await heading.isVisible().catch(() => false);
    if (headingVisible) {
      const headingText = await heading.textContent() ?? '';
      const headingMatch = headingText.match(/Channels\s*-\s*(\d+)/i);
      if (headingMatch) {
        return parseInt(headingMatch[1], 10);
      }
    }

    // New UI variants omit count in the heading; fallback to row numbering on last page.
    await this.navigateToLastPage();
    return this.getLastRowNumberOnPage();
  }

  // ─── Page structure ──────────────────────────────────────────────────────────

  async assertAddButtonVisible(): Promise<void> {
    await expect(this.addChannelTrigger()).toBeVisible({ timeout: 10000 });
  }

  // ─── Create modal ────────────────────────────────────────────────────────────

  async clickAddChannel(): Promise<void> {
    await this.addChannelTrigger().click();
  }

  async assertCreateModalHeading(): Promise<void> {
    await expect(this.frame.getByText('Add', { exact: true })).toBeVisible({ timeout: 5000 });
  }

  async assertCreateModalFields(): Promise<void> {
    await expect(this.frame.getByText('Channel name *')).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByText('Channel type *')).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByTestId('save-modal-submit')).toBeVisible({ timeout: 5000 });
  }

  async closeModal(): Promise<void> {
    await this.frame.getByLabel('Close').click();
    await this.assertPageVisible();
  }

  // ─── Submit with notification wait ───────────────────────────────────────────

  async submitAndWait(): Promise<string> {
    await this.frame.getByTestId('save-modal-submit').click();
    const notification = this.page.locator('[data-test-id="cf-ui-paragraph"]');
    await expect(notification).toBeVisible({ timeout: 10000 });
    const msg = (await notification.textContent() ?? '').trim();
    await expect(this.frame.getByTestId('save-modal-submit')).not.toBeVisible({ timeout: 10000 });
    return msg;
  }

  // ─── Pagination ──────────────────────────────────────────────────────────────

  async navigateToFirstPage(): Promise<void> {
    await this.assertPageVisible();
    try {
      await this.frame.getByRole('button', { name: 'First' }).click({ timeout: 5000 });
      await expect(
        this.frame.locator('tbody tr td:nth-child(1)').first()
      ).toBeVisible({ timeout: 10000 });
    } catch {
      // Already on first page
    }
  }

  async navigateToLastPage(): Promise<void> {
    await this.assertPageVisible();
    try {
      // 10 s covers the post-filter-submission delay before pagination buttons render;
      // single-page results (no "Last" button) will naturally exhaust this timeout.
      await this.frame.getByRole('button', { name: 'Last' }).click({ timeout: 10000 });
      await this.assertPageVisible();
    } catch {
      // Already on last page or single-page result
    }
  }

  async waitForNotificationGone(): Promise<void> {
    await this.page.locator('[data-test-id="cf-ui-paragraph"]')
      .waitFor({ state: 'hidden', timeout: 15000 })
      .catch(() => {});
  }

  // ─── Row helpers ─────────────────────────────────────────────────────────────

  private channelRow(channelName: string) {
    return this.frame.locator('tr').filter({ hasText: channelName });
  }

  // ─── Channel list assertions ─────────────────────────────────────────────────

  async assertChannelInList(name: string): Promise<void> {
    await expect(
      this.frame.getByRole('cell', { name, exact: true })
    ).toBeVisible({ timeout: 10000 });
  }

  async assertChannelType(channelName: string, type: string): Promise<void> {
    await expect(
      this.channelRow(channelName).getByText(type, { exact: true })
    ).toBeVisible({ timeout: 10000 });
  }

  async assertChannelStatus(channelName: string, status: 'Active' | 'Inactive'): Promise<void> {
    await expect(
      this.channelRow(channelName).locator('td').getByText(status, { exact: true })
    ).toBeVisible({ timeout: 10000 });
  }

  async assertActivateToggleVisible(channelName: string): Promise<void> {
    await expect(
      this.channelRow(channelName).getByTestId('activate')
    ).toBeVisible({ timeout: 5000 });
  }

  async assertDeactivateToggleVisible(channelName: string): Promise<void> {
    await expect(
      this.channelRow(channelName).getByTestId('deactivate')
    ).toBeVisible({ timeout: 5000 });
  }

  // ─── Toggle (Activate / Deactivate) ─────────────────────────────────────────

  async clickActivateToggle(channelName: string): Promise<void> {
    await this.channelRow(channelName).getByTestId('activate').click();
  }

  async clickDeactivateToggle(channelName: string): Promise<void> {
    await this.channelRow(channelName).getByTestId('deactivate').click();
  }

  async assertToggleConfirmDialog(): Promise<void> {
    await expect(
      this.page.locator('[data-test-id="cf-ui-modal-content"]')
    ).toBeVisible({ timeout: 5000 });
    await expect(
      this.page.locator('[data-test-id="cf-ui-modal-confirm-cancel-button"]')
    ).toBeVisible();
    await expect(
      this.page.locator('[data-test-id="cf-ui-modal-confirm-confirm-button"]')
    ).toBeVisible();
  }

  async cancelToggle(): Promise<void> {
    await this.page.locator('[data-test-id="cf-ui-modal-confirm-cancel-button"]').click();
  }

  async confirmActivate(): Promise<void> {
    await this.page.locator('[data-test-id="cf-ui-modal-confirm-confirm-button"]').click();
    await expect(
      this.page.locator('[data-test-id="cf-ui-paragraph"]')
    ).toBeVisible({ timeout: 10000 });
    await expect(
      this.page.locator('[data-test-id="cf-ui-modal-content"]')
    ).not.toBeVisible({ timeout: 15000 });
  }

  async confirmDeactivate(): Promise<void> {
    await this.page.locator('[data-test-id="cf-ui-modal-confirm-confirm-button"]').click();
    await expect(
      this.page.locator('[data-test-id="cf-ui-paragraph"]')
    ).toBeVisible({ timeout: 10000 });
  }

  // ─── Channel ID ───────────────────────────────────────────────────────────────

  async getChannelId(channelName: string): Promise<string> {
    const td = this.channelRow(channelName).locator('td:nth-child(2)').first();
    await expect(td).toBeVisible({ timeout: 5000 });
    // UUID is rendered inside a readonly <input> — use inputValue()
    const input = td.locator('input').first();
    const inputCount = await input.count();
    if (inputCount > 0) {
      const val = await input.inputValue().catch(() => '');
      if (val) return val.trim();
      const attr = await input.getAttribute('value').catch(() => null);
      if (attr) return attr.trim();
    }
    const ariaLabel = await td.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();
    return (await td.textContent() ?? '').trim();
  }

  async assertCopyButtonVisible(channelName: string): Promise<void> {
    const idCell = this.channelRow(channelName).locator('td:nth-child(2)').first();
    // Copy button is inside a generic div within the ID cell
    await expect(
      idCell.locator('button').first()
    ).toBeVisible({ timeout: 5000 });
  }

  async clickCopyChannelId(channelName: string): Promise<void> {
    const idCell = this.channelRow(channelName).locator('td:nth-child(2)').first();
    await idCell.locator('button').first().click();
  }

  // ─── Form fields ─────────────────────────────────────────────────────────────

  async fillChannelName(name: string): Promise<void> {
    // Target by name attribute to avoid strict-mode violation when the filter panel is also open
    await this.frame.locator('input[name="channelName"]').click();
    await this.frame.locator('input[name="channelName"]').fill(name);
  }

  async selectChannelType(type: 'PUSH' | 'PULL'): Promise<void> {
    await this.frame.getByTestId('channel-type').selectOption(type);
  }

  async submitForm(): Promise<void> {
    await this.frame.getByTestId('save-modal-submit').click();
  }

  // ─── Validation errors ───────────────────────────────────────────────────────

  async getChannelNameValidationError(): Promise<string> {
    const el = this.frame.getByText('Please enter channel name');
    await expect(el).toBeVisible({ timeout: 5000 });
    return (await el.textContent() ?? '').trim();
  }

  async getChannelTypeValidationError(): Promise<string> {
    const el = this.frame.getByText('Please select channel type');
    await expect(el).toBeVisible({ timeout: 5000 });
    return (await el.textContent() ?? '').trim();
  }

  // ─── Search / Filter ─────────────────────────────────────────────────────────

  async openSearchFilter(): Promise<void> {
    await this.frame.getByTestId('advanced-filter').locator('i').click();
  }

  async ensureSearchPanelOpen(): Promise<void> {
    const isOpen = await this.frame.getByTestId('submit').isVisible().catch(() => false);
    if (!isOpen) {
      await this.frame.getByTestId('advanced-filter').locator('i').click();
      await expect(this.frame.getByTestId('submit')).toBeVisible({ timeout: 5000 });
    }
  }

  async assertSearchPanelVisible(): Promise<void> {
    await expect(this.frame.getByText('Channel name')).toBeVisible({ timeout: 5000 });
    await expect(this.frame.locator('label').filter({ hasText: 'Status' })).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByTestId('submit')).toBeVisible({ timeout: 5000 });
  }

  async assertDefaultStatusIsAllChannels(): Promise<void> {
    await expect(this.frame.getByText('All channels')).toBeVisible({ timeout: 5000 });
  }

  async fillChannelNameFilter(name: string): Promise<void> {
    // Filter input: data-testid="channel-name", no name attribute.
    // Modal input: same testid but also has name="channelName".
    // :not([name]) avoids strict-mode violation when the modal is still animating out.
    await this.frame.locator('input[data-testid="channel-name"]:not([name])').fill(name);
  }

  async selectStatusFilter(option: 'All channels' | 'Active channels' | 'Inactive channels'): Promise<void> {
    // react-select's role="combobox" is a hidden dummy input (left: -100px) that
    // isVisible() reports as true but click() always fails with "outside of viewport".
    // Click the visible dropdown indicator (arrow icon) instead.
    const indicator = this.frame.locator('.select__indicator');
    if (await indicator.isVisible().catch(() => false)) {
      await indicator.click();
      // Scope to dropdown option elements to avoid matching the currently-selected value label
      await this.frame.locator('.select__option').getByText(option, { exact: true }).click();
      return;
    }

    // Fallback for UI variants without .select__indicator (native combobox)
    await this.frame.getByRole('combobox').first().click();
    await this.frame.getByRole('option', { name: option, exact: true }).click();
  }

  async submitSearchFilter(hasResults = true): Promise<void> {
    await this.frame.getByTestId('submit').click();
    // 60s for page heading: submitting from a non-first page may trigger an iframe reload
    await this.assertPageVisible();
    // Wait for search to finish (button reverts from "Searching..." to "Go")
    await expect(this.frame.getByRole('button', { name: 'Go' })).toBeVisible({ timeout: 15000 });
    if (hasResults) {
      // Wait for the first data row so subsequent assertions/navigation act on loaded rows
      await expect(
        this.frame.locator('tbody tr td:nth-child(1)').first()
      ).toBeVisible({ timeout: 15000 });
    } else {
      await expect(
        this.frame.getByText('No records found')
      ).toBeVisible({ timeout: 15000 });
    }
  }

  async assertNoResultsFound(): Promise<void> {
    await expect(
      this.frame.getByText('No records found')
    ).toBeVisible({ timeout: 10000 });
  }

  async assertActiveChannelsOnlyVisible(): Promise<void> {
    await expect(
      this.frame.getByRole('cell', { name: 'Active', exact: true }).first()
    ).toBeVisible({ timeout: 20000 });
    await expect(
      this.frame.getByRole('cell', { name: 'Inactive', exact: true })
    ).toHaveCount(0, { timeout: 5000 });
  }

  async assertInactiveChannelsOnlyVisible(): Promise<void> {
    await expect(
      this.frame.getByRole('cell', { name: 'Inactive', exact: true }).first()
    ).toBeVisible({ timeout: 20000 });
    await expect(
      this.frame.getByRole('cell', { name: 'Active', exact: true })
    ).toHaveCount(0, { timeout: 5000 });
  }

  async getLastRowNumberOnPage(): Promise<number> {
    const noRecords = this.frame.getByText('No records found');
    if (await noRecords.isVisible().catch(() => false)) {
      return 0;
    }

    // Wait for actual data rows (loading placeholder has no td:nth-child(1))
    const firstNumberCell = this.frame.locator('tbody tr td:nth-child(1)').first();
    await expect(firstNumberCell).toBeVisible({ timeout: 15000 });

    const cells = this.frame.locator('tbody tr td:nth-child(1)');
    const count = await cells.count();
    if (count === 0) return 0;
    const text = (await cells.nth(count - 1).textContent() ?? '').trim();
    return parseInt(text, 10) || 0;
  }
}
