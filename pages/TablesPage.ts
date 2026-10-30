import { FrameLocator, Page, expect } from '@playwright/test';

export class TablesPage {
  private readonly frame: FrameLocator;

  constructor(private readonly page: Page) {
    this.frame = page.frameLocator('[data-test-id="cf-widget-renderer"]');
  }

  // ─── Navigation ──────────────────────────────────────────────────────────────

  async navigate(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Configuration' }).click();
    await expect(
      this.frame.getByRole('link', { name: 'Tables' })
    ).toBeVisible({ timeout: 10000 });
    await this.frame.getByRole('link', { name: 'Tables' }).click();
    await this.assertPageVisible();
  }

  async assertPageVisible(): Promise<void> {
    await expect(
      this.frame.getByText('Tables -')
    ).toBeVisible({ timeout: 10000 });
  }

  // Reads the full heading text (e.g. "Tables - 12") and prints it to the terminal
  async getAndLogPageHeading(): Promise<string> {
    const el = this.frame.getByText('Tables -');
    await expect(el).toBeVisible({ timeout: 10000 });
    const heading = (await el.textContent() ?? '').trim();
    console.log(`  Page heading : ${heading}`);
    return heading;
  }

  // Extracts the numeric count from the heading "Tables - 15" → 15
  async getTableCount(): Promise<number> {
    const el = this.frame.getByText('Tables -');
    await expect(el).toBeVisible({ timeout: 10000 });
    const text = await el.textContent() ?? '';
    const match = text.match(/Tables\s*-\s*(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  // ─── Page structure ──────────────────────────────────────────────────────────

  async assertPageElements(): Promise<void> {
    await this.getAndLogPageHeading();
    await expect(this.frame.getByTestId('add-button')).toBeVisible();
    console.log(`  Add button   : visible`);
  }

  async assertTableColumns(): Promise<void> {
    await expect(this.frame.getByRole('columnheader', { name: 'No' })).toBeVisible();
    await expect(this.frame.getByRole('columnheader', { name: 'Name', exact: true })).toBeVisible();
    await expect(this.frame.getByRole('columnheader', { name: 'Display name' })).toBeVisible();
    await expect(this.frame.getByRole('columnheader', { name: 'Status' })).toBeVisible();
    await expect(this.frame.getByRole('columnheader', { name: 'Action' })).toBeVisible();
    console.log(`  Columns      : No, Name, Display name, Status, Action`);
  }

  // ─── Create modal ────────────────────────────────────────────────────────────

  async clickAddTable(): Promise<void> {
    await this.frame.getByTestId('add-button').click();
  }

  async assertCreateModalVisible(): Promise<void> {
    await expect(this.frame.getByText('Add', { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByText('Table name *')).toBeVisible();
    await expect(this.frame.getByText('Display name *')).toBeVisible();
    await expect(this.frame.getByTestId('save-modal-submit')).toBeVisible();
  }

  async closeModal(): Promise<void> {
    await this.frame.getByLabel('Close').click();
  }

  // ─── Update modal ────────────────────────────────────────────────────────────

  async assertUpdateModalVisible(): Promise<void> {
    await expect(this.frame.getByText('Update', { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByTestId('display-name')).toBeVisible();
    await expect(this.frame.getByTestId('save-modal-submit')).toBeVisible();
  }

  // ─── Form fields ─────────────────────────────────────────────────────────────

  async fillTableName(name: string): Promise<void> {
    await this.frame.getByTestId('table-name').click();
    await this.frame.getByTestId('table-name').fill(name);
  }

  async fillDisplayName(displayName: string): Promise<void> {
    await this.frame.getByTestId('display-name').click();
    await this.frame.getByTestId('display-name').fill(displayName);
  }

  async submitForm(): Promise<void> {
    await this.frame.getByTestId('save-modal-submit').click();
  }

  // Submits, waits for the success notification, then waits for the modal to close.
  // Uses .last() so a lingering previous notification (still animating out of DOM)
  // does not cause a strict-mode violation when a new notification is added.
  // Returns the notification message text.
  async submitAndWait(): Promise<string> {
    await this.frame.getByTestId('save-modal-submit').click();
    const notification = this.page.locator('.css-1pm4qpo').last();
    await expect(notification).toBeVisible({ timeout: 10000 });
    const msg = (await notification.textContent() ?? '').trim();
    await expect(this.frame.getByTestId('save-modal-submit')).not.toBeVisible({ timeout: 10000 });
    return msg;
  }

  // Submits and waits only for the modal to close — no notification required.
  // Use when the app may not show a toast (e.g. duplicate display name scenario).
  async submitFormAndWaitForModalClose(): Promise<void> {
    await this.frame.getByTestId('save-modal-submit').click();
    await expect(this.frame.getByTestId('save-modal-submit')).not.toBeVisible({ timeout: 15000 });
  }

  // ─── Validation errors ───────────────────────────────────────────────────────

  async assertValidationErrors(): Promise<void> {
    await expect(
      this.frame.getByText('Please enter table name')
    ).toBeVisible({ timeout: 5000 });
    await expect(
      this.frame.getByText('Please enter table display')
    ).toBeVisible({ timeout: 5000 });
  }

  async getTableNameValidationError(): Promise<string> {
    const el = this.frame.getByText('Please enter table name');
    await expect(el).toBeVisible({ timeout: 5000 });
    return (await el.textContent() ?? '').trim();
  }

  async getDisplayNameValidationError(): Promise<string> {
    const el = this.frame.getByText('Please enter table display');
    await expect(el).toBeVisible({ timeout: 5000 });
    return (await el.textContent() ?? '').trim();
  }

  // ─── Pagination ──────────────────────────────────────────────────────────────

  async waitForNotificationGone(): Promise<void> {
    await this.page.locator('.css-1pm4qpo').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  }

  async navigateToLastPage(): Promise<void> {
    await this.assertPageVisible();
    try {
      await this.frame.getByRole('button', { name: 'Last' }).click({ timeout: 5000 });
      await this.assertPageVisible();
    } catch {
      // Already on last page — Last button is not available
    }
  }

  // ─── Row helpers ─────────────────────────────────────────────────────────────

  // String hasText does substring matching WITH whitespace normalisation — safe for unique timestamp names.
  private tableRow(tableName: string) {
    return this.frame.locator('tr').filter({ hasText: tableName });
  }

  // ─── Table row assertions ────────────────────────────────────────────────────

  // After creation the app lowercases the Name — pass the lowercased value here.
  async assertTableInList(name: string): Promise<void> {
    await expect(
      this.frame.getByRole('cell', { name, exact: true })
    ).toBeVisible({ timeout: 10000 });
  }

  async getTableNameFromCell(tableName: string): Promise<string> {
    const cell = this.frame.getByRole('cell', { name: tableName, exact: true });
    return (await cell.textContent() ?? '').trim();
  }

  async assertTableDisplayName(tableName: string, displayName: string): Promise<void> {
    await expect(
      this.tableRow(tableName).getByText(displayName, { exact: true })
    ).toBeVisible({ timeout: 10000 });
  }

  // Asserts the Status cell in the row that contains tableName
  async assertTableStatus(tableName: string, status: 'Active' | 'Inactive'): Promise<void> {
    await expect(
      this.tableRow(tableName).locator('td').getByText(status, { exact: true })
    ).toBeVisible({ timeout: 10000 });
  }

  async assertActivateToggleVisible(tableName: string): Promise<void> {
    await expect(
      this.tableRow(tableName).getByTestId('activate')
    ).toBeVisible({ timeout: 5000 });
  }

  async assertEditButtonVisible(tableName: string): Promise<void> {
    await expect(
      this.tableRow(tableName).locator('.btn.btn-primary')
    ).toBeVisible({ timeout: 5000 });
  }

  // ─── Toggle (Activate / Deactivate) ─────────────────────────────────────────

  async clickToggle(tableName: string): Promise<void> {
    await this.tableRow(tableName).getByTestId('activate').click();
  }

  async clickDeactivateToggle(tableName: string): Promise<void> {
    await this.tableRow(tableName).getByTestId('deactivate').click();
  }

  async assertDeactivateToggleVisible(tableName: string): Promise<void> {
    await expect(
      this.tableRow(tableName).getByTestId('deactivate')
    ).toBeVisible({ timeout: 5000 });
  }

  // Confirmation dialog lives at the page level (outside the iframe)
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

  async closeToggleDialog(): Promise<void> {
    await this.page.locator('[data-test-id="cf-ui-modal-header"] [data-test-id="cf-ui-icon-button"]').click();
  }

  async confirmToggle(): Promise<void> {
    await this.page.locator('[data-test-id="cf-ui-modal-confirm-confirm-button"]').click();
    await expect(
      this.page.locator('[data-test-id="cf-ui-modal-content"]')
    ).not.toBeVisible({ timeout: 15000 });
  }

  // Used when confirming deactivation (Active → Inactive); success uses cf-ui-paragraph.
  async confirmDeactivate(): Promise<void> {
    await this.page.locator('[data-test-id="cf-ui-modal-confirm-confirm-button"]').click();
    await expect(
      this.page.locator('[data-test-id="cf-ui-paragraph"]')
    ).toBeVisible({ timeout: 10000 });
  }

  // ─── Edit table ──────────────────────────────────────────────────────────────

  async clickEditTable(tableName: string): Promise<void> {
    await this.tableRow(tableName).locator('.btn.btn-primary').click();
  }

  async assertTableNameDisabled(): Promise<void> {
    await expect(
      this.frame.getByTestId('table-name')
    ).toBeDisabled({ timeout: 5000 });
  }

  async updateDisplayName(displayName: string): Promise<void> {
    await this.frame.getByTestId('display-name').fill(displayName);
  }

  // ─── Search ──────────────────────────────────────────────────────────────────

  async openSearch(): Promise<void> {
    await this.frame.getByTestId('advanced-filter').locator('i').click();
  }

  async assertSearchVisible(): Promise<void> {
    await expect(this.frame.getByText('Table name')).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByText('Search', { exact: true })).toBeVisible();
    await expect(this.frame.getByRole('textbox')).toBeVisible();
    await expect(this.frame.getByRole('button', { name: 'Go' })).toBeVisible();
  }

  async searchTableName(name: string): Promise<void> {
    await this.frame.getByRole('textbox').fill(name);
    await this.frame.getByRole('button', { name: 'Go' }).click();
  }

  async assertNoResultsFound(): Promise<void> {
    await expect(
      this.frame.getByText('No records found')
    ).toBeVisible({ timeout: 10000 });
  }
}
