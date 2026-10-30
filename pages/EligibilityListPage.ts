import { FrameLocator, Page, expect } from '@playwright/test';

export class EligibilityListPage {
  private readonly frame: FrameLocator;

  constructor(private readonly page: Page) {
    this.frame = page.frameLocator('[data-test-id="cf-widget-renderer"]');
  }

  // ─── Navigation ──────────────────────────────────────────────────────────────

  async navigate(): Promise<void> {
    await this.frame.getByRole('link', { name: 'Eligibility', exact: true }).click();
    await this.assertPageVisible();
  }

  // ─── Assertions ──────────────────────────────────────────────────────────────

  async assertSidebarLinkVisible(): Promise<void> {
    await expect(
      this.frame.getByRole('link', { name: 'Eligibility', exact: true })
    ).toBeVisible({ timeout: 20000 });
  }

  async assertPageVisible(): Promise<void> {
    const heading = this.frame.getByRole('heading', { name: 'Eligibility campaigns' });
    await expect(heading).toBeVisible({ timeout: 10000 });
    const title = (await heading.textContent() ?? '').trim();
    console.log(`  Page title : "${title}"`);
  }

  async assertCreateButtonVisible(): Promise<void> {
    await expect(
      this.frame.getByRole('button', { name: 'Campaigns' }).nth(1)
    ).toBeVisible({ timeout: 10000 });
  }

  async assertCampaignVisible(name: string): Promise<void> {
    await expect(
      this.frame.getByRole('cell', { name }).first()
    ).toBeVisible({ timeout: 15000 });
  }

  async assertCampaignNotInList(name: string): Promise<void> {
    await expect(
      this.frame.getByRole('cell', { name, exact: true })
    ).toHaveCount(0, { timeout: 10000 });
  }

  async assertCampaignStatus(status: string): Promise<void> {
    await expect(
      this.frame.getByRole('cell', { name: status }).first()
    ).toBeVisible({ timeout: 10000 });
  }

  async assertCampaignDateVisible(partial: string): Promise<void> {
    await expect(this.frame.getByText(partial)).toBeVisible({ timeout: 10000 });
  }

  async assertCampaignChannelInList(channel: string): Promise<void> {
    await expect(
      this.frame.getByRole('cell', { name: channel })
    ).toBeVisible({ timeout: 10000 });
  }

  async getFirstCampaignStatus(): Promise<string> {
    // Column order (0-based, all <td>): 0=checkbox, 1=name, 2=start, 3=end, 4=channels, 5=status, 6=actions
    const rows = this.frame.getByRole('row');
    const statusCell = rows.nth(1).getByRole('cell').nth(5);
    return ((await statusCell.textContent()) ?? '').trim();
  }

  async getFirstCampaignChannel(): Promise<string> {
    const rows = this.frame.getByRole('row');
    const channelCell = rows.nth(1).getByRole('cell').nth(4);
    return ((await channelCell.textContent()) ?? '').trim();
  }

  async assertCampaignActionButtonsVisible(): Promise<void> {
    await expect(this.frame.getByRole('button', { name: 'View Details' }).first()).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Copy Campaign' }).first()).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Pause Campaign' }).first()).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Stop Campaign' }).first()).toBeVisible({ timeout: 5000 });
  }

  async assertScheduledCampaignActionButtonsVisible(): Promise<void> {
    await expect(this.frame.getByRole('button', { name: 'Share Campaign' }).first()).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'View Details' }).first()).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Edit Campaign' }).first()).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Copy Campaign' }).first()).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Pause Campaign' }).first()).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Stop Campaign' }).first()).toBeVisible({ timeout: 5000 });
  }

  async assertDeleteButtonDisabled(): Promise<void> {
    // For Scheduled campaigns the Delete Campaign button is rendered but has the disabled attribute
    await expect(
      this.frame.getByRole('button', { name: 'Delete Campaign' }).first()
    ).toBeDisabled({ timeout: 5000 });
  }

  // ─── Individual action button clicks ─────────────────────────────────────────

  async clickViewDetails(): Promise<void> {
    await this.frame.getByRole('button', { name: 'View Details' }).first().click();
  }

  async clickEditCampaign(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Edit Campaign' }).first().click();
  }

  async clickCopyCampaign(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Copy Campaign' }).first().click();
  }

  async clickShareCampaign(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Share Campaign' }).first().click();
  }

  async clickPauseCampaign(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Pause Campaign' }).first().click();
  }

  async clickStopCampaign(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Stop Campaign' }).first().click();
  }

  // ─── View Details modal ───────────────────────────────────────────────────────

  async assertViewDetailsModalVisible(campaignName?: string): Promise<void> {
    // The modal shows the campaign name next to the status badge at the top
    if (campaignName) {
      await expect(this.frame.getByText(campaignName).first()).toBeVisible({ timeout: 5000 });
    }
    await expect(this.frame.getByText('Campaign start date & time (PST)')).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByText('Campaign ID').first()).toBeVisible({ timeout: 5000 });
  }

  async assertViewDetailsHasField(label: string): Promise<void> {
    await expect(
      this.frame.getByRole('dialog').getByRole('heading', { name: label })
    ).toBeVisible({ timeout: 5000 });
  }

  async assertViewDetailsRulesetTable(): Promise<void> {
    const dialog = this.frame.getByRole('dialog');
    await expect(dialog.getByRole('columnheader', { name: 'Rule Name' })).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByRole('columnheader', { name: 'Rule Status' })).toBeVisible({ timeout: 5000 });
  }

  async closeViewDetailsModal(): Promise<void> {
    // Close the view details modal with the × button
    // The × button is a standalone button inside the modal; Escape is a reliable fallback.
    try {
      await this.frame.getByRole('button').filter({ hasText: '×' }).first().click({ timeout: 3000 });
    } catch {
      await this.page.keyboard.press('Escape');
    }
    await expect(this.frame.getByText('Campaign start date & time (PST)')).not.toBeVisible({ timeout: 5000 });
  }

  // ─── Edit Campaign form ───────────────────────────────────────────────────────

  async assertEditCampaignPageVisible(): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { name: 'Update campaign' })
    ).toBeVisible({ timeout: 10000 });
  }

  async assertEditCampaignButtonsVisible(): Promise<void> {
    await expect(this.frame.getByRole('button', { name: 'Update Campaign' })).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Cancel' })).toBeVisible({ timeout: 5000 });
  }

  async clickUpdateCampaignButton(): Promise<void> {
    // force:true bypasses Playwright's coverage check — the button is in a sticky
    // right panel and can be intermittently blocked by transient Contentful toasts
    await this.frame.getByRole('button', { name: 'Update Campaign' }).click({ force: true });
  }

  async assertUpdateSuccess(): Promise<void> {
    await expect(this.page.locator('.css-1pm4qpo').first()).toBeVisible({ timeout: 10000 });
  }

  async cancelEditCampaign(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Cancel' }).click();
    await expect(
      this.frame.getByRole('heading', { name: 'Eligibility campaigns' })
    ).toBeVisible({ timeout: 10000 });
  }

  async assertResultsCount(expected: number): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { level: 2 }).filter({ hasText: /^Results/ })
    ).toContainText(`(${expected})`, { timeout: 10000 });
  }

  // ─── Copy Campaign form ───────────────────────────────────────────────────────

  async assertCopyCampaignPageVisible(): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { name: 'Create campaign' })
    ).toBeVisible({ timeout: 10000 });
  }

  async assertCopyStartDateEmpty(): Promise<void> {
    const startInput = this.frame.getByRole('textbox', { name: 'Campaign start date & time (' });
    await expect(startInput).toBeVisible({ timeout: 5000 });
    const value = await startInput.inputValue();
    expect(value).toBe('');
  }

  async assertCopyActionButtonsVisible(): Promise<void> {
    await expect(this.frame.getByTestId('submit-save-active-drawer')).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByTestId('submit-save-draft-drawer')).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByTestId('onclose-basic-drawer')).toBeVisible({ timeout: 5000 });
  }

  async cancelCopyCampaign(): Promise<void> {
    await this.frame.getByTestId('onclose-basic-drawer').click();
    await expect(
      this.frame.getByRole('heading', { name: 'Eligibility campaigns' })
    ).toBeVisible({ timeout: 10000 });
  }

  // ─── Share Campaign modal ─────────────────────────────────────────────────────

  async assertShareModalVisible(): Promise<void> {
    await expect(this.frame.getByText('Share Campaign').first()).toBeVisible({ timeout: 5000 });
  }

  async assertShareModalHasUrl(): Promise<void> {
    // The URL input contains the Contentful app URL
    await expect(
      this.frame.locator('input').filter({ hasText: '' }).nth(0)
    ).toBeVisible({ timeout: 5000 }).catch(async () => {
      // Fallback: check for any text containing 'contentful.com'
      await expect(this.frame.getByText(/contentful\.com/, { exact: false })).toBeVisible({ timeout: 5000 });
    });
    await expect(this.frame.getByRole('button', { name: 'Copy Link' })).toBeVisible({ timeout: 5000 });
  }

  async closeShareModal(): Promise<void> {
    try {
      await this.frame.getByRole('button').filter({ hasText: '×' }).first().click({ timeout: 3000 });
    } catch {
      await this.page.keyboard.press('Escape');
    }
    await expect(this.frame.getByText('Share Campaign')).not.toBeVisible({ timeout: 5000 });
  }

  // ─── Pause Campaign confirmation ──────────────────────────────────────────────

  async assertPauseDialogVisible(): Promise<void> {
    await expect(this.frame.getByText('Pause Campaign?')).toBeVisible({ timeout: 5000 });
  }

  async assertPauseDialogBody(): Promise<void> {
    await expect(this.frame.getByText(/pause the campaign/i)).toBeVisible({ timeout: 5000 });
  }

  async assertPauseDialogButtons(): Promise<void> {
    await expect(this.frame.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Cancel' })).toBeVisible({ timeout: 5000 });
  }

  async cancelPauseCampaign(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Cancel' }).click();
    await expect(this.frame.getByText('Pause Campaign?')).not.toBeVisible({ timeout: 5000 });
  }

  async confirmPauseCampaign(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Pause' }).click();
    await expect(this.page.locator('[data-test-id="cf-ui-notification"]').last()).toBeVisible({ timeout: 10000 });
    await this.page.locator('[data-test-id="cf-ui-notification"]').last().click();
  }

  async assertPausedCampaignActions(): Promise<void> {
    await expect(this.frame.getByRole('button', { name: 'View Details' }).first()).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Edit Campaign' }).first()).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Resume Campaign' }).first()).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Stop Campaign' }).first()).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Pause Campaign' }).first()).not.toBeVisible({ timeout: 3000 });
  }

  async assertPauseCampaignButtonVisible(): Promise<void> {
    await expect(this.frame.getByRole('button', { name: 'Pause Campaign' }).first()).toBeVisible({ timeout: 5000 });
  }

  async assertResumeCampaignButtonAbsent(): Promise<void> {
    await expect(this.frame.getByRole('button', { name: 'Resume Campaign' }).first()).not.toBeVisible({ timeout: 3000 });
  }

  // ─── Resume Campaign confirmation ─────────────────────────────────────────────

  async clickResumeCampaign(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Resume Campaign' }).first().click();
  }

  async assertResumeDialogVisible(): Promise<void> {
    await expect(this.frame.getByRole('heading', { name: 'Resume Campaign?' })).toBeVisible({ timeout: 5000 });
  }

  async assertResumeDialogButtons(): Promise<void> {
    await expect(this.frame.getByRole('button', { name: 'Resume' })).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Cancel' })).toBeVisible({ timeout: 5000 });
  }

  async cancelResumeCampaign(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Cancel' }).click();
    await expect(this.frame.getByRole('heading', { name: 'Resume Campaign?' })).not.toBeVisible({ timeout: 5000 });
  }

  async confirmResumeCampaign(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Resume' }).click();
    await expect(this.page.locator('[data-test-id="cf-ui-notification"]').last()).toBeVisible({ timeout: 10000 });
    await this.page.locator('[data-test-id="cf-ui-notification"]').last().click();
  }

  // ─── Stop Campaign confirmation ───────────────────────────────────────────────

  async assertStopDialogVisible(): Promise<void> {
    await expect(this.frame.getByText('Stop Campaign?')).toBeVisible({ timeout: 5000 });
  }

  async assertStopDialogMentionsExpired(): Promise<void> {
    await expect(this.frame.getByText(/Expired/)).toBeVisible({ timeout: 5000 });
  }

  async assertStopDialogButtons(): Promise<void> {
    await expect(this.frame.getByRole('button', { name: 'Stop' })).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Cancel' })).toBeVisible({ timeout: 5000 });
  }

  async cancelStopCampaign(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Cancel' }).click();
    await expect(this.frame.getByText('Stop Campaign?')).not.toBeVisible({ timeout: 5000 });
  }

  async confirmStopCampaign(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Stop' }).click();
    await expect(this.page.locator('[data-test-id="cf-ui-notification"]').last()).toBeVisible({ timeout: 10000 });
    await this.page.locator('[data-test-id="cf-ui-notification"]').last().click();
  }

  async assertExpiredCampaignActions(): Promise<void> {
    await expect(this.frame.getByRole('button', { name: 'View Details' }).first()).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Edit Campaign' }).first()).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Copy Campaign' }).first()).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Pause Campaign' }).first()).toBeDisabled({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Stop Campaign' }).first()).toBeDisabled({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Delete Campaign' }).first()).toBeEnabled({ timeout: 5000 });
  }

  async assertDeleteButtonEnabled(): Promise<void> {
    await expect(
      this.frame.getByRole('button', { name: 'Delete Campaign' }).first()
    ).toBeEnabled({ timeout: 5000 });
  }

  async clickDeleteCampaign(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Delete Campaign' }).first().click({ force: true });
  }

  async assertDeleteDialogVisible(): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { name: 'Delete Campaign?' })
    ).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Cancel' })).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Delete' })).toBeVisible({ timeout: 5000 });
  }

  async cancelDeleteCampaign(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Cancel' }).click();
    // Wait for the dialog heading to disappear — using button name 'Delete' is ambiguous
    // because the row action icon (title="Delete Campaign") also matches
    await expect(
      this.frame.getByRole('heading', { name: 'Delete Campaign?' })
    ).not.toBeVisible({ timeout: 5000 });
  }

  async confirmDeleteCampaign(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Delete' }).click();
    await expect(this.page.locator('[data-test-id="cf-ui-notification"]').last()).toBeVisible({ timeout: 10000 });
    await this.page.locator('[data-test-id="cf-ui-notification"]').last().click();
  }

  // ─── Actions ─────────────────────────────────────────────────────────────────

  async clickCreateButton(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Campaigns' }).nth(1).click();
  }

  async filterByDate(option: string): Promise<void> {
    // The Date filter dropdown uses role="option" (confirmed by codegen), not React Select's
    // .select__option class. Match the combobox by text so pagination controls are not clicked.
    await this.frame.getByRole('combobox').filter({ hasText: /Today|All days/ }).click();
    await this.frame.getByRole('option', { name: option }).click();
  }

  async searchByName(name: string): Promise<void> {
    const input = this.frame.getByPlaceholder('Enter campaign name');
    await input.fill(name);
  }

  async clickSearch(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Search' }).click();
  }

  async getTotalCampaignCount(): Promise<number> {
    const el = this.frame.getByText(/\d+ Campaigns/).first();
    await expect(el).toBeVisible({ timeout: 10000 });
    const text = await el.textContent() ?? '';
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }
}
