import { FrameLocator, Page, expect } from '@playwright/test';

export class RedirectionCreatePage {
  readonly frame: FrameLocator;

  constructor(private readonly page: Page) {
    this.frame = page.frameLocator('[data-test-id="cf-widget-renderer"]');
  }

  // ─── Drawer visibility ────────────────────────────────────────────────────────

  async assertCreateDrawerVisible(): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { name: 'Create campaign' })
    ).toBeVisible({ timeout: 10000 });
  }

  // Opened via "Edit Campaign" on an existing (Draft) campaign — same drawer,
  // heading switches to "Update campaign".
  async assertUpdateDrawerVisible(): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { name: 'Update campaign' })
    ).toBeVisible({ timeout: 10000 });
  }

  // ─── Action buttons ───────────────────────────────────────────────────────────

  async assertSaveActivateButtonVisible(): Promise<void> {
    await expect(
      this.frame.getByTestId('submit-save-active-drawer')
    ).toBeVisible({ timeout: 5000 });
  }

  async assertSaveDraftButtonVisible(): Promise<void> {
    await expect(
      this.frame.getByTestId('submit-save-draft-drawer')
    ).toBeVisible({ timeout: 5000 });
  }

  async assertCancelButtonVisible(): Promise<void> {
    await expect(
      this.frame.getByTestId('onclose-basic-drawer')
    ).toBeVisible({ timeout: 5000 });
  }

  async getCancelButtonText(): Promise<string> {
    return (
      (await this.frame.getByTestId('onclose-basic-drawer').textContent()) ?? ''
    ).trim();
  }

  async assertAllActionButtonsVisible(): Promise<void> {
    await this.assertSaveActivateButtonVisible();
    await this.assertSaveDraftButtonVisible();
    await this.assertCancelButtonVisible();
  }

  // ─── Form field helpers ───────────────────────────────────────────────────────

  async fillCampaignName(name: string): Promise<void> {
    await this.frame.getByRole('textbox', { name: 'Campaign name *' }).fill(name);
  }

  async fillStartDateTime(dateTime: string): Promise<void> {
    const input = this.frame.getByRole('textbox', { name: 'Campaign start date & time (' });
    await input.click();
    await input.fill(dateTime);
  }

  async selectChannel(): Promise<void> {
    // Open the Channels React-Select dropdown (from codegen: nth(2) of divs with exact "Select..." text)
    await this.frame.locator('div').filter({ hasText: /^Select\.\.\.$/ }).nth(2).click();
    // Select option index 5 — use a suffix match to avoid coupling to the generated react-select-N number
    await this.frame.locator('[id$="-option-5"]').click();
  }

  async selectChannelByName(channelName: string): Promise<void> {
    // Open the Channels dropdown then select a specific channel by its visible text.
    // FIXED (TC-RD-021): the previous getByText(channelName, { exact: true }) matched
    // ANY "channelName" text on the page — including channel-name cells in the
    // campaign list table sitting underneath this drawer — and threw a strict-mode
    // violation once enough campaigns with that channel existed in the list (e.g.
    // "web", a very common channel name). Scope to the react-select option element
    // (.select__option) so only the dropdown's own options are matched.
    await this.frame.locator('div').filter({ hasText: /^Select\.\.\.$/ }).nth(2).click();
    await this.frame
      .locator('.select__option')
      .filter({ hasText: new RegExp(`^${channelName}$`) })
      .click();
  }

  // Selects an ADDITIONAL channel by name (bug-fix verification: multi-channel
  // campaigns). selectChannelByName()'s dropdown-opener locates the control via
  // its "Select..." placeholder text, which only exists before any channel has
  // been chosen — once one channel is selected that placeholder is gone, so a
  // second call to open the dropdown needs the stable "channels" combobox role
  // instead. The option-picking step itself is unaffected and reused as-is.
  async selectAdditionalChannelByName(channelName: string): Promise<void> {
    await this.frame.getByRole('combobox', { name: 'channels' }).click();
    await this.frame
      .locator('.select__option')
      .filter({ hasText: new RegExp(`^${channelName}$`) })
      .click();
  }

  // ─── Submit actions ──────────────────────────────────────────────────────────

  async clickSaveActivate(): Promise<void> {
    await this.frame.getByTestId('submit-save-active-drawer').click();
  }

  async clickSaveDraft(): Promise<void> {
    await this.frame.getByTestId('submit-save-draft-drawer').click();
  }

  // ─── Required-field validation (TC-RD-004) ───────────────────────────────────

  async assertCampaignNameValidation(): Promise<string> {
    const expected = 'Please enter campaign name';
    const locator  = this.frame.getByText(expected);
    await expect(locator).toBeVisible({ timeout: 5000 });
    const actual = (await locator.textContent())?.trim() ?? '';
    expect(
      actual,
      `Campaign name validation mismatch\n  Expected : "${expected}"\n  Actual   : "${actual}"`
    ).toBe(expected);
    return actual;
  }

  async assertStartDateValidation(): Promise<string> {
    const expected = 'Please select campaign start date & time';
    const locator  = this.frame.getByText('Please select campaign start');
    await expect(locator).toBeVisible({ timeout: 5000 });
    const actual = (await locator.textContent())?.trim() ?? '';
    expect(
      actual,
      `Start date validation mismatch\n  Expected : "${expected}"\n  Actual   : "${actual}"`
    ).toBe(expected);
    return actual;
  }

  // ─── Past start-date validation (TC-RD-007) ──────────────────────────────────

  async assertPastStartDateValidation(): Promise<string> {
    const expected = 'Campaign start date & time should be greater than current date & time';
    const locator  = this.frame.getByText(expected);
    await expect(locator).toBeVisible({ timeout: 5000 });
    const actual = (await locator.textContent())?.trim() ?? '';
    expect(
      actual,
      `Past start date validation mismatch\n  Expected : "${expected}"\n  Actual   : "${actual}"`
    ).toBe(expected);
    return actual;
  }

  // ─── Draft-save notification (TC-RD-005) ─────────────────────────────────────
  // Saving a draft without required fields fires a Contentful-level notification
  // on the main page (outside the Xenia iframe), not an inline form error.

  async assertDraftValidationNotification(): Promise<string> {
    // .last() — FIXED (flaky, TC-RD-008/TC-RD-022): in this suite's shared-page
    // pattern, a still-fading notification from an EARLIER test (a validation
    // toast, or even a "Save campaign successfully" toast from a real save) can
    // still be in the DOM when this one appears. A bare locator then matches
    // both and trips a strict-mode violation on toBeVisible(). Notifications are
    // appended to their container in DOM order, so the most recent one — the
    // one THIS action just triggered — is always the last match.
    const notification = this.page.locator('[data-test-id="cf-ui-notification"]').last();
    await expect(notification).toBeVisible({ timeout: 10000 });
    const paragraph = this.page.locator('[data-test-id="cf-ui-paragraph"]').last();
    await expect(paragraph).toBeVisible({ timeout: 5000 });
    const actual = (await paragraph.textContent())?.trim() ?? '';
    return actual;
  }

  async dismissNotificationIfVisible(): Promise<void> {
    // Dismisses EVERY currently-visible notification, not just one — FIXED:
    // the previous single bare locator would throw a strict-mode violation
    // (swallowed by the .catch() below, silently no-opping) whenever more than
    // one notification was stacked, e.g. a lingering toast from an earlier test
    // in this suite's shared-page pattern plus a fresh one from this test.
    // Re-reading .first() each pass (rather than indexing) tracks whichever
    // notification is currently frontmost as prior ones are dismissed. Capped
    // at 5 iterations — more notifications than that stacking up would be a
    // genuine app bug worth surfacing via the caller's next assertion, not
    // something this cleanup helper should loop on indefinitely.
    const notifications = this.page.locator('[data-test-id="cf-ui-notification"]');
    for (let i = 0; i < 5; i++) {
      const first = notifications.first();
      if (!(await first.isVisible({ timeout: 2000 }).catch(() => false))) break;
      // Click the × close button inside the notification, not the notification body.
      // FIXED: the notification can be mid-way through its own auto-dismiss fade-out
      // animation at the exact moment this click fires, which fails Playwright's
      // actionability check ("element is not stable" / "element was detached from
      // the DOM") and previously hung the whole helper for the full 30s default
      // timeout. A short, swallowed timeout here means an already-vanishing
      // notification is simply treated as dismissed on the next loop check instead
      // of blocking the caller.
      await first.locator('button').click({ timeout: 5000 }).catch(() => {});
      await expect(first).not.toBeVisible({ timeout: 5000 }).catch(() => {});
    }
  }

  // ─── Ruleset section (TC-RD-009+) ────────────────────────────────────────────

  async assertRulesetSectionEmpty(): Promise<void> {
    // In the empty state the Ruleset section contains only the "Add ruleset" link —
    // no ruleset items have been added yet.
    await expect(
      this.frame.getByText('Add ruleset').first()
    ).toBeVisible({ timeout: 5000 });
  }

  async clickAddRuleset(): Promise<void> {
    await this.frame.getByText('Add ruleset').first().click();
  }

  async assertAddRulesetPanelHeading(): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { name: 'Add ruleset' })
    ).toBeVisible({ timeout: 10000 });
  }

  async assertAddRulesetPanelButtons(): Promise<void> {
    // "New ruleset" button (from codegen)
    await expect(
      this.frame.getByRole('button', { name: 'New ruleset' })
    ).toBeVisible({ timeout: 5000 });
    // "Add ruleset" submit button inside the dialog (div acting as button, from codegen)
    await expect(
      this.frame.getByLabel('Add ruleset').locator('div').filter({ hasText: /^Add ruleset$/ }).first()
    ).toBeVisible({ timeout: 5000 });
    // Cancel button — scoped to the "Add ruleset" dialog (from codegen)
    await expect(
      this.frame.getByRole('dialog', { name: 'Add ruleset' }).getByTestId('onclose-basic-drawer')
    ).toBeVisible({ timeout: 5000 });
  }

  async assertAddRulesetPanelFields(): Promise<void> {
    // Name field label (from codegen: exact match to avoid matching "Campaign name *")
    await expect(
      this.frame.getByText('Name *', { exact: true })
    ).toBeVisible({ timeout: 5000 });
    // Description field — scoped inside the "Add ruleset" dialog (from codegen)
    await expect(
      this.frame.getByLabel('Add ruleset').getByText('Description')
    ).toBeVisible({ timeout: 5000 });
    // Defining rule field
    await expect(
      this.frame.getByText('Defining rule *')
    ).toBeVisible({ timeout: 5000 });
    // Rule String field (from codegen: two separate assertions use this text)
    await expect(
      this.frame.getByText('Rule String').first()
    ).toBeVisible({ timeout: 5000 });
  }

  // ─── Template selection in Add ruleset panel (TC-RD-010) ─────────────────────

  async openTemplateDropdown(): Promise<void> {
    // The "Choose a template" React Select control is the first .select__control in the dialog
    await this.frame
      .getByRole('dialog', { name: 'Add ruleset' })
      .locator('.select__control')
      .first()
      .click();
  }

  async assertTemplateOptionVisible(templateName: string): Promise<void> {
    // Template dropdown options don't expose role="option" — use getByText (same as codegen channel approach)
    await expect(
      this.frame.getByText(templateName, { exact: true })
    ).toBeVisible({ timeout: 5000 });
  }

  async selectTemplate(templateName: string): Promise<void> {
    await this.frame.getByText(templateName, { exact: true }).click();
  }

  // Returns all visible template names from the currently-open "Choose a template" dropdown.
  async getAvailableTemplateNames(): Promise<string[]> {
    const options = this.frame.locator('.select__option');
    await expect(options.first()).toBeVisible({ timeout: 5000 });
    const count   = await options.count();
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = (await options.nth(i).textContent())?.trim();
      if (text) names.push(text);
    }
    return names;
  }

  // Selects the first available template from the open dropdown and returns its name.
  // This keeps the test data-agnostic — any template in the list is valid.
  async selectFirstAvailableTemplate(): Promise<string> {
    const options      = this.frame.locator('.select__option');
    const firstOption  = options.first();
    await expect(firstOption).toBeVisible({ timeout: 5000 });
    const templateName = (await firstOption.textContent())?.trim() ?? '';
    expect(templateName, 'First template option must have a non-empty name').not.toBe('');
    await firstOption.click();
    return templateName;
  }

  async assertTemplateFormAutofilled(): Promise<string> {
    const dialog    = this.frame.getByRole('dialog', { name: 'Add ruleset' });
    const nameInput = dialog.locator('input[name="name"]');
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    const nameValue = await nameInput.inputValue();
    expect(nameValue, 'Name field must be auto-filled from the selected template — got empty string').not.toBe('');
    // Defining rule autocomplete field (auto-selected from template)
    await expect(
      this.frame.locator('[data-test-id="cf-autocomplete-input"]')
    ).toBeVisible({ timeout: 5000 });
    // Operator selector (auto-set from template)
    await expect(
      this.frame.getByTestId('option-select-operator')
    ).toBeVisible({ timeout: 5000 });
    // Value text input (auto-set from template)
    await expect(
      this.frame.locator('[data-test-id="cf-ui-text-input"]')
    ).toBeVisible({ timeout: 5000 });
    return nameValue;
  }

  async assertRuleStringPreview(partialText: string): Promise<void> {
    await expect(
      this.frame.getByText(partialText)
    ).toBeVisible({ timeout: 5000 });
  }

  async submitAddRulesetPanel(): Promise<void> {
    await this.frame.getByTestId('submit-basic-drawer').click();
    await expect(
      this.frame.getByRole('heading', { name: 'Add ruleset' })
    ).not.toBeVisible({ timeout: 10000 });
  }

  async assertRulesetAddedToTable(rulesetName: string): Promise<void> {
    await expect(
      this.frame.getByRole('cell', { name: rulesetName })
    ).toBeVisible({ timeout: 10000 });
  }

  async assertRulesetInitialStatus(): Promise<string> {
    const expectedStatus = 'Inactive';
    // Exact-match cell assertion (from codegen)
    await expect(
      this.frame.getByRole('cell', { name: expectedStatus, exact: true })
    ).toBeVisible({ timeout: 5000 });
    const actualStatus = (
      await this.frame.getByRole('cell', { name: expectedStatus, exact: true }).textContent()
    )?.trim() ?? '';
    expect(
      actualStatus,
      `Ruleset initial status mismatch\n  Expected : "${expectedStatus}"\n  Actual   : "${actualStatus}"`
    ).toBe(expectedStatus);
    // Also assert the plain "Inactive" text is visible (from codegen: getByText first)
    await expect(
      this.frame.getByText(expectedStatus).first()
    ).toBeVisible({ timeout: 5000 });
    return actualStatus;
  }

  async assertRulesetActionButtons(): Promise<void> {
    // "+Add rules" / custom action button (from codegen: getByTestId('custom'))
    await expect(this.frame.getByTestId('custom')).toBeVisible({ timeout: 5000 });
    // Actions container (from codegen: .actions)
    await expect(this.frame.locator('.actions')).toBeVisible({ timeout: 5000 });
    // Delete button (from codegen: getByTestId('delete'))
    await expect(this.frame.getByTestId('delete')).toBeVisible({ timeout: 5000 });
  }

  // ─── Ruleset status toggle (TC-RD-011) ──────────────────────────────────────

  async assertRulesetStatusInactive(): Promise<string> {
    const expected = 'Inactive';
    // Two "Inactive" elements visible: status badge + clickable toggle label
    await expect(this.frame.getByText(expected).first()).toBeVisible({ timeout: 10000 });
    await expect(this.frame.getByText(expected).nth(1)).toBeVisible({ timeout: 5000 });
    const actual = (await this.frame.getByText(expected).first().textContent())?.trim() ?? '';
    expect(
      actual,
      `Ruleset initial status mismatch\n  Expected : "${expected}"\n  Actual   : "${actual}"`
    ).toBe(expected);
    return actual;
  }

  async clickRulesetInactiveToggle(): Promise<void> {
    // nth(1) is the toggle label (from codegen) — clicking it switches Inactive → Active
    await this.frame.getByText('Inactive').nth(1).click();
  }

  // Symmetric counterpart for switching Active → Inactive (bug-fix verification
  // TC-BF-RD-006). FIXED: reusing clickRulesetInactiveToggle() here doesn't
  // work — once the ruleset is Active there is no "Inactive" text left on the
  // page for that method's locator to match, so it hangs until timeout instead
  // of toggling anything.
  async clickRulesetActiveToggle(): Promise<void> {
    await this.frame.getByText('Active').nth(1).click();
  }

  async assertRulesetStatusActive(): Promise<string> {
    const expected = 'Active';
    // After toggling, two "Active" elements must be visible (codegen: nth(1) then first)
    await expect(this.frame.getByText(expected).nth(1)).toBeVisible({ timeout: 10000 });
    await expect(this.frame.getByText(expected).first()).toBeVisible({ timeout: 5000 });
    const actual = (await this.frame.getByText(expected).nth(1).textContent())?.trim() ?? '';
    expect(
      actual,
      `Ruleset status after toggle mismatch\n  Expected : "${expected}"\n  Actual   : "${actual}"`
    ).toBe(expected);
    return actual;
  }

  // ─── Channel-scoped ruleset helpers (bug-fix verification: multi-channel) ────
  // Every method above targets "whichever ruleset row exists" via bare/positional
  // locators — fine when a campaign has exactly one channel/ruleset, but ambiguous
  // once it has two or more. Each channel's Ruleset section renders as its own
  // accessible region named after the channel (e.g. region "Mobile", region "WEB"),
  // so these variants scope into that region to unambiguously target one channel's
  // ruleset regardless of how many others exist on the same drawer.

  private rulesetRegionForChannel(channelName: string) {
    return this.frame.getByRole('region', { name: channelName, exact: true });
  }

  async clickAddRulesetForChannel(channelName: string): Promise<void> {
    const header = this.frame.getByRole('button', { name: channelName, exact: true });
    if ((await header.getAttribute('aria-expanded')) !== 'true') {
      await header.click();
    }
    await this.rulesetRegionForChannel(channelName).getByText('Add ruleset').click();
  }

  async getRulesetStatusTextForChannel(channelName: string): Promise<string> {
    const cell = this.rulesetRegionForChannel(channelName)
      .getByRole('cell', { name: /^(Active|Inactive)$/, exact: true })
      .first();
    await expect(cell).toBeVisible({ timeout: 10000 });
    return (await cell.textContent())?.trim() ?? '';
  }

  async toggleRulesetForChannel(channelName: string): Promise<void> {
    const current = await this.getRulesetStatusTextForChannel(channelName);
    await this.rulesetRegionForChannel(channelName).getByText(current).nth(1).click();
  }

  async clickAddRulesInRulesetForChannel(channelName: string): Promise<void> {
    await this.rulesetRegionForChannel(channelName).getByTestId('custom').click();
  }

  // ─── Update ruleset panel (TC-RD-012 / TC-RD-013) ──────────────────────────

  async clickEditRuleset(): Promise<void> {
    await expect(this.frame.getByTestId('edit')).toBeVisible({ timeout: 5000 });
    await this.frame.getByTestId('edit').click();
  }

  async assertUpdateRulesetPanelVisible(): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { name: 'Update ruleset' })
    ).toBeVisible({ timeout: 10000 });
  }

  async assertUpdateRulesetNameField(expectedName: string): Promise<string> {
    const dialog    = this.frame.getByRole('dialog', { name: 'Update ruleset' });
    const nameInput = dialog.locator('input[name="name"]');
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    // Wait for the value to be populated — it loads asynchronously after the panel opens
    await expect(nameInput).toHaveValue(expectedName, { timeout: 10000 });
    const actual = await nameInput.inputValue();
    expect(
      actual,
      `Update ruleset name mismatch\n  Expected : "${expectedName}"\n  Actual   : "${actual}"`
    ).toBe(expectedName);
    return actual;
  }

  async assertUpdateRulesetPanelFields(): Promise<void> {
    // All rule condition fields must be visible — data persisted from the saved template
    await expect(
      this.frame.locator('[data-test-id="cf-ui-select"]').first()
    ).toBeVisible({ timeout: 5000 });
    await expect(
      this.frame.locator('[data-test-id="cf-autocomplete-input"]')
    ).toBeVisible({ timeout: 5000 });
    await expect(
      this.frame.getByTestId('option-select-operator')
    ).toBeVisible({ timeout: 5000 });
    await expect(
      this.frame.locator('[data-test-id="cf-ui-text-input"]')
    ).toBeVisible({ timeout: 5000 });
    // Ignore Case label (present for string "contains" type rule conditions)
    await expect(
      this.frame.locator('div').filter({ hasText: /^Ignore Case$/ }).first()
    ).toBeVisible({ timeout: 5000 });
    // Submit button
    await expect(
      this.frame.getByTestId('submit-basic-drawer')
    ).toBeVisible({ timeout: 5000 });
  }

  async fillUpdateRulesetName(name: string): Promise<void> {
    const nameInput = this.frame
      .getByRole('dialog', { name: 'Update ruleset' })
      .locator('input[name="name"]');
    await nameInput.click();
    await nameInput.fill(name);
  }

  async fillUpdateRulesetValueInput(value: string): Promise<void> {
    const textInput = this.frame.locator('[data-test-id="cf-ui-text-input"]');
    await textInput.click();
    await textInput.fill(value);
  }

  async getUpdateRulesetValueInputValue(): Promise<string> {
    return (
      await this.frame.locator('[data-test-id="cf-ui-text-input"]').inputValue()
    );
  }

  async submitUpdateRulesetPanel(): Promise<void> {
    await this.frame.getByTestId('submit-basic-drawer').click();
    await expect(
      this.frame.getByRole('heading', { name: 'Update ruleset' })
    ).not.toBeVisible({ timeout: 10000 });
  }

  async assertUpdateRulesetRuleStringVisible(): Promise<void> {
    // Assert the Rule String section label is present in the Update ruleset panel
    await expect(
      this.frame.getByRole('dialog', { name: 'Update ruleset' }).getByText('Rule String')
    ).toBeVisible({ timeout: 5000 });
  }

  async assertUpdateRulesetPanelButtons(): Promise<string> {
    const dialog = this.frame.getByRole('dialog', { name: 'Update ruleset' });

    // "New ruleset" button
    await expect(
      dialog.getByRole('button', { name: 'New ruleset' })
    ).toBeVisible({ timeout: 5000 });

    // Submit button — get actual label text for actual vs expected assertion
    const submitBtn  = dialog.getByTestId('submit-basic-drawer');
    await expect(submitBtn).toBeVisible({ timeout: 5000 });
    const submitText = (await submitBtn.textContent())?.trim() ?? '';
    const expectedSubmitText = 'Update ruleset';
    expect(
      submitText,
      `Submit button label mismatch\n  Expected : "${expectedSubmitText}"\n  Actual   : "${submitText}"`
    ).toBe(expectedSubmitText);

    // Cancel button
    await expect(
      dialog.getByTestId('onclose-basic-drawer')
    ).toBeVisible({ timeout: 5000 });

    return submitText;
  }

  // ─── Manual ruleset creation helpers (TC-RD-016) ───────────────────────────

  async fillAddRulesetName(name: string): Promise<void> {
    const dialog    = this.frame.getByRole('dialog', { name: 'Add ruleset' });
    const nameInput = dialog.locator('input[name="name"]');
    await nameInput.click();
    await nameInput.fill(name);
  }

  async selectRuleAttributeByName(attributeLabel: string): Promise<void> {
    // Types into the rule-condition attribute autocomplete to filter its list,
    // then clicks the option whose own text matches — content-based, not
    // position-based. Works in both the Add ruleset and Add rule panels, which
    // share the same underlying autocomplete component/test-ids.
    //
    // FIXED (TC-RD-016/TC-RD-020): replaces two index/keyboard-nav approaches
    // that picked a fixed POSITION in the attribute list — position 11 in the
    // full (unfiltered) list via ArrowDown×12, or item-index 2 in a filtered
    // "age" search. Both drifted silently as attributes were added to this
    // shared, growing QA environment (confirmed live): index 11 once resolved
    // to the "name_user" attribute (now displayed as "name [User]") and
    // drifted to a list-type attribute, whose value control isn't the plain
    // text input the next step expects; the "age" search's item 2 once resolved
    // to a numeric attribute and drifted to "Campaign Management ID [Session]",
    // whose operator dropdown has no "<" option. Both failures manifested as a
    // silent 120s hang with no distinguishing error — this fix trades a
    // hardcoded position for a hardcoded name, so a real "attribute renamed or
    // removed" failure now surfaces immediately via the toBeVisible() below
    // instead of hanging.
    //
    // Pass the FULL visible label including its "[Category]" suffix (e.g.
    // "name [User]", "User_Age [User]") — attribute names are not unique on
    // their own (e.g. "name" also exists as "name [Table_1]", "name_list
    // [User]", etc.), and hasText here is a plain substring match, not regex,
    // so the brackets need no escaping.
    const input = this.frame.locator('[data-test-id="cf-autocomplete-input"]');
    await input.click();
    await input.fill(attributeLabel);
    const option = this.frame
      .locator('[data-test-id^="cf-autocomplete-list-item-"]')
      .filter({ hasText: attributeLabel })
      .first();
    await expect(option).toBeVisible({ timeout: 5000 });
    await option.click();
  }

  async selectFirstAvailableRuleAttribute(searchText: string, requiredOperatorValue?: string): Promise<string> {
    // Data-agnostic pick: types a broad search term, then clicks a REAL result
    // (skipping list-item-0, which is a non-selectable category header) rather
    // than pinning to one specific attribute name — keeps the test from being
    // coupled to any single attribute that may be renamed/removed later.
    //
    // When requiredOperatorValue is given, attribute NAMES don't reliably imply
    // TYPE (confirmed live: "same_name_attribute_differ_type [User]" — despite
    // its "name"-like label — is numeric, not string, and doesn't offer
    // "startsWith"). So this tries each candidate in order and keeps the first
    // one whose operator dropdown actually offers the required operator,
    // instead of assuming position 1 is compatible.
    //
    // Returns the picked attribute's label for reuse in later assertions.
    const input = this.frame.locator('[data-test-id="cf-autocomplete-input"]');
    await input.click();
    await input.fill(searchText);
    await expect(
      this.frame.locator('[data-test-id="cf-autocomplete-list-item-1"]')
    ).toBeVisible({ timeout: 5000 });
    const items = this.frame.locator('[data-test-id^="cf-autocomplete-list-item-"]');
    const count = await items.count();

    for (let i = 1; i < count; i++) {
      const label = (await items.nth(i).textContent())?.trim() ?? '';
      if (!label) continue;
      await items.nth(i).click();

      if (!requiredOperatorValue) return label;

      const values = await this.frame
        .getByTestId('option-select-operator')
        .locator('option')
        .evaluateAll(els => els.map(e => (e as HTMLOptionElement).value));
      if (values.includes(requiredOperatorValue)) return label;

      // Not compatible — reopen the filtered list and try the next candidate
      await input.click();
      await input.fill(searchText);
      await expect(
        this.frame.locator('[data-test-id="cf-autocomplete-list-item-1"]')
      ).toBeVisible({ timeout: 5000 });
    }

    throw new Error(
      `No attribute matching "${searchText}" offers operator "${requiredOperatorValue}" (checked ${count - 1} candidate(s))`
    );
  }

  async selectRuleConditionOperator(operatorValue: string): Promise<void> {
    await this.frame.getByTestId('option-select-operator').selectOption(operatorValue);
  }

  async getUpdateRulesetOperatorValue(): Promise<string> {
    return await this.frame.getByTestId('option-select-operator').inputValue();
  }

  async getUpdateRulesetAttributeFieldValue(): Promise<string> {
    // Reads the attribute autocomplete's displayed value inside the Update
    // ruleset panel — used to verify the previously-selected attribute is
    // correctly persisted and re-displayed when the ruleset is reopened for edit.
    // Trimmed: confirmed live that the persisted value carries a trailing space
    // (e.g. "new_name_1 [Table_1] ") that the value at selection time does not —
    // a minor app-side whitespace quirk, not a difference in attribute identity.
    const value = await this.frame.locator('[data-test-id="cf-autocomplete-input"]').inputValue();
    return value.trim();
  }

  async getRuleStringPreviewText(): Promise<string> {
    // Full, normalised text of the Rule String preview — used to capture the
    // actual generated rule string dynamically (e.g. right after building a
    // condition) so it can be compared for consistency later (e.g. after
    // reopening Edit) without hardcoding an attribute-specific expected value.
    const raw = (await this.frame.locator('code').first().textContent()) ?? '';
    return raw.replace(/\s+/g, ' ').trim();
  }

  async clickNewRulesetButtonInUpdatePanel(): Promise<void> {
    const dialog = this.frame.getByRole('dialog', { name: 'Update ruleset' });
    await expect(
      dialog.getByRole('button', { name: 'New ruleset' })
    ).toBeVisible({ timeout: 5000 });
    await dialog.getByRole('button', { name: 'New ruleset' }).click();
  }

  // Asserts all fields are cleared after clicking "New ruleset".
  // Returns { name, description, ruleString } for console logging.
  async assertFieldsClearedAfterNewRuleset(): Promise<{ name: string; description: string; ruleString: string }> {
    const dialog = this.frame.getByRole('dialog', { name: 'Update ruleset' });

    // Name field must be empty
    const nameInput = dialog.locator('input[name="name"]');
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    const actualName = await nameInput.inputValue();
    expect(actualName, `Name must be cleared — expected "" got "${actualName}"`).toBe('');

    // Description textarea must be empty
    const descTextarea = dialog.locator('textarea[name="description"]');
    await expect(descTextarea).toBeVisible({ timeout: 5000 });
    const actualDesc = await descTextarea.inputValue();
    expect(actualDesc, `Description must be cleared — expected "" got "${actualDesc}"`).toBe('');

    // Defining rule section label must still be present in empty state
    await expect(
      this.frame.getByText('Defining rule *')
    ).toBeVisible({ timeout: 5000 });

    // Rule String preview must show "( )" — no conditions remaining.
    // The element's textContent may include internal newlines/whitespace, so we normalise
    // before comparing (e.g. "(\n  \n)" → "( )").
    const ruleStringLocator = this.frame.getByText('( )').first();
    await expect(ruleStringLocator).toBeVisible({ timeout: 5000 });
    const rawRuleString    = (await ruleStringLocator.textContent()) ?? '';
    const actualRuleString = rawRuleString.replace(/\s+/g, ' ').trim();
    const expectedRuleString = '( )';
    expect(
      actualRuleString,
      `Rule String must show "${expectedRuleString}" when cleared — got "${actualRuleString}"`
    ).toBe(expectedRuleString);

    return { name: actualName, description: actualDesc, ruleString: actualRuleString };
  }

  async closeUpdateRulesetPanel(): Promise<void> {
    await this.frame
      .getByRole('dialog', { name: 'Update ruleset' })
      .getByTestId('onclose-basic-drawer')
      .click();
    await expect(
      this.frame.getByRole('heading', { name: 'Update ruleset' })
    ).not.toBeVisible({ timeout: 5000 });
  }

  async closeAddRulesetPanel(): Promise<void> {
    await this.frame
      .getByRole('dialog', { name: 'Add ruleset' })
      .getByTestId('onclose-basic-drawer')
      .click();
    await expect(
      this.frame.getByRole('heading', { name: 'Add ruleset' })
    ).not.toBeVisible({ timeout: 5000 });
  }

  // ─── Rule panel (TC-RD-017) ──────────────────────────────────────────────────

  async clickCustomAddRule(): Promise<void> {
    await expect(this.frame.getByTestId('custom')).toBeVisible({ timeout: 5000 });
    await this.frame.getByTestId('custom').click();
  }

  async assertRulePanelHeading(): Promise<string> {
    const expected = 'Rule';
    const heading  = this.frame.getByRole('heading', { name: expected, exact: true });
    await expect(heading).toBeVisible({ timeout: 10000 });
    const actual = (await heading.textContent())?.trim() ?? '';
    expect(actual, `Rule panel heading mismatch\n  Expected : "${expected}"\n  Actual   : "${actual}"`).toBe(expected);
    return actual;
  }

  async assertRulePanelAddRuleButton(): Promise<string> {
    const btn = this.frame.getByTestId('add-rule');
    await expect(btn).toBeVisible({ timeout: 5000 });
    const actual = (await btn.textContent())?.trim() ?? '';
    return actual;
  }

  async assertRulePanelSubmitButton(): Promise<string> {
    const btn = this.frame
      .getByRole('dialog', { name: 'Rule' })
      .getByTestId('submit-basic-drawer');
    await expect(btn).toBeVisible({ timeout: 5000 });
    const actual = (await btn.textContent())?.trim() ?? '';
    return actual;
  }

  async assertRulePanelCancelButton(): Promise<void> {
    await expect(
      this.frame
        .getByRole('dialog', { name: 'Rule' })
        .getByTestId('onclose-basic-drawer')
    ).toBeVisible({ timeout: 5000 });
  }

  async assertRulePanelEmptyState(): Promise<string> {
    const expected = 'No records found';
    const locator  = this.frame.getByText(expected).first();
    await expect(locator).toBeVisible({ timeout: 5000 });
    const actual = (await locator.textContent())?.trim() ?? '';
    expect(actual, `Empty state mismatch\n  Expected : "${expected}"\n  Actual   : "${actual}"`).toBe(expected);
    return actual;
  }

  async closeRulePanel(): Promise<void> {
    await this.frame
      .getByRole('dialog', { name: 'Rule' })
      .getByTestId('onclose-basic-drawer')
      .click();
    await expect(
      this.frame.getByRole('heading', { name: 'Rule', exact: true })
    ).not.toBeVisible({ timeout: 5000 });
  }

  // ─── Add rule panel (TC-RD-018) ──────────────────────────────────────────────

  async clickAddRuleInsideRulePanel(): Promise<void> {
    await this.frame.getByTestId('add-rule').click();
  }

  async assertAddRulePanelHeading(): Promise<string> {
    const expected = 'Add rule';
    const heading  = this.frame.getByRole('heading', { name: expected });
    await expect(heading).toBeVisible({ timeout: 10000 });
    const actual = (await heading.textContent())?.trim() ?? '';
    expect(actual, `Add rule panel heading mismatch\n  Expected : "${expected}"\n  Actual   : "${actual}"`).toBe(expected);
    return actual;
  }

  async assertAddRulePanelNameLabel(): Promise<void> {
    await expect(
      this.frame.getByRole('dialog', { name: 'Add rule' }).getByText('Name *', { exact: true })
    ).toBeVisible({ timeout: 5000 });
  }

  async getAddRulePanelNameFieldValue(): Promise<string> {
    return this.frame
      .getByRole('dialog', { name: 'Add rule' })
      .locator('input[name="name"]')
      .inputValue();
  }

  async assertAddRulePanelDescriptionLabel(): Promise<void> {
    await expect(
      this.frame.getByRole('dialog', { name: 'Add rule' }).getByText('Description')
    ).toBeVisible({ timeout: 5000 });
  }

  async getAddRulePanelDescriptionValue(): Promise<string> {
    return this.frame
      .getByRole('dialog', { name: 'Add rule' })
      .locator('textarea[name="description"]')
      .inputValue();
  }

  async assertAddRulePanelDefiningRuleSection(): Promise<void> {
    const dialog = this.frame.getByRole('dialog', { name: 'Add rule' });
    await expect(dialog.getByText('Defining rule *')).toBeVisible({ timeout: 5000 });
    await expect(
      dialog.locator('div').filter({ hasText: /^All \(AND\)Any \(OR\)$/ }).first()
    ).toBeVisible({ timeout: 5000 });
  }

  async assertAddRulePanelRuleStringEmpty(): Promise<string> {
    const dialog = this.frame.getByRole('dialog', { name: 'Add rule' });
    await expect(dialog.getByText('Rule String')).toBeVisible({ timeout: 5000 });
    const expected   = '( )';
    const ruleString = this.frame.getByText(expected);
    await expect(ruleString).toBeVisible({ timeout: 5000 });
    const actual = (await ruleString.textContent())?.trim() ?? '';
    return actual;
  }

  async assertAddRulePanelTemplateDropdown(): Promise<void> {
    await expect(
      this.frame.getByRole('dialog', { name: 'Add rule' }).getByText('Choose a template')
    ).toBeVisible({ timeout: 5000 });
  }

  async assertAddRulePanelButtons(): Promise<{ newRule: string; addRule: string }> {
    const newRuleBtn = this.frame.getByRole('button', { name: 'New rule' });
    const addRuleBtn = this.frame.getByRole('button', { name: 'Add rule', exact: true });
    await expect(newRuleBtn).toBeVisible({ timeout: 5000 });
    await expect(addRuleBtn).toBeVisible({ timeout: 5000 });
    await expect(
      this.frame.getByRole('dialog', { name: 'Add rule' }).getByTestId('onclose-basic-drawer')
    ).toBeVisible({ timeout: 5000 });
    return {
      newRule: (await newRuleBtn.textContent())?.trim() ?? '',
      addRule: (await addRuleBtn.textContent())?.trim() ?? '',
    };
  }

  async closeAddRulePanel(): Promise<void> {
    await this.frame
      .getByRole('dialog', { name: 'Add rule' })
      .getByTestId('onclose-basic-drawer')
      .click();
    await expect(
      this.frame.getByRole('heading', { name: 'Add rule' })
    ).not.toBeVisible({ timeout: 5000 });
  }

  // ─── Add rule panel — template select + submit (TC-RD-019) ──────────────────

  async openAddRulePanelTemplateDropdown(): Promise<void> {
    await this.frame
      .getByRole('dialog', { name: 'Add rule' })
      .locator('.select__control')
      .click();
  }

  async selectAddRulePanelTemplate(templateName: string): Promise<void> {
    await this.frame.getByText(templateName, { exact: true }).click();
  }

  // Selects the first available template from the open "Add rule" template
  // dropdown and returns its name — data-agnostic, mirrors
  // selectFirstAvailableTemplate() for the ruleset-level template dropdown.
  async selectFirstAvailableRuleTemplate(): Promise<string> {
    const options     = this.frame.getByRole('dialog', { name: 'Add rule' }).locator('.select__option');
    const firstOption = options.first();
    await expect(firstOption).toBeVisible({ timeout: 5000 });
    const templateName = (await firstOption.textContent())?.trim() ?? '';
    expect(templateName, 'First rule template option must have a non-empty name').not.toBe('');
    await firstOption.click();
    return templateName;
  }

  async submitAddRulePanel(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Add rule', exact: true }).click();
  }

  // ─── Rule table row assertions (TC-RD-019) ───────────────────────────────────

  async assertRuleRowVisible(rowAriaName: string): Promise<void> {
    await expect(
      this.frame.getByRole('row', { name: rowAriaName })
    ).toBeVisible({ timeout: 10000 });
  }

  async getRuleRowNameCellText(nameCellPartial: string): Promise<string> {
    const cell = this.frame.getByRole('cell', { name: nameCellPartial }).first();
    await expect(cell).toBeVisible({ timeout: 5000 });
    return (await cell.textContent())?.trim() ?? '';
  }

  async getRuleRowStatusCellText(expectedStatus: string): Promise<string> {
    const cell = this.frame
      .getByLabel('Rule')
      .getByRole('cell', { name: expectedStatus, exact: true })
      .first();
    await expect(cell).toBeVisible({ timeout: 5000 });
    return (await cell.textContent())?.trim() ?? '';
  }

  async assertRuleRowAddRedirectionUrlButton(): Promise<string> {
    const btn = this.frame.getByRole('button', { name: '+ Add Redirection URL' });
    await expect(btn).toBeVisible({ timeout: 5000 });
    return (await btn.textContent())?.trim() ?? '';
  }

  async assertRuleRowEditButton(rowAriaName: string): Promise<void> {
    await expect(
      this.frame.getByRole('row', { name: rowAriaName }).getByTestId('edit')
    ).toBeVisible({ timeout: 5000 });
  }

  async assertRuleRowDeleteButton(rowAriaName: string): Promise<void> {
    await expect(
      this.frame.getByRole('row', { name: rowAriaName }).getByTestId('delete')
    ).toBeVisible({ timeout: 5000 });
  }

  async clickRuleRowEditButton(rowAriaName: string): Promise<void> {
    await this.frame
      .getByRole('row', { name: rowAriaName })
      .getByTestId('edit')
      .click();
  }

  // ─── Update rule panel (TC-RD-019) ───────────────────────────────────────────

  async assertUpdateRulePanelHeading(): Promise<string> {
    const expected = 'Update rule';
    const heading  = this.frame.getByRole('heading', { name: expected });
    await expect(heading).toBeVisible({ timeout: 10000 });
    const actual = (await heading.textContent())?.trim() ?? '';
    expect(actual, `Update rule panel heading mismatch\n  Expected : "${expected}"\n  Actual   : "${actual}"`).toBe(expected);
    return actual;
  }

  async getUpdateRulePanelNameValue(): Promise<string> {
    const nameInput = this.frame
      .getByRole('dialog', { name: 'Update rule' })
      .locator('input[name="name"]');
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await expect(nameInput).not.toHaveValue('', { timeout: 5000 });
    return nameInput.inputValue();
  }

  async closeUpdateRulePanel(): Promise<void> {
    await this.frame
      .getByRole('dialog', { name: 'Update rule' })
      .getByTestId('onclose-basic-drawer')
      .click();
    await expect(
      this.frame.getByRole('heading', { name: 'Update rule' })
    ).not.toBeVisible({ timeout: 5000 });
  }

  // ─── Add rule panel — manual fill (TC-RD-020) ───────────────────────────────

  async clickNewRuleButton(): Promise<void> {
    await this.frame.getByRole('button', { name: 'New rule' }).click();
  }

  async fillAddRulePanelName(name: string): Promise<void> {
    const input = this.frame
      .getByRole('dialog', { name: 'Add rule' })
      .locator('input[name="name"]');
    await input.click();
    await input.fill(name);
  }

  async selectAddRulePanelOperator(operatorValue: string): Promise<void> {
    // Wait for the operator dropdown to become enabled (it's disabled until an attribute is selected)
    const select = this.frame.getByTestId('option-select-operator');
    await expect(select).toBeEnabled({ timeout: 10000 });
    await select.selectOption(operatorValue);
  }

  async fillAddRulePanelValue(value: string): Promise<void> {
    // The value input for numeric attributes is a spinbutton (number input) with no accessible
    // name. It is the only spinbutton inside the Add rule dialog once operator is selected.
    const input = this.frame
      .getByRole('dialog', { name: 'Add rule' })
      .getByRole('spinbutton');
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill(value);
  }

  async assertRuleDialogEditButtonVisible(): Promise<void> {
    await expect(
      this.frame.getByRole('dialog', { name: 'Rule' }).getByTestId('edit')
    ).toBeVisible({ timeout: 10000 });
  }

  async clickRuleDialogEditButton(): Promise<void> {
    await this.frame.getByRole('dialog', { name: 'Rule' }).getByTestId('edit').click();
  }

  // ─── Add experience panel — Redirection URL + A/B testing (TC-RD-021) ───────
  // Opened via "+ Add Redirection URL" on a rule row inside the Rule panel.

  async clickAddRedirectionUrl(): Promise<void> {
    await this.frame.getByRole('button', { name: '+ Add Redirection URL' }).click();
  }

  async assertAddExperiencePanelVisible(): Promise<void> {
    // exact: true — the panel also renders a breadcrumb heading ending in the
    // same "... > Add Experience" text, which would otherwise also match.
    await expect(
      this.frame.getByRole('heading', { name: 'Add experience', exact: true })
    ).toBeVisible({ timeout: 10000 });
  }

  async fillDefaultPathname(path: string): Promise<void> {
    await this.frame.getByRole('textbox', { name: 'Default Pathname' }).fill(path);
  }

  async fillRedirectionPathname(path: string): Promise<void> {
    await this.frame.getByRole('textbox', { name: 'Redirection Pathname' }).fill(path);
  }

  async enableAbTesting(): Promise<void> {
    // FRAGILE: the switch <input role="switch"> itself is visually covered by its
    // label span (rs-toggle-inner), so a direct click times out with "subtree
    // intercepts pointer events". Click the visible "Disabled" text label instead —
    // same workaround already used for the ruleset Inactive/Active toggle.
    await this.frame
      .getByRole('group', { name: 'A/B testing' })
      .getByText('Disabled', { exact: true })
      .click();
    await expect(
      this.frame.getByRole('group', { name: 'A/B testing' }).getByText('Enable', { exact: true })
    ).toBeVisible({ timeout: 5000 });
  }

  async fillAbTestEndDate(dateTime: string): Promise<void> {
    // Only enabled once A/B testing is switched on — call enableAbTesting() first.
    const input = this.frame
      .getByRole('group', { name: 'A/B testing' })
      .locator('input[type="datetime-local"]');
    await input.click();
    await input.fill(dateTime);
  }

  async setAbTestTrafficSplit(redirectPercent: number): Promise<void> {
    // "Redirect Experience" is the only editable traffic field — "Default Experience"
    // is read-only and auto-computes as (100 - redirectPercent) once this is filled.
    const redirectInput = this.frame.getByRole('spinbutton', { name: 'Traffic percentage' }).first();
    await redirectInput.click();
    await redirectInput.fill(String(redirectPercent));
  }

  async getAbTestTrafficValues(): Promise<{ redirect: string; defaultExp: string }> {
    const inputs = this.frame.getByRole('spinbutton', { name: 'Traffic percentage' });
    return {
      redirect:   await inputs.nth(0).inputValue(),
      defaultExp: await inputs.nth(1).inputValue(),
    };
  }

  async submitAddExperience(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Add experience' }).click();
    await expect(
      this.frame.getByRole('heading', { name: 'Add experience', exact: true })
    ).not.toBeVisible({ timeout: 10000 });
  }

  // Clicks the Add experience submit button WITHOUT asserting the panel closes —
  // for the blank-pathnames case (bug-fix verification TC-BF-RD-005), where the
  // submit is expected to be rejected client-side and the panel stays open.
  async clickAddExperienceSubmitExpectingRejection(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Add experience' }).click();
  }

  async assertViewRedirectionUrlButtonVisible(): Promise<void> {
    // Once an experience is saved, the row action label switches from
    // "+ Add Redirection URL" to " View Redirection URL" — proof of a successful add.
    await expect(
      this.frame.getByRole('button', { name: 'View Redirection URL' })
    ).toBeVisible({ timeout: 10000 });
  }

  // Reopens the Add experience panel (pre-filled) for a rule that already has
  // content — confirmed live: submitting it with the pathnames cleared to blank
  // is REJECTED client-side, not treated as "removing" the content.
  async clickViewRedirectionUrl(): Promise<void> {
    await this.frame.getByRole('button', { name: 'View Redirection URL' }).click();
  }

  // Asserts the client-side "pathnames are required" validation that appears when
  // the Add experience panel is submitted with blank Default/Redirection pathname
  // fields — both the inline per-field errors and the page-level toast.
  async assertPathnamesRequiredValidation(): Promise<{ defaultError: string; redirectionError: string; toastMsg: string }> {
    const defaultErr   = this.frame.getByText('Default Pathname is required');
    const redirectErr  = this.frame.getByText('Redirection Pathname is required');
    await expect(defaultErr).toBeVisible({ timeout: 5000 });
    await expect(redirectErr).toBeVisible({ timeout: 5000 });
    const toastMsg = await this.assertDraftValidationNotification();
    return {
      defaultError:     (await defaultErr.textContent())?.trim() ?? '',
      redirectionError: (await redirectErr.textContent())?.trim() ?? '',
      toastMsg,
    };
  }

  // ─── Rule panel — Continue back to Create campaign drawer (TC-RD-021) ───────

  async clickContinueRulePanel(): Promise<void> {
    await this.frame
      .getByRole('dialog', { name: 'Rule' })
      .getByTestId('submit-basic-drawer')
      .click();
    await expect(
      this.frame.getByRole('heading', { name: 'Rule', exact: true })
    ).not.toBeVisible({ timeout: 10000 });
  }

  // ─── Final campaign save (TC-RD-021) ────────────────────────────────────────

  async assertCampaignSavedSuccessfully(): Promise<void> {
    // No distinct success toast text was observed for a Redirection campaign save —
    // success is signaled only by the "Create campaign" drawer auto-closing (contrast
    // with the validation-failure toasts asserted in TC-RD-005/008, which DO render
    // visible text). Callers should additionally verify the campaign in the list.
    await expect(
      this.frame.getByRole('heading', { name: 'Create campaign' })
    ).not.toBeVisible({ timeout: 15000 });
  }

  // ─── Close ───────────────────────────────────────────────────────────────────

  async closeDrawer(): Promise<void> {
    await this.frame.getByTestId('onclose-basic-drawer').click();
    await expect(
      this.frame.getByRole('heading', { name: 'Create campaign' })
    ).not.toBeVisible({ timeout: 5000 });
  }
}
