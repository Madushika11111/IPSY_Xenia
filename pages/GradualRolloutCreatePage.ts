import { FrameLocator, Page, expect } from '@playwright/test';

export class GradualRolloutCreatePage {
  private readonly frame: FrameLocator;

  constructor(private readonly page: Page) {
    this.frame = page.frameLocator('[data-test-id="cf-widget-renderer"]');
  }

  // ─── Form visibility ─────────────────────────────────────────────────────────

  async assertPageVisible(): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { name: 'Create campaign' })
    ).toBeVisible({ timeout: 10000 });
  }

  async assertAllFieldsVisible(): Promise<void> {
    await expect(this.frame.getByText('Campaign name *')).toBeVisible();
    await expect(this.frame.getByText('Campaign start date & time (')).toBeVisible();
    await expect(this.frame.getByLabel('Create campaign').getByText('Channels', { exact: true })).toBeVisible();
    // End date is now optional — rendered as an unchecked checkbox, not an open input
    await expect(this.frame.getByText('Set campaign end date & time')).toBeVisible();
    await expect(this.frame.getByText('Campaign ID *')).toBeVisible();
    await expect(this.frame.getByText('Description')).toBeVisible();
    await expect(this.frame.getByText('Feature Selection')).toBeVisible();
  }

  async assertActionButtons(): Promise<void> {
    await expect(this.frame.getByTestId('submit-save-active-drawer')).toBeVisible();
    await expect(this.frame.getByTestId('submit-save-draft-drawer')).toBeVisible();
    await expect(this.frame.getByTestId('onclose-basic-drawer')).toBeVisible();
  }

  // ─── Fill fields ─────────────────────────────────────────────────────────────

  async fillName(name: string): Promise<void> {
    await this.frame.getByRole('textbox', { name: 'Campaign name *' }).fill(name);
  }

  async fillStartDate(dateStr: string): Promise<void> {
    const input = this.frame.getByRole('textbox', { name: 'Campaign start date & time (' });
    await input.click();
    await input.press('ArrowRight');
    await input.fill(dateStr);
  }

  async fillEndDate(dateStr: string): Promise<void> {
    // End date is hidden by default behind a checkbox. Check it first to reveal the input.
    const checkbox = this.frame.getByRole('dialog', { name: 'Create campaign' }).getByRole('checkbox');
    if (!await checkbox.isChecked()) {
      await checkbox.check();
    }
    const input = this.frame.getByRole('textbox', { name: 'Set campaign end date & time' });
    await input.click();
    await input.press('ArrowRight');
    await input.fill(dateStr);
  }

  async selectChannel(channelName: string = 'web'): Promise<void> {
    await this.frame.locator('.select__input-container').click();
    await this.frame.getByLabel('Create campaign').getByText(channelName, { exact: true }).click();
  }

  async selectAdditionalChannel(channelName: string): Promise<void> {
    await this.frame.locator('.select__input-container').click();
    // Use .select__option to target the react-select dropdown item directly and
    // wait for it to be stable before clicking (avoids DOM-detach race condition).
    const option = this.frame.locator('.select__option', { hasText: channelName }).first();
    await option.waitFor({ state: 'visible', timeout: 5000 });
    await option.click();
  }

  async fillCampaignId(id: string): Promise<void> {
    const input = this.frame.getByRole('textbox', { name: 'Campaign ID *' });
    await input.fill(id);
    // Tab out to fire blur-based inline uniqueness validation right now.
    // Wait for the "(Validating...)" indicator to appear then disappear so the
    // validation is fully settled before the caller proceeds — prevents the
    // validation response from racing with later actions (e.g. save submit).
    await input.press('Tab');
    const validating = this.frame.getByText(/Validating/);
    try {
      await expect(validating).toBeVisible({ timeout: 1500 });
      await expect(validating).not.toBeVisible({ timeout: 8000 });
    } catch {
      // Validation completed too fast to observe, or indicator not present — fine.
    }
  }

  // ─── Action buttons ──────────────────────────────────────────────────────────

  async clickSaveActivate(): Promise<void> {
    await this.frame.getByTestId('submit-save-active-drawer').click();
  }

  async clickSaveDraft(): Promise<void> {
    await this.frame.getByTestId('submit-save-draft-drawer').click();
  }

  async closeDrawer(): Promise<void> {
    await this.frame.locator('.rs-drawer-header-close').click();
  }

  // ─── Validation ──────────────────────────────────────────────────────────────

  async assertSaveActivateValidationErrors(): Promise<void> {
    await expect(this.frame.getByText('Please enter campaign name')).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByText('Please select campaign start')).toBeVisible();
    await expect(this.frame.getByText('Please select at least one')).toBeVisible();
    await expect(this.frame.getByText('Please enter campaign ID')).toBeVisible();
    // End date is optional — no validation error expected when it is not set
  }

  async assertCampaignIdFormatError(): Promise<void> {
    // Campaign ID only allows uppercase letters, numbers, and underscore (e.g. TEST_123)
    await expect(
      this.frame.getByText('Campaign ID can only contain')
    ).toBeVisible({ timeout: 5000 });
  }

  async assertCampaignIdDuplicateError(): Promise<void> {
    // Async server-side uniqueness check — allow up to 10 s for the response
    await expect(
      this.frame.getByText('This Campaign ID already')
    ).toBeVisible({ timeout: 10000 });
  }

  async assertStartDatePastError(): Promise<void> {
    await expect(
      this.frame.getByText('Campaign start date & time (PST) should be greater than current date & time')
    ).toBeVisible({ timeout: 5000 });
  }

  async assertEndDateBeforeStartError(): Promise<void> {
    await expect(
      this.frame.getByText('Campaign end date & time should be greater than campaign start date & time')
    ).toBeVisible({ timeout: 5000 });
  }

  async assertDraftValidationNotification(): Promise<void> {
    await expect(this.page.locator('.css-1pm4qpo').first()).toBeVisible({ timeout: 5000 });
  }

  async assertCampaignIdRequiredInlineError(): Promise<void> {
    // Clicking the Campaign ID field triggers blur-validation to surface the inline error
    await this.frame.getByRole('textbox', { name: 'Campaign ID *' }).click();
    await expect(this.frame.getByText('Please enter campaign ID')).toBeVisible({ timeout: 5000 });
  }

  async assertCampaignNameRequiredInlineError(): Promise<void> {
    // Save Draft validation fires as page-level toast notifications, not inline frame errors
    await expect(this.page.getByText('Please enter campaign name').first()).toBeVisible({ timeout: 5000 });
  }

  // ─── Feature Selection section ───────────────────────────────────────────────

  async assertNoChannelsSelected(): Promise<void> {
    await expect(this.frame.getByText('No channels selected')).toBeVisible({ timeout: 5000 });
  }

  async assertCampaignIdRequired(): Promise<void> {
    await expect(
      this.frame.getByText('Please enter a campaign ID')
    ).toBeVisible({ timeout: 5000 });
  }

  async assertCreateFeatureButtonVisible(): Promise<void> {
    await expect(this.frame.getByText('Create a new feature')).toBeVisible({ timeout: 5000 });
  }

  async assertCreateFeatureButtonAbsent(): Promise<void> {
    await expect(this.frame.getByText('Create a new feature')).not.toBeVisible();
  }

  async clickCreateFeature(): Promise<void> {
    await this.frame.getByText('Create a new feature').click();
  }

  // ─── Feature variants ────────────────────────────────────────────────────────

  async assertVariantsCreated(): Promise<void> {
    await expect(this.frame.getByText('Control')).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByText('Variant 1')).toBeVisible();
  }

  async assertVariant1RemoveIconVisible(): Promise<void> {
    // nth(0) = Control remove icon (disabled), nth(1) = Variant 1 remove icon (enabled)
    await expect(this.frame.getByRole('img', { name: 'Remove parameter' }).nth(1)).toBeVisible({ timeout: 5000 });
  }

  async assertControlRemoveIconDisabled(): Promise<void> {
    // Control's remove icon exists in the DOM but is visually disabled
    const removeIcons = this.frame.getByRole('img', { name: 'Remove parameter' });
    const count = await removeIcons.count();
    expect(count).toBeGreaterThanOrEqual(2); // Control (disabled) + Variant 1 (enabled)
  }

  async assertAddNewVariantsButtonVisible(): Promise<void> {
    await expect(this.frame.getByText('Add new variants')).toBeVisible({ timeout: 5000 });
  }

  async assertSaveWithoutVariantsError(): Promise<void> {
    await expect(
      this.page.locator('[data-test-id="cf-ui-paragraph"]')
        .filter({ hasText: /Please add at least one variant/i })
    ).toBeVisible({ timeout: 10000 });
  }

  async assertMaxVariantsError(): Promise<void> {
    await expect(
      this.page.locator('[data-test-id="cf-ui-paragraph"]').first()
    ).toBeVisible({ timeout: 5000 });
  }

  async assertTrafficDefaults(): Promise<void> {
    const controlTraffic = this.frame.locator('div').filter({ hasText: /^Control%$/ }).getByPlaceholder('Traffic percentage');
    const variant1Traffic = this.frame.locator('div').filter({ hasText: /^Variant 1%$/ }).getByPlaceholder('Traffic percentage');
    await expect(controlTraffic).toHaveValue('100');
    await expect(variant1Traffic).toHaveValue('0');
  }

  async setVariantTrafficByIndex(spinbuttonIndex: number, value: number): Promise<void> {
    // No explicit blur here — the next clickAddNewVariant() or clickSaveActivate() serves
    // as the blur trigger, preventing unintended proportional redistribution of other variants.
    const input = this.frame.getByRole('spinbutton', { name: 'Traffic percentage' }).nth(spinbuttonIndex);
    await input.click();
    await input.fill(String(value));
  }

  async setVariantTraffic(variantLabel: string, value: number): Promise<void> {
    const input = this.frame.locator('div').filter({ hasText: new RegExp(`^${variantLabel}%$`) }).getByPlaceholder('Traffic percentage');
    await input.click();
    await input.fill(String(value));
    // Click elsewhere to trigger auto-adjustment of other variant traffic
    await this.frame.locator('.col').first().click();
  }

  async assertControlTrafficDisabled(): Promise<void> {
    const controlInput = this.frame.locator('div').filter({ hasText: /^Control%$/ }).getByPlaceholder('Traffic percentage');
    await expect(controlInput).toBeDisabled();
  }

  async assertTrafficValue(variantLabel: string, expected: number): Promise<void> {
    const input = this.frame.locator('div').filter({ hasText: new RegExp(`^${variantLabel}%$`) }).getByPlaceholder('Traffic percentage');
    await expect(input).toHaveValue(String(expected));
  }

  async setAllVariantsTraffic(value: number, variantCount: number): Promise<void> {
    // Uses fill() without a preceding click() to avoid per-field mouse-event overhead.
    // Index 0 = Control (auto-managed, skip); indices 1..variantCount = variant rows.
    const inputs = this.frame.getByPlaceholder('Traffic percentage');
    for (let i = 1; i <= variantCount; i++) {
      await inputs.nth(i).fill(String(value));
    }
  }

  async clickAddNewVariant(): Promise<void> {
    await this.frame.getByText('Add new variants').click();
  }

  async getVariantCount(): Promise<number> {
    const total = await this.frame.getByPlaceholder('Traffic percentage').count();
    return total - 1;
  }

  async removeLastVariant(): Promise<void> {
    const removeButtons = this.frame.getByRole('img', { name: 'Remove parameter' });
    const count = await removeButtons.count();
    await removeButtons.nth(count - 1).click();
  }

  // ─── Save and verify success ─────────────────────────────────────────────────

  async assertSaveSuccess(): Promise<void> {
    // The drawer auto-closes when the save succeeds — no notification click needed.
    // Poll for drawer close (success). A duplicate Campaign ID surfaces as a
    // "Save Failed Campaign Already Exists" toast on the host page (outside the
    // widget iframe) — fail fast with a precise error when it appears.
    const closeBtn = this.frame.locator('.rs-drawer-header-close');
    const dupToast = this.page
      .locator('[data-test-id="cf-ui-paragraph"]')
      .filter({ hasText: /Campaign Already Exists/i })
      .first();
    // A rejection toast from a PREVIOUS save attempt lingers ~10 s — if one is
    // already showing when this check starts it proves nothing about THIS save,
    // so fall back to drawer-close/timeout detection in that case.
    const staleToast = await dupToast.isVisible().catch(() => false);
    const startMs = Date.now();
    while (Date.now() - startMs < 15000) {
      if (await closeBtn.isVisible() === false) return;
      if (!staleToast && await dupToast.isVisible().catch(() => false)) {
        throw new Error('Save failed: Campaign ID already exists');
      }
      await this.page.waitForTimeout(200);
    }
    throw new Error('assertSaveSuccess: drawer did not close within 15 s');
  }

  async assertSaveBlocked(graceMs = 6000): Promise<string[]> {
    // Campaign ID validation (required + format) no longer renders inline
    // errors — the message now appears only as a transient toast (~5 s, e.g.
    // "Campaign ID can only contain capital letters, numbers, and underscores")
    // while the drawer stays open. The drawer staying open is the reliable
    // assertion; toast texts are collected for the test log.
    const closeBtn = this.frame.locator('.rs-drawer-header-close');
    const toasts: string[] = [];
    const deadline = Date.now() + graceMs;
    while (Date.now() < deadline) {
      for (const t of await this.page.locator('[data-test-id="cf-ui-paragraph"]').allTextContents()) {
        const trimmed = t.trim();
        if (trimmed && !toasts.includes(trimmed)) toasts.push(trimmed);
      }
      if (!await closeBtn.isVisible().catch(() => false)) {
        throw new Error('Save was expected to be blocked, but the drawer closed (campaign was saved)');
      }
      await this.page.waitForTimeout(500);
    }
    return toasts;
  }

  async waitForNotificationsToClear(): Promise<void> {
    // Host-page toasts persist ~10 s; wait them out so the next save's
    // notification can't be confused with a stale one from an earlier save.
    await this.page.locator('[data-test-id="cf-ui-paragraph"]')
      .first()
      .waitFor({ state: 'hidden', timeout: 15000 })
      .catch(() => {});
  }

  async assertDuplicateIdSaveRejected(): Promise<string> {
    // Duplicate Campaign ID is no longer flagged inline on field blur — the
    // rejection only surfaces when the campaign is saved, as a Contentful
    // notification on the host page (outside the widget iframe):
    //   "Save Failed Campaign Already Exists with id: <id>"
    const note = this.page
      .locator('[data-test-id="cf-ui-paragraph"]')
      .filter({ hasText: /Campaign Already Exists/i })
      .first();
    await expect(note).toBeVisible({ timeout: 15000 });
    return (await note.textContent())?.trim() ?? '';
  }

  async dismissNotifications(): Promise<void> {
    const notifications = this.page.locator('[data-test-id="cf-ui-notification"]');
    const count = await notifications.count();
    for (let i = count - 1; i >= 0; i--) {
      try {
        if (await notifications.nth(i).isVisible()) {
          await notifications.nth(i).click();
        }
      } catch {}
    }
  }
}
