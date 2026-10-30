import { FrameLocator, Page, expect } from '@playwright/test';

export class EligibilityCreatePage {
  private readonly frame: FrameLocator;

  constructor(private readonly page: Page) {
    this.frame = page.frameLocator('[data-test-id="cf-widget-renderer"]');
  }

  // ─── Page / drawer visibility ─────────────────────────────────────────────────

  async assertPageVisible(): Promise<void> {
    const heading = this.frame.getByRole('heading', { name: 'Create campaign' });
    await expect(heading).toBeVisible({ timeout: 10000 });
    const title = (await heading.textContent() ?? '').trim();
    console.log(`  Create page title : "${title}"`);
  }

  async assertAllFieldsVisible(): Promise<void> {
    await expect(this.frame.getByText('Campaign name *')).toBeVisible();
    await expect(this.frame.getByText('Campaign start date & time (')).toBeVisible();
    await expect(this.frame.getByLabel('Create campaign').getByText('Channels', { exact: true })).toBeVisible();
    await expect(this.frame.getByText('Set campaign end date & time')).toBeVisible();
    await expect(this.frame.getByText('Campaign ID *')).toBeVisible();
    await expect(this.frame.getByText('Description')).toBeVisible();
    await expect(this.frame.getByText('Ruleset')).toBeVisible();
  }

  async assertActionButtons(): Promise<void> {
    await expect(this.frame.getByTestId('submit-save-active-drawer')).toBeVisible();
    await expect(this.frame.getByTestId('submit-save-draft-drawer')).toBeVisible();
    await expect(this.frame.getByTestId('onclose-basic-drawer')).toBeVisible();
  }

  async assertRulesetNoChannels(): Promise<void> {
    await expect(this.frame.getByText('No channels selected')).toBeVisible({ timeout: 5000 });
  }

  async assertRulesetChannelAccordion(channelName: string): Promise<void> {
    await expect(
      this.frame.locator('[data-test-id="cf-ui-accordion-header"]').getByRole('button', { name: channelName, exact: true })
    ).toBeVisible({ timeout: 5000 });
  }

  async assertAddRulesetVisible(): Promise<void> {
    await expect(
      this.frame.getByText('Add ruleset')
    ).toBeVisible({ timeout: 5000 });
  }

  async assertRulesetNoRecords(): Promise<void> {
    await expect(
      this.frame.locator('div').filter({ hasText: /^No records found$/ }).first()
    ).toBeVisible({ timeout: 5000 });
  }

  async selectAdditionalChannel(channelName: string): Promise<void> {
    await this.frame.locator('.select__input-container').click();
    const option = this.frame.locator('.select__option', { hasText: channelName }).first();
    await option.waitFor({ state: 'visible', timeout: 5000 });
    await option.click();
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
    const checkbox = this.frame.getByRole('dialog', { name: 'Create campaign' }).getByRole('checkbox');
    if (!await checkbox.isChecked()) {
      await checkbox.check();
    }
    const input = this.frame.getByRole('textbox', { name: 'Set campaign end date & time' });
    await input.click();
    await input.press('ArrowRight');
    await input.fill(dateStr);
  }

  async fillEndDateOnUpdate(dateStr: string): Promise<void> {
    // The end-date toggle is always unchecked when the Update form opens — check it first
    const checkbox = this.frame.getByRole('dialog', { name: 'Update campaign' }).getByRole('checkbox');
    await checkbox.check();
    const input = this.frame.getByRole('textbox', { name: 'Set campaign end date & time' });
    await input.click();
    await input.press('ArrowRight');
    await input.fill(dateStr);
  }

  async selectChannel(channelName: string): Promise<void> {
    await this.frame.locator('.select__input-container').click();
    await this.frame.getByLabel('Create campaign').getByText(channelName, { exact: true }).click();
  }

  async selectRandomChannel(): Promise<string> {
    await this.frame.locator('.select__input-container').click();
    const options = this.frame.locator('.select__option');
    await options.first().waitFor({ state: 'visible', timeout: 10000 });
    const count = await options.count();
    const idx = Math.floor(Math.random() * count);
    const option = options.nth(idx);
    const name = ((await option.textContent()) ?? '').trim();
    await option.click();
    return name;
  }

  async fillCampaignId(id: string): Promise<void> {
    const input = this.frame.getByRole('textbox', { name: 'Campaign ID *' });
    await input.fill(id);
    await input.press('Tab');
    const validating = this.frame.getByText(/Validating/);
    try {
      await expect(validating).toBeVisible({ timeout: 1500 });
      await expect(validating).not.toBeVisible({ timeout: 8000 });
    } catch {
      // Validation completed too fast to observe — fine.
    }
  }

  // ─── Actions ─────────────────────────────────────────────────────────────────

  async clickSaveActivate(): Promise<void> {
    await this.frame.getByTestId('submit-save-active-drawer').click();
  }

  async clickSaveDraft(): Promise<void> {
    await this.frame.getByTestId('submit-save-draft-drawer').click();
  }

  async closeDrawer(): Promise<void> {
    const closeBtn = this.frame.getByTestId('onclose-basic-drawer');
    // Drawer may have already auto-closed (e.g. after channel removal confirmation)
    if (!await closeBtn.isVisible().catch(() => false)) return;
    try {
      await closeBtn.click({ force: true });
    } catch {
      // Fall back to Escape when the button is scrolled outside the viewport
      await this.page.keyboard.press('Escape');
    }
    await expect(
      this.frame.getByRole('heading', { name: 'Eligibility campaigns' })
    ).toBeVisible({ timeout: 10000 });
  }

  async closeDrawerAfterSave(): Promise<void> {
    // After save the drawer stays open. Cancel button is usually still present.
    // Fall back to Escape if it isn't.
    const cancelBtn = this.frame.getByTestId('onclose-basic-drawer');
    try {
      await expect(cancelBtn).toBeVisible({ timeout: 3000 });
      await cancelBtn.click({ force: true });
    } catch {
      await this.page.keyboard.press('Escape');
    }
    await expect(
      this.frame.getByRole('heading', { name: 'Eligibility campaigns' })
    ).toBeVisible({ timeout: 10000 });
  }

  async dismissNotifications(): Promise<void> {
    const closeBtn = this.page.locator('[data-test-id="cf-ui-icon-button"]').filter({ hasText: /close|dismiss/i });
    const count = await closeBtn.count();
    for (let i = 0; i < count; i++) {
      await closeBtn.first().click().catch(() => {});
    }
    await this.page.locator('.css-1pm4qpo').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  }

  // ─── Validation ──────────────────────────────────────────────────────────────

  async assertSaveActivateValidationErrors(): Promise<void> {
    await expect(this.frame.getByText('Please enter campaign name')).toBeVisible({ timeout: 5000 });
    console.log(`  "Please enter campaign name" error ✓`);
    await expect(this.frame.getByText('Please select campaign start')).toBeVisible();
    console.log(`  "Please select campaign start..." error ✓`);
    await expect(this.frame.getByText('Please select at least one')).toBeVisible();
    console.log(`  "Please select at least one" (channel) error ✓`);
    await expect(this.frame.getByText('Please enter campaign ID')).toBeVisible();
    console.log(`  "Please enter campaign ID" error ✓`);
  }

  async assertDraftValidationNotification(): Promise<void> {
    await expect(this.page.locator('.css-1pm4qpo').first()).toBeVisible({ timeout: 5000 });
  }

  async assertCampaignIdRequiredInlineError(): Promise<void> {
    // Draft validation uses lowercase "campaign id" (unlike Save & Activate which uses "campaign ID")
    await expect(this.frame.getByText('Please enter campaign id')).toBeVisible({ timeout: 5000 });
    console.log(`  "Please enter campaign id" inline error ✓`);
  }

  async assertStartDatePastError(): Promise<void> {
    await expect(
      this.frame.getByText('Campaign start date & time should be greater than current date & time')
    ).toBeVisible({ timeout: 5000 });
  }

  async assertEndDateBeforeStartError(): Promise<void> {
    await expect(
      this.frame.getByText('Campaign end date & time should be greater than campaign start date & time')
    ).toBeVisible({ timeout: 5000 });
  }

  async assertSaveSuccess(): Promise<void> {
    await expect(this.page.locator('.css-1pm4qpo').first()).toBeVisible({ timeout: 10000 });
  }

  // ─── Campaign ID format validation ───────────────────────────────────────────

  async assertCampaignIdFormatError(): Promise<void> {
    await expect(
      this.frame.getByText(/Campaign ID can only contain/)
    ).toBeVisible({ timeout: 5000 });
  }

  async assertCampaignIdDuplicateError(): Promise<void> {
    // Async server-side uniqueness check — allow up to 10 s for the API response
    await expect(
      this.frame.getByText('This Campaign ID already')
    ).toBeVisible({ timeout: 10000 });
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
    // rejection only surfaces after Save & Activate, as a Contentful
    // notification on the host page (outside the widget iframe):
    //   "Save Failed Campaign Already Exists id = <id>"
    const note = this.page
      .locator('[data-test-id="cf-ui-paragraph"]')
      .filter({ hasText: /Campaign Already Exists/i })
      .first();
    await expect(note).toBeVisible({ timeout: 15000 });
    return (await note.textContent())?.trim() ?? '';
  }

  // ─── Channel removal ─────────────────────────────────────────────────────────

  async clickRemoveChannel(channelName: string): Promise<void> {
    await this.frame.getByRole('button', { name: `Remove ${channelName}` }).click({ force: true });
  }

  async assertRemoveChannelDialog(): Promise<void> {
    await expect(
      this.page.locator('[data-test-id="cf-ui-subheading"]').first()
    ).toBeVisible({ timeout: 5000 });
  }

  async cancelChannelRemoval(): Promise<void> {
    await this.page.locator('[data-test-id="cf-ui-modal-confirm-cancel-button"]').click();
  }

  async confirmChannelRemoval(): Promise<void> {
    // Use .last() to target the most recently opened dialog — Contentful leaves stale
    // hidden modal DOM in the page after prior cancellations, creating multiple matches
    await this.page
      .locator('[data-test-id="cf-ui-modal-confirm-confirm-button"]')
      .last()
      .click();
  }

  async assertRulesetChannelAbsent(channelName: string): Promise<void> {
    await expect(
      this.frame.locator('[data-test-id="cf-ui-accordion-header"]').getByRole('button', { name: channelName, exact: true })
    ).not.toBeVisible({ timeout: 5000 });
  }

  // ─── Ruleset sub-drawer ───────────────────────────────────────────────────────

  async clickAddRuleset(): Promise<void> {
    await this.frame.getByText('Add ruleset').click();
  }

  async clickAddRulesetForChannel(channelName: string): Promise<void> {
    // Scopes the "Add ruleset" click to the accordion belonging to the given channel,
    // so that in a multi-channel form only the intended channel's ruleset drawer opens.
    await this.frame
      .locator('[data-test-id^="cf-ui-accordion-item-"]')
      .filter({
        has: this.frame
          .locator('[data-test-id="cf-ui-accordion-header"]')
          .getByRole('button', { name: channelName, exact: true }),
      })
      .getByText('Add ruleset')
      .click();
  }

  async selectDefiningRule(): Promise<void> {
    // The "Choose a template" react-select no longer has options in the environment.
    // Define the rule manually: fill the required Name field, then set a condition.
    await this.frame.getByRole('dialog', { name: 'Add ruleset' })
      .locator('input[name="name"]').fill('test ruleset');
    await this.searchAndSelectFirstConditionAttribute('name', /^name\b/i);
    await this.selectConditionOperator(0, 'contains');
    await this.fillConditionValue(0, 'test');
  }

  async selectRuleTemplate(templateName: string): Promise<void> {
    await this.frame.getByRole('dialog', { name: 'Add ruleset' }).locator('.select__control').click();
    const option = this.frame.locator('.select__option', { hasText: templateName });
    await option.waitFor({ state: 'visible', timeout: 5000 });
    await option.click();
  }

  async selectRandomRuleset(): Promise<string> {
    await this.frame.getByRole('dialog', { name: 'Add ruleset' }).locator('.select__control').click();
    const options = this.frame.locator('.select__option');
    await options.first().waitFor({ state: 'visible', timeout: 10000 });
    const count = await options.count();
    const idx = Math.floor(Math.random() * count);
    const option = options.nth(idx);
    const name = ((await option.textContent()) ?? '').trim();
    await option.click();
    return name;
  }

  async submitRulesetDrawer(): Promise<void> {
    await this.frame.getByTestId('submit-basic-drawer').click();
  }

  async assertRulesetSubDrawerOpen(): Promise<void> {
    await expect(
      this.frame.getByRole('dialog', { name: 'Add ruleset' })
    ).toBeVisible({ timeout: 5000 });
  }

  async assertRulesetSubDrawerNotOpen(): Promise<void> {
    await expect(
      this.frame.getByRole('dialog', { name: 'Add ruleset' })
    ).not.toBeVisible({ timeout: 3000 });
  }

  async assertRulesetNameRequiredError(): Promise<void> {
    await expect(
      this.frame.getByText('Please enter ruleset name')
    ).toBeVisible({ timeout: 5000 });
  }

  async assertRulesetDefiningRuleError(): Promise<void> {
    // Shown after filling name but submitting without a defining rule
    await expect(
      this.page.locator('[data-test-id="cf-ui-paragraph"]').first()
    ).toBeVisible({ timeout: 5000 });
  }

  async assertMissingRulesetValidationMessage(): Promise<void> {
    // Shown when Save & Activate is clicked and at least one channel has no ruleset configured
    await expect(
      this.page.locator('[data-test-id="cf-ui-paragraph"]').first()
    ).toBeVisible({ timeout: 5000 });
  }

  async dismissNotification(): Promise<void> {
    await this.page.locator('[data-test-id="cf-ui-notification"]').click().catch(() => {});
  }

  async fillRulesetName(name: string): Promise<void> {
    await this.frame.getByRole('dialog', { name: 'Add ruleset' })
      .locator('input[name="name"]').fill(name);
  }

  async closeRulesetDrawer(): Promise<void> {
    // The ruleset sub-drawer uses the same onclose-basic-drawer test ID as the main drawer.
    // Use .last() to target the sub-drawer's close button (rendered on top of the main drawer).
    await this.frame.getByTestId('onclose-basic-drawer').last().click();
  }

  async assertRulesetInactive(): Promise<void> {
    await expect(this.frame.getByText('Inactive').first()).toBeVisible({ timeout: 10000 });
  }

  async assertRulesetActive(): Promise<void> {
    // Manual rulesets default to Active after submission (unlike template rulesets which start Inactive)
    await expect(
      this.frame.locator('[data-testid^="toggle-status-"]').getByText('Active').first()
    ).toBeVisible({ timeout: 10000 });
  }

  async toggleRulesetToActive(): Promise<void> {
    // Xenia's custom toggle uses data-testid (no hyphens), not Contentful's data-test-id.
    // The UUID suffix is dynamic per ruleset, so match by prefix.
    await this.frame.locator('[data-testid^="toggle-status-"]').getByText('Inactive').click();
  }

  async toggleRulesetToInactive(): Promise<void> {
    await this.frame.locator('[data-testid^="toggle-status-"]').getByText('Active').click();
  }

  // ─── Manual ruleset condition builder ────────────────────────────────────────

  async searchAndSelectFirstConditionAttribute(searchText: string, optionText: string | RegExp): Promise<void> {
    // Condition 1 uses the Contentful cf-autocomplete component for attribute selection.
    // Select by visible option text, never by list index — the attribute list
    // grows/reorders as the app adds attributes (an index-2 pick once landed on
    // "Date in Month" instead of "name").
    const input = this.frame.locator('[data-test-id="cf-autocomplete-input"]');
    await input.click();
    await input.fill(searchText);
    const option = this.frame
      .locator('[data-test-id^="cf-autocomplete-list-item-"]')
      .filter({ hasText: optionText })
      .first();
    await expect(option).toBeVisible({ timeout: 10000 });
    console.log(`  Attribute selected: "${(await option.textContent())?.trim()}"`);
    await option.click();
  }

  async selectConditionOperator(conditionIndex: number, operator: string): Promise<void> {
    await this.frame.getByTestId('option-select-operator').nth(conditionIndex).selectOption(operator);
  }

  async fillConditionValue(conditionIndex: number, value: string): Promise<void> {
    await this.frame.locator('[data-test-id="cf-ui-text-input"]').nth(conditionIndex).fill(value);
  }

  async clickAddCondition(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Add another condition', exact: true }).click();
  }

  async searchAndSelectAdditionalConditionAttribute(searchText: string, optionName: string): Promise<void> {
    // Conditions 2+ use input[id^="field-"] for attribute search (not cf-autocomplete-input).
    const attrInput = this.frame.locator('input[id^="field-"]').last();
    await attrInput.click();
    await attrInput.fill(searchText);
    await this.frame.getByRole('option', { name: optionName }).click();
  }

  async fillAdditionalConditionValue(value: string): Promise<void> {
    // After attribute selection, value input uses input[id^="field-"]; .last() targets it.
    // pressSequentially is used because the field may be input[type=number] which rejects fill().
    const input = this.frame.locator('input[id^="field-"]').last();
    await input.click();
    await input.pressSequentially(value);
  }

  async uncheckIgnoreCaseForCondition(conditionIndex: number): Promise<void> {
    const checkbox = this.frame.locator('#ignore-case').nth(conditionIndex);
    if (await checkbox.isChecked()) {
      await checkbox.uncheck();
    }
  }

  async assertRuleExpression(partialText: string): Promise<void> {
    await expect(this.frame.getByText(partialText)).toBeVisible({ timeout: 5000 });
  }

  // ─── A/B Testing ──────────────────────────────────────────────────────────────

  async assertABTestingSectionVisible(): Promise<void> {
    // A/B section is visible immediately after a ruleset is added (even while Inactive).
    await expect(
      this.frame.locator('label').filter({ hasText: 'A/B testing' })
    ).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByText('Variant traffic')).toBeVisible({ timeout: 5000 });
    await expect(
      this.frame.locator('div').filter({ hasText: /^Control traffic$/ }).nth(1)
    ).toBeVisible({ timeout: 5000 });
  }

  async assertABTestingDisabled(): Promise<void> {
    // The A/B date field container is always rendered; only the toggle state ("Disabled") marks it as inactive.
    await expect(
      this.frame.locator('label').filter({ hasText: 'A/B testing' })
    ).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByText('Disabled')).toBeVisible({ timeout: 5000 });
  }

  async enableABTesting(): Promise<void> {
    await this.frame.getByText('Disabled').click();
  }

  async fillABTestEndDate(dateStr: string): Promise<void> {
    const input = this.frame.getByRole('textbox', { name: 'A/B test end date & time' });
    await input.click();
    await input.press('ArrowRight');
    await input.fill(dateStr);
  }

  async assertABTestValidationError(): Promise<void> {
    await expect(
      this.page.locator('[data-test-id="cf-ui-paragraph"]').first()
    ).toBeVisible({ timeout: 5000 });
  }

  async assertVariantTrafficEditable(): Promise<void> {
    const input = this.frame.getByPlaceholder('Variant Traffic percentage');
    await expect(input).toBeVisible({ timeout: 5000 });
    await expect(input).toBeEnabled();
  }

  async fillVariantTraffic(pct: number): Promise<void> {
    const input = this.frame.getByPlaceholder('Variant Traffic percentage');
    await input.fill(String(pct));
    await input.press('Tab');
  }

  async assertVariantTrafficValue(pct: number): Promise<void> {
    await expect(
      this.frame.getByPlaceholder('Variant Traffic percentage')
    ).toHaveValue(String(pct));
  }

  // ─── Channel-scoped helpers ───────────────────────────────────────────────────
  // Use these when the form has multiple channels so operations are scoped to the
  // correct channel accordion rather than the first matching element on the page.

  private channelAccordion(channelName: string) {
    return this.frame
      .locator('[data-test-id^="cf-ui-accordion-item-"]')
      .filter({
        has: this.frame
          .locator('[data-test-id="cf-ui-accordion-header"]')
          .getByRole('button', { name: channelName, exact: true }),
      });
  }

  async openChannelAccordion(channelName: string): Promise<void> {
    // Idempotent: only expands the accordion if "Add ruleset" is not already reachable.
    const addRuleset = this.channelAccordion(channelName).getByText('Add ruleset');
    const already = await addRuleset.isVisible().catch(() => false);
    if (!already) {
      await this.channelAccordion(channelName)
        .locator('[data-test-id="cf-ui-accordion-header"]')
        .getByRole('button', { name: channelName, exact: true })
        .click();
      await expect(addRuleset).toBeVisible({ timeout: 5000 });
    }
  }

  async assertRulesetInactiveForChannel(channelName: string): Promise<void> {
    await expect(
      this.channelAccordion(channelName).getByText('Inactive').first()
    ).toBeVisible({ timeout: 10000 });
  }

  async toggleRulesetToActiveForChannel(channelName: string): Promise<void> {
    await this.channelAccordion(channelName)
      .locator('[data-testid^="toggle-status-"]')
      .getByText('Inactive')
      .click();
  }

  async enableABTestingForChannel(channelName: string): Promise<void> {
    await this.channelAccordion(channelName).getByText('Disabled').click();
  }

  async fillABTestEndDateForChannel(channelName: string, dateStr: string): Promise<void> {
    await this.channelAccordion(channelName).locator('#ab-test-date').fill(dateStr);
  }

  async fillVariantTrafficForChannel(channelName: string, pct: number): Promise<void> {
    const input = this.channelAccordion(channelName).getByPlaceholder('Variant Traffic percentage');
    await input.fill(String(pct));
    await input.press('Tab');
  }
}
