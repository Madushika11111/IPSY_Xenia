import { FrameLocator, Page, expect } from '@playwright/test';

/**
 * Personalization "Create campaign" flow.
 *
 * Modelled on EligibilityCreatePage.ts, with one confirmed live deviation from
 * docs/p13n-campaign-test-plan.md §1: the Personalization form has no Campaign ID
 * (CID/cmgmtId) field, and there is no separate "Preview & Publish" screen — Save &
 * Activate / Save Campaign as Draft are clicked directly from the same drawer used
 * to configure the ruleset. (Matches the existing note in CopyPage.ts: "Personalization
 * copy form may not expose a Campaign ID field at all.") The three phases below are
 * therefore: (1) basic details, (2) ruleset -> rule -> experience, (3) save/publish.
 *
 * Personalization nests one level deeper than Eligibility: each ruleset holds Rules
 * (its own sub-drawer, "Add rule"), and each rule holds an Experience (control content
 * + optional A/B variant, "Add experience") — Eligibility has no separate Rule/Experience
 * level, so those sections here have no Eligibility equivalent to mirror.
 */
export class PersonalizationCreatePage {
  private readonly frame: FrameLocator;

  constructor(private readonly page: Page) {
    this.frame = page.frameLocator('[data-test-id="cf-widget-renderer"]');
  }

  // ─── Phase 1 — Basic details ───────────────────────────────────────────────────

  async assertPageVisible(): Promise<void> {
    const heading = this.frame.getByRole('heading', { name: 'Create campaign' });
    await expect(heading).toBeVisible({ timeout: 10000 });
  }

  /** The row-level "Edit Campaign" action opens the same form drawer, headed "Update campaign" instead of "Create campaign". */
  async assertEditDrawerVisible(): Promise<void> {
    const heading = this.frame.getByRole('heading', { name: 'Update campaign' });
    await expect(heading).toBeVisible({ timeout: 10000 });
  }

  async fillName(name: string): Promise<void> {
    await this.frame.getByRole('textbox', { name: 'Campaign name *' }).fill(name);
  }

  /** Reads the live Campaign name field value — used to prove an edit-mode drawer re-opens pre-filled with a persisted change, not a hardcoded expectation. */
  async getNameFieldValue(): Promise<string> {
    return await this.frame.getByRole('textbox', { name: 'Campaign name *' }).inputValue();
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

  async fillDescription(text: string): Promise<void> {
    await this.frame.getByRole('textbox', { name: 'Description' }).fill(text);
  }

  /** Confirmed live: a Live campaign's start date field renders with the `disabled` attribute in the "Update campaign" drawer, once the 1-minute post-activation grace window has elapsed. */
  async isStartDateDisabled(): Promise<boolean> {
    return await this.frame.getByRole('textbox', { name: 'Campaign start date & time (' }).isDisabled();
  }

  /** An Expired campaign is no longer editable — the "Update campaign" drawer's own "Update Campaign" submit button renders `[disabled]`, the same lock pattern used elsewhere (ruleset/rule submit buttons) rather than disabling individual fields. */
  async isUpdateCampaignButtonDisabled(): Promise<boolean> {
    return await this.frame.getByRole('button', { name: 'Update Campaign', exact: true }).isDisabled();
  }

  /**
   * Submits the outer "Update campaign" drawer itself. Confirmed live: nested
   * edits (e.g. turning off A/B testing inside "Add experience", submitted
   * via submitExperience()) only live in the drawers' own client-side session
   * state until this outer submit is clicked — closing back out via Cancel
   * instead discards them, reverting to the last actually-persisted state.
   */
  async clickUpdateCampaign(): Promise<void> {
    // Same underlying testid as clickSaveActivate() — the "Update campaign"
    // drawer's submit button reuses submit-save-active-drawer, just relabeled.
    // A leftover near-empty <span> from a just-closed nested drawer's fade
    // transition sits geometrically on top and blocks a plain click here
    // (confirmed live, reproducible) — force it through instead of pressing
    // Escape, which would risk closing this very drawer instead of the
    // harmless leftover element.
    //
    // Retries the click if the "Update campaign" drawer hasn't actually closed
    // shortly after — confirmed independently two ways: a captured automated
    // failure elsewhere in this file showed the same class of "click
    // registered but nothing happened" symptom, and a manual codegen
    // recording of this exact button needed two clicks in a row before the
    // save actually went through.
    const dialog = this.frame.getByRole('dialog', { name: 'Update campaign', exact: true });
    const button = this.frame.getByTestId('submit-save-active-drawer');
    for (let attempt = 0; attempt < 3; attempt++) {
      await button.click({ force: true });
      const closed = await dialog.waitFor({ state: 'hidden', timeout: 8000 }).then(() => true).catch(() => false);
      if (closed) return;
    }
  }

  async selectChannel(channelName: string): Promise<void> {
    await this.frame.locator('.select__input-container').click();
    await this.frame.getByLabel('Create campaign').getByText(channelName, { exact: true }).click();
  }

  // ─── Removing a selected channel ────────────────────────────────────────────

  async clickRemoveChannel(channelName: string): Promise<void> {
    await this.frame.getByRole('button', { name: `Remove ${channelName}` }).click();
  }

  private removeChannelDialog() {
    return this.page.getByRole('dialog').filter({ has: this.page.getByRole('heading', { name: 'Are you sure?' }) });
  }

  async assertRemoveChannelDialogVisible(): Promise<void> {
    await expect(this.removeChannelDialog()).toBeVisible({ timeout: 5000 });
  }

  /**
   * Reads the live confirmation dialog's message text — never a hardcoded
   * string. Strips the surrounding heading/button labels out of the dialog's
   * full text content rather than relying on a specific DOM position for the
   * message, since none of "Are you sure?" / "Close" / "No" / "Yes!" appear
   * as substrings within the message itself (confirmed live).
   */
  async getRemoveChannelDialogText(): Promise<string> {
    const fullText = (await this.removeChannelDialog().textContent()) ?? '';
    return fullText
      .replace('Are you sure?', '')
      .replace('Close', '')
      .replace('No', '')
      .replace('Yes!', '')
      .trim();
  }

  async clickRemoveChannelNo(): Promise<void> {
    await this.page.locator('[data-test-id="cf-ui-modal-confirm-cancel-button"]').click();
  }

  async clickRemoveChannelYes(): Promise<void> {
    await this.page.locator('[data-test-id="cf-ui-modal-confirm-confirm-button"]').click();
  }

  async assertChannelPresent(channelName: string): Promise<void> {
    await expect(this.frame.getByRole('button', { name: `Remove ${channelName}` })).toBeVisible({ timeout: 5000 });
  }

  async assertChannelRemoved(channelName: string): Promise<void> {
    await expect(this.frame.getByRole('button', { name: `Remove ${channelName}` })).not.toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByRole('heading', { name: channelName, exact: true })).not.toBeVisible({ timeout: 5000 });
  }

  // ─── Phase 1 validation — dynamic message capture ──────────────────────────
  //
  // Neither method below hardcodes an expected message: each locates the error
  // element structurally (by field label, or by ARIA role) and returns whatever
  // text is actually in the DOM, so the caller compares the real value against
  // an expected string explicitly. This also surfaces genuine wording bugs
  // rather than masking them — confirmed live, the Name field's inline error is
  // literally "Please  enter campaign name" (double space) in the raw DOM text,
  // which the accessibility tree silently collapses to a single space.
  //
  // Inline field errors are Bootstrap-style: a `.invalid-feedback` div inside
  // the field's `.form-group` container (confirmed live for Name, Start date,
  // and Channels — "Please select at least one channel" only appears once
  // Name/Start date are already valid, not when all three are empty together).
  // Host-page toasts (e.g. missing ruleset) are a `role="alert"` element outside
  // the app iframe, with no inline field error of their own.

  /**
   * Reads the live inline error text for a field, scoped by the field's own
   * static label (e.g. "Campaign name", "Campaign start date", "Channels",
   * "Set campaign end date") — never by the message text itself.
   */
  async getFieldErrorText(fieldLabel: string): Promise<string> {
    const formGroup = this.frame.locator('.form-group').filter({ hasText: fieldLabel }).first();
    const error = formGroup.locator('.invalid-feedback');
    await expect(error).toBeVisible({ timeout: 5000 });
    return (await error.textContent()) ?? '';
  }

  /**
   * Reads the live host-page toast text, located by its ARIA role, not by
   * message content. Scoped to the alert's <p> — the alert element itself also
   * contains a "Dismiss" button, whose label would otherwise get appended to
   * the captured text.
   */
  async getToastText(): Promise<string> {
    const alert = this.page.getByRole('alert').first();
    await expect(alert).toBeVisible({ timeout: 5000 });
    const paragraph = alert.locator('p').first();
    if (await paragraph.count() > 0) {
      return (await paragraph.textContent()) ?? '';
    }
    return (await alert.textContent()) ?? '';
  }

  /**
   * Waits out any toast already on screen. Confirmed live: a toast from a
   * PRIOR action can still be present when the next validation check runs
   * (shared page across tests) — getToastText() would then read the stale
   * leftover alert instead of the new one. Call this right before triggering
   * an action expected to show its own fresh toast.
   */
  async waitForToastToClear(): Promise<void> {
    await this.page.getByRole('alert').first().waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  // ─── Phase 2a — Ruleset sub-drawer ─────────────────────────────────────────────

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
    const header = this.channelAccordion(channelName)
      .locator('[data-test-id="cf-ui-accordion-header"]')
      .getByRole('button', { name: channelName, exact: true });
    const addRuleset = this.channelAccordion(channelName).getByText('Add ruleset');

    // Wait briefly instead of a single isVisible() snapshot — the accordion's
    // content can still be mounting asynchronously right after selecting the
    // channel (a single-channel form renders it already-expanded, but not
    // instantly). A one-shot check here races that mount: if it reads "not yet
    // visible" a beat too early, the click below TOGGLES THE ACCORDION CLOSED
    // instead of open (confirmed live) — "Add ruleset" then never appears and
    // every subsequent click on it hangs for the full test timeout with no
    // intermediate error, since that click had no timeout of its own.
    const alreadyOpen = await addRuleset
      .waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (alreadyOpen) return;

    await header.click();
    await expect(addRuleset).toBeVisible({ timeout: 8000 });
  }

  async clickAddRuleset(channelName: string): Promise<void> {
    await this.openChannelAccordion(channelName);
    await this.channelAccordion(channelName).getByText('Add ruleset').click({ timeout: 8000 });
  }

  async assertAddRulesetDialogVisible(): Promise<void> {
    await expect(
      this.frame.getByRole('dialog', { name: 'Add ruleset', exact: true })
    ).toBeVisible({ timeout: 5000 });
  }

  async fillRulesetName(name: string): Promise<void> {
    await this.frame.getByRole('dialog', { name: 'Add ruleset', exact: true })
      .locator('input[name="name"]').fill(name);
  }

  async selectRulesetTemplate(templateName: string): Promise<void> {
    const dialog = this.frame.getByRole('dialog', { name: 'Add ruleset', exact: true });
    await dialog.locator('.select__control').click();
    // Exact (anchored) match — a substring filter can hit multiple options (e.g.
    // "Ruleset1" also matches "MIG_Ruleset1_name edit_v1_edit"), throwing a strict-mode violation.
    const option = this.frame.locator('.select__option')
      .filter({ hasText: new RegExp(`^${escapeRegExp(templateName)}$`) });
    await option.waitFor({ state: 'visible', timeout: 5000 });
    await option.click();
    // Selecting a template asynchronously auto-fills Name — wait for it before
    // returning, otherwise a submit click can race ahead and hit a "Please enter
    // ruleset name" validation error (confirmed live for the equivalent Rule form).
    await expect(dialog.locator('input[name="name"]')).not.toHaveValue('', { timeout: 5000 });
  }

  /**
   * Manual defining-rule builder — the alternative to selectRulesetTemplate()/
   * selectRuleTemplate(). Confirmed live: both the "Add ruleset" and "Add rule"
   * dialogs already show this builder (Name + one attribute/operator/value
   * condition) by default, with no separate toggle needed to reach it. Shared
   * shape across both dialogs, so these three helpers take the dialog's own
   * accessible name to scope into either one.
   */
  async selectDefiningRuleAttribute(dialogName: 'Add ruleset' | 'Add rule', attributeName: string): Promise<void> {
    const dialog = this.frame.getByRole('dialog', { name: dialogName, exact: true });
    await dialog.getByRole('textbox', { name: 'Select a attribute' }).click();
    // The autocomplete's option list is not scoped inside the dialog's own DOM
    // subtree (confirmed live, same portal behavior as the .select__option
    // template dropdowns) — exact match distinguishes attributes that only
    // differ by source, e.g. "age [User]" vs "age [Table_1]".
    const option = this.frame.getByRole('option', { name: attributeName, exact: true });
    await option.waitFor({ state: 'visible', timeout: 5000 });
    await option.click();
  }

  async selectDefiningRuleOperator(dialogName: 'Add ruleset' | 'Add rule', operatorLabel: string): Promise<void> {
    const dialog = this.frame.getByRole('dialog', { name: dialogName, exact: true });
    await dialog.getByTestId('option-select-operator').selectOption(operatorLabel);
  }

  /** The Value field's role depends on the attribute's type — numeric attributes render a spinbutton, string attributes a textbox. */
  async fillDefiningRuleValue(dialogName: 'Add ruleset' | 'Add rule', value: string): Promise<void> {
    const dialog = this.frame.getByRole('dialog', { name: dialogName, exact: true });
    const spin = dialog.getByRole('spinbutton');
    if (await spin.count() > 0) {
      await spin.first().fill(value);
    } else {
      await dialog.getByRole('textbox', { name: 'Value' }).fill(value);
    }
  }

  async submitRulesetDrawer(): Promise<void> {
    await this.frame.getByTestId('submit-basic-drawer').click();
  }

  async assertRulesetInList(channelName: string, rulesetName: string): Promise<void> {
    await expect(
      this.channelAccordion(channelName).getByRole('cell', { name: rulesetName, exact: true }).first()
    ).toBeVisible({ timeout: 10000 });
  }

  /**
   * Template-based rulesets default to Inactive after being added (confirmed
   * live). The "Status" column is read-only; the separate "Status change" column
   * holds the actual switch + a clickable label — clicking the switch itself is
   * intercepted by an overlay (same pattern as the A/B testing toggle), so this
   * clicks the label. .last() picks the clickable label over the read-only
   * "Status" cell's own "Inactive"/"Active" text, which sits earlier in the row.
   */
  async toggleRulesetToActive(channelName: string, rulesetName: string): Promise<void> {
    const row = this.channelAccordion(channelName).locator('table tr').filter({ hasText: rulesetName });
    await row.getByText('Inactive').last().click();
  }

  async assertRulesetActive(channelName: string, rulesetName: string): Promise<void> {
    const row = this.channelAccordion(channelName).locator('table tr').filter({ hasText: rulesetName });
    await expect(row.getByText('Active').last()).toBeVisible({ timeout: 10000 });
  }

  /** Confirmed live: on a Live campaign whose rule has A/B testing enabled, the ruleset's own Active switch renders `[disabled]` — it stops being disabled once A/B testing is turned off. */
  async isRulesetToggleDisabled(channelName: string, rulesetName: string): Promise<boolean> {
    const row = this.channelAccordion(channelName).locator('table tr').filter({ hasText: rulesetName });
    return await row.getByRole('switch').isDisabled();
  }

  /** Opens the existing ruleset's "Update ruleset" edit drawer via its row's edit icon (`data-testid="edit"`) — distinct from clickAddRuleset(), which creates a new one. */
  async clickEditRuleset(channelName: string, rulesetName: string): Promise<void> {
    const row = this.channelAccordion(channelName).locator('table tr').filter({ hasText: rulesetName });
    await row.getByTestId('edit').click();
  }

  /**
   * Confirmed live: editing an existing ruleset on a Live campaign (while A/B
   * testing is enabled on one of its rules) does NOT disable the form's
   * individual fields — it disables the drawer's own "Update ruleset" submit
   * button instead, blocking persistence of any edit at the point of save.
   */
  async isUpdateRulesetButtonDisabled(): Promise<boolean> {
    return await this.frame.getByRole('button', { name: 'Update ruleset', exact: true }).isDisabled();
  }

  // ─── Phase 2b — Rule sub-drawer (nested under a ruleset row) ───────────────────

  async clickAddRules(channelName: string): Promise<void> {
    // The ruleset row's Action cell "+ Add rules" button opens the Rule list dialog.
    await this.channelAccordion(channelName).getByRole('button', { name: 'Add rules' }).click();
  }

  /** Reads the ruleset row's Action-cell rules button text live — "+ Add rules" before any rule exists, "View rules (N)" once one does. */
  async getRulesButtonText(channelName: string): Promise<string> {
    const button = this.channelAccordion(channelName).getByRole('button', { name: /Add rules|View rules/ });
    return (await button.textContent())?.trim() ?? '';
  }

  /** Reopens the Rule list dialog once at least one rule already exists — the same Action-cell button then reads "View rules (N)" instead of "+ Add rules". force: true — same transient-reflow-after-submit pattern as clickViewContents()/clickContinueOnRuleDialog(). */
  async clickViewRules(channelName: string): Promise<void> {
    const button = this.channelAccordion(channelName).getByRole('button', { name: /View rules/ });
    const dialog = this.frame.getByRole('dialog', { name: 'Rule', exact: true });
    // Confirmed live, two symptoms of the same cause: right after freshly
    // re-opening the Edit Campaign drawer, this row can be scrolled out of
    // view — force: true skips Playwright's normal auto-scroll-into-view, so
    // the click either silently lands off-target (dialog never opens) or
    // throws "Element is outside of the viewport" outright. Scroll it into
    // view explicitly first, then retry the click until the dialog actually
    // shows up, instead of trusting a single forced click.
    for (let attempt = 0; attempt < 3; attempt++) {
      await button.scrollIntoViewIfNeeded();
      await button.click({ force: true });
      const opened = await dialog.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
      if (opened) return;
    }
  }

  async assertRuleDialogVisible(): Promise<void> {
    await expect(
      this.frame.getByRole('dialog', { name: 'Rule', exact: true })
    ).toBeVisible({ timeout: 5000 });
  }

  async clickAddRuleInList(): Promise<void> {
    await this.frame.getByRole('dialog', { name: 'Rule', exact: true })
      .getByText('Add rule', { exact: true }).click();
  }

  async fillRuleName(name: string): Promise<void> {
    await this.frame.getByRole('dialog', { name: 'Add rule', exact: true })
      .locator('input[name="name"]').fill(name);
  }

  async selectRuleTemplate(templateName: string): Promise<void> {
    // Unlike the Ruleset form, selecting a Rule template does NOT reliably
    // auto-fill Name here (confirmed live: a headless run left Name empty after
    // selection and a submit attempt hit "Please enter rule name"). Callers must
    // explicitly fillRuleName(...) after this — not folded in here automatically,
    // to keep this method's contract (select a template) honest.
    const dialog = this.frame.getByRole('dialog', { name: 'Add rule', exact: true });
    await dialog.locator('.select__control').click();
    const option = this.frame.locator('.select__option')
      .filter({ hasText: new RegExp(`^${escapeRegExp(templateName)}$`) });
    await option.waitFor({ state: 'visible', timeout: 5000 });
    await option.click();
  }

  async submitRuleDrawer(): Promise<void> {
    // Not scoped to the "Add rule" dialog by accessible name — its dialog-level name
    // is composed from both the "Add rule" heading and a breadcrumb heading, so an
    // exact-name dialog match doesn't resolve. The submit button's own accessible
    // name ("Add rule") is unambiguous on its own: the underlying "Rule" list
    // dialog's own "+ Add rule" trigger is a plain clickable generic, not a button.
    await this.frame.getByRole('button', { name: 'Add rule', exact: true }).click();
  }

  async assertRuleInList(name: string): Promise<void> {
    await expect(
      this.frame.getByRole('dialog', { name: 'Rule', exact: true }).getByRole('cell', { name, exact: true }).first()
    ).toBeVisible({ timeout: 10000 });
  }

  /** Caching defaults to False for a newly-added rule (verified behavior). */
  async assertRuleCachingFalse(): Promise<void> {
    await expect(
      this.frame.getByRole('dialog', { name: 'Rule', exact: true }).getByRole('cell', { name: 'False', exact: true }).first()
    ).toBeVisible({ timeout: 5000 });
  }

  /** Same Inactive-by-default toggle pattern as the ruleset — see toggleRulesetToActive(). */
  async toggleRuleToActive(ruleName: string): Promise<void> {
    const row = this.frame.getByRole('dialog', { name: 'Rule', exact: true })
      .locator('table tr')
      .filter({ hasText: ruleName });
    await row.getByText('Inactive').last().click();
  }

  async assertRuleActive(ruleName: string): Promise<void> {
    const row = this.frame.getByRole('dialog', { name: 'Rule', exact: true })
      .locator('table tr')
      .filter({ hasText: ruleName });
    await expect(row.getByText('Active').last()).toBeVisible({ timeout: 20000 });
  }

  /** Same lock pattern as the ruleset — see isRulesetToggleDisabled(). Matches on an exact-text Name cell, not a row-wide substring — confirmed live: a second rule built from a template whose name merely starts with another rule's name (e.g. "Age>20 _new" vs "Age>20") otherwise collides via plain hasText. */
  async isRuleToggleDisabled(ruleName: string): Promise<boolean> {
    const row = this.frame.getByRole('dialog', { name: 'Rule', exact: true })
      .locator('table tr')
      .filter({ has: this.frame.getByRole('cell', { name: ruleName, exact: true }) });
    return await row.getByRole('switch').isDisabled();
  }

  /** Opens the existing rule's "Update rule" edit drawer via its row's edit icon — distinct from clickAddRuleInList(), which creates a new one. Exact-cell match — see isRuleToggleDisabled(). */
  async clickEditRule(ruleName: string): Promise<void> {
    const row = this.frame.getByRole('dialog', { name: 'Rule', exact: true })
      .locator('table tr')
      .filter({ has: this.frame.getByRole('cell', { name: ruleName, exact: true }) });
    await row.getByTestId('edit').click();
  }

  /** Same lock pattern as the ruleset's "Update ruleset" button — see isUpdateRulesetButtonDisabled(). */
  async isUpdateRuleButtonDisabled(): Promise<boolean> {
    return await this.frame.getByRole('button', { name: 'Update rule', exact: true }).isDisabled();
  }

  /** Deletes a rule via its row's delete icon (data-testid="delete") — distinct from clickEditRule(). Exact-cell match — see isRuleToggleDisabled(). Confirmed live: this opens a host-page "Are you sure?" confirmation (see deleteRuleConfirmDialog()) rather than deleting immediately. */
  async clickDeleteRule(ruleName: string): Promise<void> {
    const row = this.frame.getByRole('dialog', { name: 'Rule', exact: true })
      .locator('table tr')
      .filter({ has: this.frame.getByRole('cell', { name: ruleName, exact: true }) });
    await row.getByTestId('delete').click();
  }

  /**
   * The rule-delete confirmation — a host-page (non-iframe) modal, confirmed
   * live to be the same shared "Are you sure?" component as the Remove
   * Channel confirmation (see removeChannelDialog()), just with its own
   * message text ("Do you really want to delete this record?. This process
   * can't be undone."). Kept as its own separately-named set of helpers
   * rather than reused, so each caller's intent stays clear.
   */
  private deleteRuleConfirmDialog() {
    return this.page.getByRole('dialog').filter({ has: this.page.getByRole('heading', { name: 'Are you sure?' }) });
  }

  async assertDeleteRuleConfirmVisible(): Promise<void> {
    await expect(this.deleteRuleConfirmDialog()).toBeVisible({ timeout: 5000 });
  }

  async confirmDeleteRule(): Promise<void> {
    await this.page.locator('[data-test-id="cf-ui-modal-confirm-confirm-button"]').click();
  }

  async cancelDeleteRule(): Promise<void> {
    await this.page.locator('[data-test-id="cf-ui-modal-confirm-cancel-button"]').click();
  }

  /** force: true — confirmed live, reproducible: a transient reflow left over from other drawer activity in the same session can sit on top of this button right after it becomes visible/stable; forcing through is safe since the target itself is genuinely interactable (same pattern as clickViewContents()). */
  async clickContinueOnRuleDialog(): Promise<void> {
    await this.frame.getByRole('dialog', { name: 'Rule', exact: true })
      .getByRole('button', { name: 'Continue' }).click({ force: true });
  }

  // ─── Phase 2c — Experience sub-drawer (nested under a rule row) ────────────────

  async clickAddContents(): Promise<void> {
    await this.frame.getByRole('dialog', { name: 'Rule', exact: true })
      .getByRole('button', { name: 'Add contents' }).click();
  }

  /**
   * Once a rule already has content, its row's action button relabels from
   * "Add contents" to "View contents (N)" — reopens the same "Add experience"
   * dialog for the existing content. Exact-cell match — see
   * isRuleToggleDisabled(). force: true — confirmed live, reproducible: a
   * transient reflow (a different unrelated element each time — a row div, an
   * accordion header) sits on top of this specific row right after other
   * drawer activity in the same session, well after the button itself is
   * visible/stable; forcing through is safe since the target itself is
   * genuinely interactable.
   */
  async clickViewContents(ruleName: string): Promise<void> {
    const row = this.frame.getByRole('dialog', { name: 'Rule', exact: true })
      .locator('table tr')
      .filter({ has: this.frame.getByRole('cell', { name: ruleName, exact: true }) });
    await row.getByRole('button', { name: /View contents/ }).click({ force: true });
  }

  async assertAddExperienceDialogVisible(): Promise<void> {
    await expect(this.addExperienceDialog()).toBeVisible({ timeout: 5000 });
  }

  /** .last() — if an earlier "Add experience" dialog didn't fully unmount after submitExperience() (same class of stuck-but-hidden element seen elsewhere in this app, e.g. the "Add existing entries" picker), a stale one can linger in the DOM alongside a freshly-reopened one; .last() always targets the one actually on screen now. */
  private addExperienceDialog() {
    return this.frame.getByRole('dialog', { name: 'Add experience', exact: true }).last();
  }

  async clickAddControlContents(): Promise<void> {
    await this.addExperienceDialog().getByRole('button', { name: 'Add control contents' }).click();
  }

  async clickChooseVariant(): Promise<void> {
    await this.addExperienceDialog().getByRole('button', { name: 'Choose variant' }).click();
  }

  /**
   * Waits for the just-added control content to actually register in the Add
   * experience dialog — the "Choose variant" button only renders once it does.
   * Confirmed live (bug found running the suite from VS Code): calling
   * submitExperience() right after selectExistingEntry() returns can race the
   * app's own "variant required" check — the modal closing only means the
   * entry picker is done, not that the experience dialog's state has caught
   * up yet. When that race is lost, "Add experience" silently saves with only
   * the control content and no validation toast at all, instead of blocking
   * with "Add a variant for every default content in the experience". Call
   * this after selectExistingEntry(CONTROL_ENTRY) and before submitExperience()
   * whenever the test intentionally omits the variant.
   */
  async assertControlContentAdded(): Promise<void> {
    await expect(
      this.addExperienceDialog().getByRole('button', { name: 'Choose variant' })
    ).toBeVisible({ timeout: 8000 });
  }

  /**
   * The "Add existing entries" picker is a host-page (non-iframe) modal — used for
   * both control content and variant selection. It's not exposed as role="dialog"
   * (confirmed live: role-scoping it times out even while visually on screen), so
   * this scopes by its heading instead. Heading text varies by context — control
   * content: "Add existing entries" (plural, multi-select — requires an explicit
   * confirm click, labeled "Insert entry", data-test-id="entity-selector-confirm");
   * variant: "Add existing entry" (singular, single-select — confirmed live:
   * clicking the entry row immediately inserts it and auto-closes the modal, with
   * NO confirm button rendered at all).
   *
   * ROOT CAUSE, confirmed live via manual reproduction: this used a bare
   * isVisible({timeout: 3000}) to decide whether to click the confirm button — a
   * 3s budget that's too tight under real load, so it would sometimes silently
   * conclude "no confirm button" and skip clicking it, even in the plural case
   * where one genuinely renders a beat later. The modal would then sit open,
   * un-clicked and un-cancelled, corrupting everything that ran afterward in the
   * same test (a later click on a DIFFERENT dialog would land on this stale one
   * instead) — this was the actual cause of hours of "A/B testing reads Disabled"
   * symptoms downstream, nowhere near this method. Distinguish the two cases up
   * front from the heading text instead of guessing from a timing race.
   */
  async selectExistingEntry(entryName: string): Promise<void> {
    const heading = this.page.getByRole('heading', { name: /^Add existing entr(y|ies)$/ });
    await expect(heading).toBeVisible({ timeout: 10000 });
    const isMultiSelect = (await heading.textContent())?.trim() === 'Add existing entries';
    await this.page.getByRole('textbox', { name: 'Type to search for entries' }).fill(entryName);
    const entryButton = this.page.getByRole('button', { name: entryName }).first();
    await expect(entryButton).toBeVisible({ timeout: 10000 });
    await entryButton.click();
    if (isMultiSelect) {
      const confirmButton = this.page.locator('[data-test-id="entity-selector-confirm"]');
      await expect(confirmButton).toBeEnabled({ timeout: 10000 });
      await confirmButton.click();
    }
    await expect(heading).not.toBeVisible({ timeout: 10000 });
  }

  async enableABTesting(): Promise<void> {
    // No {exact: true} — matches EligibilityCreatePage's own enableABTesting(). An
    // earlier exact match here silently never resolved (confirmed live via manual
    // browser inspection: the non-exact substring click toggles the switch fine).
    await this.addExperienceDialog().getByText('Disabled').click({ timeout: 8000 });
  }

  /**
   * Reads the toggle's current label. Confirmed live via an accessibility
   * snapshot (not a screenshot — this app's own font rendering makes "Enable"
   * vs "Enabled" hard to tell apart visually at normal screenshot resolution):
   * the ON-state label is literally "Enable", not "Enabled" — asymmetric with
   * the OFF-state label, which genuinely is "Disabled". Returns the semantic
   * 'Enabled'/'Disabled' pair for test readability while matching the real DOM text.
   */
  async getABTestingStatusLabel(): Promise<'Enabled' | 'Disabled'> {
    const enabled = this.addExperienceDialog().getByText('Enable', { exact: true });
    return (await enabled.isVisible().catch(() => false)) ? 'Enabled' : 'Disabled';
  }

  /**
   * The counterpart to enableABTesting() — turns A/B testing OFF. On a Live
   * campaign whose A/B test is actually running, this click does not flip the
   * switch immediately: it triggers an inline stop-confirmation prompt within
   * the same dialog instead (see getABStopConfirmationMessage() /
   * cancelABStopConfirmation() / confirmABStopConfirmation()). Targets the
   * ON-state label "Enable" (not "Enabled") — see getABTestingStatusLabel().
   */
  async disableABTesting(): Promise<void> {
    await this.addExperienceDialog().getByText('Enable', { exact: true }).click({ timeout: 8000 });
  }

  /**
   * The A/B-testing stop confirmation renders inline in the same "Add experience"
   * dialog — a message paragraph plus data-testid="cancel" / data-testid="update"
   * buttons — rather than as a separate modal or alertdialog. Confirmed live,
   * character-for-character, against the app's actual wording.
   */
  async getABStopConfirmationMessage(): Promise<string> {
    const paragraph = this.addExperienceDialog().locator('p').filter({ hasText: 'A/B testing is currently running' });
    await expect(paragraph).toBeVisible({ timeout: 5000 });
    return (await paragraph.textContent()) ?? '';
  }

  /** Declines the stop — reverts the toggle back to Enabled with no other side effects. */
  async cancelABStopConfirmation(): Promise<void> {
    await this.addExperienceDialog().getByTestId('cancel').click();
  }

  /** Confirms the stop — disables A/B testing and (per the app's own behavior) immediately re-enables the "Add control contents" button in the same dialog, before "Add experience" is even submitted. */
  async confirmABStopConfirmation(): Promise<void> {
    await this.addExperienceDialog().getByTestId('update').click();
  }

  /** Confirmed live: enabled while A/B testing is off, disabled while an A/B test is actively running on this rule's experience. */
  async isAddControlContentsDisabled(): Promise<boolean> {
    return await this.addExperienceDialog().getByRole('button', { name: 'Add control contents' }).isDisabled();
  }

  async fillABTestEndDate(dateStr: string): Promise<void> {
    const input = this.addExperienceDialog().getByRole('group', { name: 'A/B testing' }).getByRole('textbox');
    await input.click({ timeout: 8000 });
    await input.press('ArrowRight');
    await input.fill(dateStr, { timeout: 8000 });
  }

  async fillPrimaryTraffic(pct: number): Promise<void> {
    const input = this.addExperienceDialog().getByRole('spinbutton', { name: 'Traffic percentage' }).first();
    await input.fill(String(pct), { timeout: 8000 });
  }

  async submitExperience(): Promise<void> {
    const dialog = this.frame.getByRole('dialog', { name: 'Add experience', exact: true });
    // Confirmed live, reproducible: if this dialog doesn't actually finish
    // closing, a later clickViewContents() for a DIFFERENT rule silently
    // fails to open a fresh dialog — it just keeps reading this same stale
    // one underneath (confirmed via a failure screenshot: the "Add
    // experience" dialog was still showing THIS rule's control/variant, not
    // the one the test had moved on to check). No swallowed catch — a real
    // failure to close must surface here, not as a confusing wrong-data read
    // several steps later.
    //
    // Confirmed live via a captured failure snapshot: content (control +
    // variant) was already fully and correctly populated, and the "Add
    // experience" button itself showed as clicked (active/focused) — yet the
    // dialog still hadn't closed 30s later. The click registers but the
    // save/close occasionally doesn't take effect — the same class of
    // transient-UI-doesn't-settle symptom closeAllDrawers() already retries
    // for. Mirror that: re-click if the dialog is still open partway through
    // the budget, instead of a single click-and-wait.
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.addExperienceDialog().getByRole('button', { name: 'Add experience', exact: true }).click();
      const closed = await dialog.waitFor({ state: 'hidden', timeout: 10000 }).then(() => true).catch(() => false);
      if (closed) return;
    }
    await expect(dialog).toHaveCount(0, { timeout: 10000 });
  }

  /**
   * Submits "Add experience" when the caller expects the app to REJECT the
   * submission with a validation toast (e.g. an invalid A/B end date, or
   * control content with no variant) rather than succeed. Unlike
   * submitExperience(), this does NOT retry-click or wait for the dialog to
   * close — a rejected submission correctly leaves the dialog open, and
   * submitExperience()'s success-path retry/close logic was timing out
   * against that (confirmed live: P13N-CREATE-010/011/013 all failed on
   * submitExperience()'s final `toHaveCount(0)` assertion because the
   * dialog — correctly — never closed).
   */
  async submitExperienceExpectingRejection(): Promise<void> {
    await this.addExperienceDialog().getByRole('button', { name: 'Add experience', exact: true }).click();
  }

  // ─── Phase 3 — Save / publish ──────────────────────────────────────────────────

  async clickSaveActivate(): Promise<void> {
    await this.frame.getByTestId('submit-save-active-drawer').click();
  }

  async clickSaveDraft(): Promise<void> {
    await this.frame.getByTestId('submit-save-draft-drawer').click();
  }

  async clickCancel(): Promise<void> {
    await this.frame.getByTestId('onclose-basic-drawer').click();
  }

  /** Closes just the innermost (topmost) open drawer, leaving any parent drawers (e.g. the Rule list dialog) open underneath — the single-level counterpart to closeAllDrawers(). */
  async closeInnermostDrawer(): Promise<void> {
    await this.frame.getByTestId('onclose-basic-drawer').last().click();
    await this.page.waitForTimeout(400);
  }

  /**
   * Closes every currently-open nested drawer (Create campaign / Ruleset / Rule
   * / Add experience). Confirmed live: all of them share the SAME
   * "onclose-basic-drawer" testid, so a plain clickCancel() throws a strict-mode
   * violation once more than one is open at once (e.g. after cancelling out of
   * a validation check triggered deep inside the Add experience sub-drawer).
   * Repeatedly clicks the innermost (.last()) one until none remain.
   */
  async closeAllDrawers(): Promise<void> {
    const cancelButtons = this.frame.getByTestId('onclose-basic-drawer');
    for (let i = 0; i < 5; i++) {
      const count = await cancelButtons.count();
      if (count === 0) break;
      // Confirmed live, reproducible: right after a save, a drawer can
      // auto-close itself between the count() above and this click — the
      // button detaches mid-click and a plain click hangs for the full
      // default actionTimeout. A short per-attempt timeout plus a swallowed
      // catch lets the loop just re-count and move on instead.
      await cancelButtons.last().click({ timeout: 8000 }).catch(() => {});
      await this.page.waitForTimeout(400);
    }
    // Confirmed live, reproducible: the drawer wrapper's own fade-out
    // transition can keep intercepting clicks on the list page underneath for
    // up to ~30s after the last close click above — wait for it to actually
    // finish before returning, not just for the close button to disappear.
    await this.frame.locator('.rs-drawer-wrapper').last().waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
  }

  /**
   * Host-page toast (e.g. "Save campaign successfully" / "Campaign update
   * successfully"). Returns its actual text so callers can log/assert the real
   * message the app displayed instead of hardcoding an expected string.
   */
  async assertSaveSuccess(): Promise<string> {
    const toast = this.page.locator('.css-1pm4qpo').first();
    await expect(toast).toBeVisible({ timeout: 10000 });
    return (await toast.textContent() ?? '').trim();
  }

  async waitForNotificationsToClear(): Promise<void> {
    await this.page.locator('[data-test-id="cf-ui-paragraph"]')
      .first()
      .waitFor({ state: 'hidden', timeout: 15000 })
      .catch(() => {});
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
