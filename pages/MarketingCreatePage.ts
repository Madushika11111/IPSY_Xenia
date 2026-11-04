import { Page, FrameLocator, Locator, expect } from '@playwright/test';

/**
 * MarketingCreatePage
 *
 * The Marketing "Create new campaign" / "Update the campaign" wizard, reached
 * from MarketingListPage.clickCreateButton() (fresh create) or
 * MarketingListPage.clickEditCampaign() (update). Same 3-step wizard shell as
 * the Copy Campaign flow documented in tests/marketing/copy.spec.ts, but
 * fresh-create diverges from copy in two confirmed ways:
 *
 *  - Campaign Management ID starts EMPTY (not pre-filled) and only becomes a
 *    fresh "MAR_<timestamp>" value once the Campaign name is typed — copy
 *    pre-fills it immediately on open.
 *  - Step 1 additionally renders a "Type" chip selector (Acquisition /
 *    Reactivation / Upgrade / Upsell) and a Program table. Clicking
 *    "Setup Campaign Rules & Content" with no program row checked is
 *    rejected with a host-page toast, "Please select at least one program" —
 *    copy never hits this because programs are preserved from the source.
 *
 * Confirmed live: once at least one program is checked and Setup is clicked,
 * Step 2 ("Setup Campaign Rules & Content") lets you "Save as Draft" with NO
 * ruleset at all — this persists a 0-entry Draft campaign. Publishing
 * ("Preview & Publish") DOES require a ruleset for every channel ("Please add
 * rulesets for each channel"), and a ruleset itself requires at least one
 * rule under it ("Please add at least a rule for the ruleset") before it can
 * publish — full rule/content-template assignment was not explored and is
 * NOT modeled here yet (tracked as a follow-up).
 *
 * Edit ("Update the campaign") on a Live campaign, confirmed live:
 *  - Campaign name: editable
 *  - Campaign Management ID: always disabled (never editable, create or edit)
 *  - CID: disabled once Live
 *  - Start date: disabled once Live (matches the Content Personalization /
 *    Gradual Rollout pattern of locking the start date on a running campaign)
 *  - End date (checkbox + date): still editable even on Live
 *  - Region: rendered as plain read-only text, not a combobox, once the
 *    campaign already exists (create vs edit only, not status-dependent)
 *  - Button label is "Update Campaign Rules & Content" (vs "Setup..." on create)
 */
export class MarketingCreatePage {
  private readonly frame: FrameLocator;

  constructor(private readonly page: Page) {
    this.frame = page.frameLocator('[data-test-id="cf-widget-renderer"]');
  }

  private dialog(): Locator {
    return this.frame.getByRole('dialog');
  }

  // ─── Headings ────────────────────────────────────────────────────────────────

  step1Heading(): Locator {
    return this.frame.getByRole('heading', { name: 'Create new campaign' });
  }

  updateHeading(): Locator {
    return this.frame.getByRole('heading', { name: 'Update the campaign' });
  }

  step2Heading(): Locator {
    return this.frame.getByRole('heading', { name: 'Setup Campaign Rules & Content' });
  }

  /** Confirmed live: Edit/continue-Draft mode's Step 2 is titled "Update Campaign Rules & Content" — NOT "Setup..." like fresh create's. Distinct heading, same underlying Step 2 content (URL parameters, Ruleset section, Preview & Publish/Save as Draft/Cancel). */
  updateStep2Heading(): Locator {
    return this.frame.getByRole('heading', { name: 'Update Campaign Rules & Content' });
  }

  step3Heading(): Locator {
    return this.frame.getByRole('heading', { name: 'Preview', exact: true });
  }

  // ─── Step 1 fields ───────────────────────────────────────────────────────────

  nameInput(): Locator {
    return this.frame.getByRole('textbox', { name: 'Campaign name *' });
  }

  cmgmtIdInput(): Locator {
    return this.frame.getByRole('textbox', { name: 'Campaign Management ID*' });
  }

  cidInput(): Locator {
    return this.frame.getByRole('textbox', { name: 'CID', exact: true });
  }

  startDateInput(): Locator {
    return this.frame.getByRole('textbox', { name: 'Campaign start date & time (' });
  }

  endDateCheckbox(): Locator {
    return this.dialog().getByRole('checkbox').first();
  }

  endDateInput(): Locator {
    return this.frame.getByRole('textbox', { name: 'Set campaign end date & time' });
  }

  descriptionInput(): Locator {
    return this.frame.getByRole('textbox', { name: 'Description' });
  }

  setupButton(): Locator {
    return this.frame.getByRole('button', { name: 'Setup Campaign Rules & Content' });
  }

  updateButton(): Locator {
    return this.frame.getByRole('button', { name: 'Update Campaign Rules & Content' });
  }

  saveAsDraftButton(): Locator {
    return this.frame.getByRole('button', { name: 'Save as Draft' });
  }

  cancelButton(): Locator {
    return this.dialog().getByRole('button', { name: 'Cancel' });
  }

  /** Host-page toast ("Please select at least one program") — renders OUTSIDE the Xenia iframe, same as other Xenia validation toasts. */
  programRequiredToast(): Locator {
    return this.page.getByText('Please select at least one program');
  }

  rulesetsRequiredToast(): Locator {
    return this.page.getByText('Please add rulesets for each channel');
  }

  async fillName(name: string): Promise<void> {
    await this.nameInput().fill(name);
  }

  async getCmgmtId(): Promise<string> {
    return this.cmgmtIdInput().inputValue();
  }

  async fillCid(cid: string): Promise<void> {
    await this.cidInput().fill(cid);
  }

  /** datetime-local input — confirmed live this exact click/ArrowRight/fill sequence is required to set it reliably. */
  async fillStartDate(dateStr: string): Promise<void> {
    const input = this.startDateInput();
    await input.click();
    await input.press('ArrowRight');
    await input.fill(dateStr);
    await this.nameInput().click(); // blur to trigger validation / button gating
  }

  async checkEndDate(): Promise<void> {
    if (!(await this.endDateCheckbox().isChecked())) {
      await this.endDateCheckbox().check();
    }
  }

  async fillEndDate(dateStr: string): Promise<void> {
    await this.checkEndDate();
    const input = this.endDateInput();
    await input.click();
    await input.press('ArrowRight');
    await input.fill(dateStr);
    await this.nameInput().click(); // blur
  }

  async fillDescription(description: string): Promise<void> {
    await this.descriptionInput().fill(description);
  }

  /**
   * Inline validation message rendered directly under the start-date field
   * (NOT a host-page toast) when the entered start date is not in the
   * future. Confirmed live, exact text: "Campaign start date & time (PST)
   * should be greater than current date & time".
   */
  pastStartDateErrorText(): Locator {
    return this.frame.getByText('Campaign start date & time (PST) should be greater than current date & time');
  }

  /**
   * Opens the Region react-select and picks an option. Confirmed live:
   * clicking the container directly adjacent to the "Region *" label opens
   * the menu; options render as plain text ("United States" / "Mexico").
   */
  async selectRegion(region: 'United States' | 'Mexico'): Promise<void> {
    await this.frame.getByText('Region *', { exact: true }).locator('..').click();
    await this.frame.getByText(region, { exact: true }).click();
  }

  /**
   * Confirmed live: on an existing campaign (edit mode), Region renders as
   * plain read-only text instead of a combobox — read it back instead of
   * trying to re-select it.
   */
  async getRegionText(): Promise<string> {
    const text = await this.frame.getByText('Region *', { exact: true }).locator('..').textContent();
    return (text ?? '').replace('Region *', '').trim();
  }

  // ─── Type chips + Program table (Step 1, fresh create only) ─────────────────
  //
  // Confirmed live with Region = United States: four Type chips ("Acquisition
  // (7)", "Reactivation (7)", "Upgrade (3)", "Upsell (1)"), Acquisition
  // selected by default. Switching chips swaps the Program table's rows —
  // Acquisition and Reactivation happen to render the IDENTICAL 7 rows
  // (WELLNESS/Quarterly, GB_PLUS/Annually, GB_PLUS/Every 2 months,
  // GB_PLUS/Monthly, GB/Every 2 months, GB/Annually, GB/Monthly); Upgrade
  // renders 3 distinct rows (GBX/Quarterly, GB/Annually, GB_PLUS/Annually);
  // Upsell renders 1 (BB/Monthly).

  typeChip(name: 'Acquisition' | 'Reactivation' | 'Upgrade' | 'Upsell'): Locator {
    return this.dialog().getByText(new RegExp(`^${name} \\(\\d+\\)$`));
  }

  async isTypeSelected(name: 'Acquisition' | 'Reactivation' | 'Upgrade' | 'Upsell'): Promise<boolean> {
    return this.typeChip(name).locator('..').getByRole('img', { name: 'Selected' }).isVisible();
  }

  /** Confirmed live: Mexico only offers Acquisition/Reactivation — Upgrade/Upsell chips are absent entirely (not just disabled). */
  async isTypeChipPresent(name: 'Acquisition' | 'Reactivation' | 'Upgrade' | 'Upsell'): Promise<boolean> {
    return this.typeChip(name).isVisible({ timeout: 3000 }).catch(() => false);
  }

  async selectType(name: 'Acquisition' | 'Reactivation' | 'Upgrade' | 'Upsell'): Promise<void> {
    await this.typeChip(name).click();
    await expect(this.typeChip(name).locator('..').getByRole('img', { name: 'Selected' })).toBeVisible({ timeout: 5000 });
  }

  private programRow(index: number): Locator {
    // getByRole('row') index 0 is the header — program rows start at 1.
    return this.dialog().locator('table').last().getByRole('row').nth(index + 1);
  }

  /**
   * Clicks a Program row's "Select cycle" dropdown and picks the first REAL
   * (non-disabled) date option — confirmed live the first option is always a
   * disabled "No cycle" placeholder that cannot actually be selected.
   * Returns the picked option's text (e.g. "Oct 1, 2026").
   */
  async selectCycleForProgramRow(index: number): Promise<string> {
    const row = this.programRow(index);
    const cycleCombo = row.getByRole('cell').filter({ hasText: 'Select cycle' }).getByRole('combobox');
    await cycleCombo.click({ timeout: 8000 });
    const options = this.frame.locator('[class*="-menu"] [class*="-option"]');
    await expect(options.first()).toBeVisible({ timeout: 5000 });
    const count = await options.count();
    for (let i = 0; i < count; i++) {
      const opt = options.nth(i);
      const ariaDisabled = await opt.getAttribute('aria-disabled');
      if (ariaDisabled !== 'true') {
        const text = ((await opt.textContent()) ?? '').trim();
        await opt.click();
        return text;
      }
    }
    throw new Error(`No selectable (non-"No cycle") option found for program row ${index}`);
  }

  giftProductIdInputForRow(index: number): Locator {
    return this.programRow(index).getByPlaceholder('Enter Gift product ID');
  }

  /**
   * The +/- icons have no disabled attribute or aria-disabled — their enabled
   * state is purely a `cursor`/`opacity` inline style on the <svg> itself.
   * Confirmed live:
   *  - "Remove parameter" (−): disabled until the program row is checked,
   *    then stays enabled regardless of cycle/Gift ID completion. There is
   *    one "−" per cycle sub-entry once "+" has been used to add more than
   *    one — `.first()` checks the row's original (first) entry.
   *  - "Add parameter" (+): disabled until BOTH a real cycle is picked AND
   *    the Gift Product ID is filled for that row — and re-disables once
   *    every real cycle option for that program has been used up (only the
   *    disabled "No cycle" placeholder remains). There is exactly one "+"
   *    per program row regardless of how many cycle sub-entries it has.
   */
  private async isIconEnabled(index: number, iconName: 'Add parameter' | 'Remove parameter'): Promise<boolean> {
    const style = (await this.programRow(index).getByRole('img', { name: iconName }).first().getAttribute('style')) ?? '';
    return style.includes('cursor: pointer');
  }

  /**
   * Clicks the "+" (Add parameter) icon for a program row to add another
   * cycle sub-entry, then selects the first REAL (non-disabled) remaining
   * cycle option for that NEW sub-entry and fills its Gift Product ID.
   * Returns the picked cycle's text.
   */
  async addAnotherCycleForProgramRow(index: number, giftProductId: string): Promise<string> {
    const row = this.programRow(index);
    await row.getByRole('img', { name: 'Add parameter' }).click();
    const newCombo = row.getByRole('cell').last().getByRole('combobox').last();
    await newCombo.click({ timeout: 8000 });
    const options = this.frame.locator('[class*="-menu"] [class*="-option"]');
    await expect(options.first()).toBeVisible({ timeout: 5000 });
    const count = await options.count();
    for (let i = 0; i < count; i++) {
      const opt = options.nth(i);
      const ariaDisabled = await opt.getAttribute('aria-disabled');
      if (ariaDisabled !== 'true') {
        const text = ((await opt.textContent()) ?? '').trim();
        await opt.click();
        await row.getByRole('cell').last().getByPlaceholder('Enter Gift product ID').last().fill(giftProductId);
        return text;
      }
    }
    throw new Error(`No selectable (non-"No cycle") option found when adding another cycle for program row ${index}`);
  }

  async isAddParameterIconEnabled(index: number): Promise<boolean> {
    return this.isIconEnabled(index, 'Add parameter');
  }

  /** Clicks the LAST (most recently added) cycle sub-entry's "−" icon, removing it. */
  async removeLastCycleForProgramRow(index: number): Promise<void> {
    await this.programRow(index).getByRole('cell').last().getByRole('img', { name: 'Remove parameter' }).last().click();
  }

  async isRemoveParameterIconEnabled(index: number): Promise<boolean> {
    return this.isIconEnabled(index, 'Remove parameter');
  }

  /** Program table rows as "Program | Billing Cadence" strings, in display order. */
  async getProgramRows(): Promise<string[]> {
    const rows = this.dialog().locator('table').last().getByRole('row');
    const count = await rows.count();
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      const cells = await rows.nth(i).getByRole('cell').allTextContents();
      if (cells.length < 3) continue; // skip the header row
      const program = cells[1]?.trim();
      const billing = cells[2]?.trim();
      if (program && billing) out.push(`${program} | ${billing}`);
    }
    return out;
  }

  /** Program rows render their checkbox as a styled <label> inside the first <td> — confirmed live, no accessible checkbox role. */
  private programCheckbox(index: number): Locator {
    return this.frame.locator('td > label').nth(index);
  }

  async selectProgramByIndex(index: number): Promise<void> {
    await this.programCheckbox(index).click();
  }

  async selectFirstProgram(): Promise<void> {
    await this.selectProgramByIndex(0);
  }

  // ─── Navigation actions ──────────────────────────────────────────────────────

  async clickSetupCampaignRulesAndContent(): Promise<void> {
    await this.setupButton().click();
  }

  async clickUpdateCampaignRulesAndContent(): Promise<void> {
    await this.updateButton().click();
  }

  async clickSaveAsDraft(): Promise<void> {
    await this.saveAsDraftButton().dispatchEvent('click');
  }

  /**
   * Confirmed live on the Copy wizard (same shell): cancelling from Step 2+
   * can surface a discard-confirmation prompt that Step 1's Cancel never
   * does — handle it if present so the drawer always actually closes.
   */
  async clickCancel(): Promise<void> {
    await this.cancelButton().dispatchEvent('click');
    const confirm = this.frame.getByRole('button', { name: /^(Yes|Discard|OK|Confirm)/i }).first();
    if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirm.click({ timeout: 5000 });
    }
  }

  // ─── Edit-mode field-lock assertions ─────────────────────────────────────────

  async isNameDisabled(): Promise<boolean> {
    return this.nameInput().isDisabled();
  }

  async isCmgmtIdDisabled(): Promise<boolean> {
    return this.cmgmtIdInput().isDisabled();
  }

  async isCidDisabled(): Promise<boolean> {
    return this.cidInput().isDisabled();
  }

  async isStartDateDisabled(): Promise<boolean> {
    return this.startDateInput().isDisabled();
  }

  async isEndDateInputDisabled(): Promise<boolean> {
    return this.endDateInput().isDisabled();
  }

  // ─── Ruleset (Step 2) ────────────────────────────────────────────────────────

  /**
   * Confirmed live: clicking "Add ruleset" opens a dialog whose Defining rule
   * defaults to a LOCKED condition — "Campaign Management ID [Session] Equals
   * <the Step 1 cmgmtId> (Ignore Case)" — every field disabled. The Value
   * shown is always the CURRENT campaign's own cmgmtId, exactly matching
   * getCmgmtId() read from Step 1.
   */
  addRulesetDialog(): Locator {
    return this.frame.getByRole('dialog', { name: 'Add ruleset' });
  }

  async clickAddRulesetLink(): Promise<void> {
    await this.frame.getByText('Add ruleset').click();
    await expect(this.addRulesetDialog()).toBeVisible({ timeout: 10000 });
  }

  addRulesetValueField(): Locator {
    return this.addRulesetDialog().getByRole('textbox', { name: 'Value' });
  }

  async getAddRulesetDefaultValue(): Promise<string> {
    return this.addRulesetValueField().inputValue();
  }

  rulesetNameInput(): Locator {
    return this.addRulesetDialog().getByRole('textbox', { name: 'Name *' });
  }

  async clickAddRulesetSubmit(): Promise<void> {
    await this.addRulesetDialog().getByRole('button', { name: 'Add ruleset', exact: true }).click();
  }

  /**
   * Confirmed live: renders as an INLINE error inside the dialog (not a
   * host-page toast) when Name is left empty — a Bootstrap-style
   * `.invalid-feedback` div right after the Name input. Located by this
   * class, NOT by its text, so the actual message can be read and compared
   * against the expected text rather than matched into the selector itself.
   */
  rulesetNameRequiredError(): Locator {
    return this.addRulesetDialog().locator('.invalid-feedback');
  }

  /** Scoped to the "Add ruleset" dialog specifically — avoids ambiguity with Step 2's own Cancel button when both dialogs are open at once. */
  async cancelAddRulesetDialog(): Promise<void> {
    await this.addRulesetDialog().getByRole('button', { name: 'Cancel' }).dispatchEvent('click');
  }
}
