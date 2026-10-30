import { Page, FrameLocator, Locator, expect } from '@playwright/test';

/**
 * ContentPersonalizationCreatePage
 *
 * Content Personalization is ENTRY-SCOPED, same as Content Testing — the
 * creation flow lives inside a Contentful entry's editor, in the "Xenia"
 * app-iframe field (the same [data-test-id="cf-widget-renderer"] iframe used
 * everywhere else), not on a dedicated Xenia app page. It is the sibling
 * radio option to Content Testing on that same field widget ("Personalization"
 * vs "Content Testing"), confirmed live to default to "Personalization"
 * selected.
 *
 * Structural divergence from ContentTestingCreatePage — confirmed live, do
 * NOT collapse the two: Content Personalization's wizard has an extra
 * **Rules** tab between General and Variants (General -> Rules -> Variants ->
 * Summary, 4 tabs), sharing the same rule-template backend/dropdown as the
 * app-level Personalization flow. Content Testing has no Rules tab at all
 * (General -> Variants -> Summary, 3 tabs) — variants attach directly.
 *
 * Two DOM contexts are in play, same split as ContentTestingCreatePage:
 *   - this.page   -> Contentful NATIVE UI (entry list, entry editor chrome,
 *                    host-page toasts/alerts)
 *   - this.frame  -> the Xenia field iframe (radio toggle + 4-tab wizard)
 *
 * Confirmed live, none of the wizard's tabs respond to a direct tab-header
 * click while the wizard is mid-flow — General -> Rules -> Variants only
 * advance via the "Next" button (data-test-id="next"). This includes
 * Summary: it does NOT open by clicking the Summary tab itself; the read-only
 * Summary view is instead reached from the entry-scoped Results table's
 * "View Details" action, which is a distinct, separate flow from this
 * create/edit wizard (not modeled here).
 *
 * Confirmed live: a newly created rule defaults to **Inactive**. Moving from
 * Rules to Variants (via Next) while the current rule is Inactive triggers a
 * non-blocking host-page toast, "Make sure to activate the rule." — wizard
 * navigation still proceeds to Variants regardless. No such toast appears
 * when the rule is Active at the time of that Next click.
 */
export class ContentPersonalizationCreatePage {
  private readonly frame: FrameLocator;

  constructor(private readonly page: Page) {
    this.frame = page.frameLocator('[data-test-id="cf-widget-renderer"]');
  }

  // ─── Entry navigation (Contentful native — MAIN page, not the widget iframe) ──

  /**
   * Opens a content entry by name via Contentful's native Content list.
   * Mirrors ContentTestingCreatePage.openEntryByName — same fixture entries
   * are usable here since both campaign types share the one Xenia field.
   *
   * Confirmed live this session: the Xenia widget iframe can occasionally
   * fail to render at all after this navigation (the "Personalization" radio
   * never appears, even after 30s) — happens unpredictably partway through a
   * long run, independent of auth freshness (reproduced even right after a
   * forced fresh login). When this happens inside a shared-page suite with no
   * recovery, every subsequent test in the file cascades to "did not run".
   * Retries the full navigation once before giving up, which has recovered
   * from this in every case observed so far.
   */
  async openEntryByName(name: string): Promise<void> {
    const radio = this.frame.getByRole('radio', { name: 'Personalization' });
    for (let attempt = 1; attempt <= 2; attempt++) {
      await this.page.getByRole('link', { name: 'Content', exact: true }).click();
      await this.page.getByRole('textbox', { name: 'Type to search for entries' }).fill(name);
      await this.page.keyboard.press('Enter');
      await this.page.getByRole('link', { name, exact: true }).first().click();
      const loaded = await radio.isVisible({ timeout: 20000 }).catch(() => false);
      if (loaded) return;
      console.log(`  [openEntryByName] Widget failed to load for "${name}" on attempt ${attempt}, retrying...`);
    }
    await expect(radio).toBeVisible({ timeout: 30000 });
  }

  // ─── Widget toggle ─────────────────────────────────────────────────────────

  /** Confirmed live: "Personalization" is the default-selected radio, but select it explicitly for a deterministic starting state. */
  async switchToPersonalizationTab(): Promise<void> {
    await this.frame.getByRole('radio', { name: 'Personalization', exact: true }).click();
    await this.assertCampaignsTableVisible();
  }

  async assertCampaignsTableVisible(): Promise<void> {
    await expect(this.frame.getByRole('button', { name: '+ Campaign' }))
      .toBeVisible({ timeout: 10000 });
  }

  /**
   * Reads and parses the "Results (N)" heading above the entry-scoped
   * Results table — confirmed live this heading exists here, same pattern as
   * CampaignListPage's app-level "Results (N)" heading.
   */
  async getResultsCount(): Promise<number> {
    const heading = this.frame.getByRole('heading', { name: /^Results \(\d+\)$/ });
    await expect(heading).toBeVisible({ timeout: 10000 });
    const text = await heading.textContent();
    const match = text?.match(/\((\d+)\)/);
    if (!match) {
      throw new Error(`Could not parse campaign count out of Results heading text: "${text}"`);
    }
    return parseInt(match[1], 10);
  }

  /**
   * Gets back to the entry-scoped Results table the cheap way when possible.
   * A test normally already ends there — either the wizard auto-closes on a
   * successful save, or the test itself calls closeWizard() — so re-navigating
   * via the Content list (openEntryByName + switchToPersonalizationTab) on
   * every single afterEach/mid-test check was pure overhead, confirmed live
   * to be the dominant cost of re-running this suite repeatedly. Only falls
   * back to the full re-navigation when the Results table genuinely isn't
   * showing (e.g. a prior step left the wizard open after a failure).
   */
  async ensureOnResultsTable(fixtureEntryName: string): Promise<void> {
    const alreadyThere = await this.frame.getByRole('button', { name: '+ Campaign' })
      .isVisible({ timeout: 3000 }).catch(() => false);
    if (alreadyThere) return;
    await this.openEntryByName(fixtureEntryName);
    await this.switchToPersonalizationTab();
  }

  /** Closes the wizard without saving — returns to the campaigns table. Confirmed live: no unsaved-changes confirmation prompt. */
  async closeWizard(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Close' }).click();
    await this.assertCampaignsTableVisible();
  }

  async clickAddCampaign(): Promise<void> {
    const generalTab = this.frame.getByRole('tab', { name: 'General' });
    await this.frame.getByRole('button', { name: '+ Campaign' }).click();
    try {
      await expect(generalTab).toBeVisible({ timeout: 5000 });
    } catch {
      await this.frame.getByRole('button', { name: '+ Campaign' }).click();
      await expect(generalTab).toBeVisible({ timeout: 10000 });
    }
  }

  /** Confirms the wizard reopened on the General tab — e.g. right after clickEditCampaignInResultsTable(). */
  async assertWizardOpenOnGeneral(): Promise<void> {
    await expect(this.frame.getByRole('textbox', { name: 'Campaign name *' })).toBeVisible({ timeout: 10000 });
  }

  // ─── Wizard — General tab ──────────────────────────────────────────────────

  async fillName(name: string): Promise<void> {
    const nameInput = this.frame.getByRole('textbox', { name: 'Campaign name *' });
    await nameInput.click();
    await nameInput.press('Control+A');
    await nameInput.type(name);
  }

  async fillDescription(text: string): Promise<void> {
    await this.frame.getByRole('textbox', { name: 'Campaign description (optional)' }).fill(text);
  }

  /** react-select — same open/pick pattern used across the suite (GradualRolloutCreatePage.selectChannel, ContentTestingCreatePage.selectChannel). */
  async selectChannel(channelName: string): Promise<void> {
    await this.frame.locator('.select__input-container').first().click();
    const option = this.frame.locator('.select__option', { hasText: channelName }).first();
    await option.waitFor({ state: 'visible', timeout: 5000 });
    await option.click();
  }

  /**
   * Native <input type="datetime-local"> — plain fill() is reliable on the
   * empty CREATE field, but confirmed live NOT reliable on the EDIT/reopen
   * flow when the field already holds a value: a single fill() can silently
   * leave the original value in place (the underlying React-controlled
   * component not picking up the change). Clearing first, then verifying the
   * fill actually took (retrying once if not) makes this work in both cases.
   */
  async fillStartDate(datetimeLocal: string): Promise<void> {
    const input = this.frame.locator('input[type="datetime-local"]').first();
    await input.fill('');
    await input.fill(datetimeLocal);
    if ((await input.inputValue()) !== datetimeLocal) {
      await input.fill('');
      await input.fill(datetimeLocal);
    }
  }

  /** Reads the Campaign name field's current value — for verifying it persisted correctly after reopening via Edit. */
  async getCampaignNameValue(): Promise<string> {
    return await this.frame.getByRole('textbox', { name: 'Campaign name *' }).inputValue();
  }

  /** Whether the Start date field is disabled — expected once a campaign has transitioned to Live. */
  async isStartDateDisabled(): Promise<boolean> {
    return await this.frame.locator('input[type="datetime-local"]').first().isDisabled();
  }

  /** Reads the Start date field's current value (datetime-local format, "YYYY-MM-DDTHH:mm"). */
  async getStartDateValue(): Promise<string> {
    return await this.frame.locator('input[type="datetime-local"]').first().inputValue();
  }

  /** Confirms a given channel is present in the Channels field (as a chip, react-select multi-value). */
  async assertChannelPresent(channelName: string): Promise<void> {
    await expect(this.frame.getByText(channelName, { exact: true })).toBeVisible({ timeout: 5000 });
  }

  /**
   * "Campaign end date & time (PST)" is optional — confirmed live, it's
   * hidden behind a plain (non-toggle-switch) checkbox until checked, which
   * then reveals a second native datetime-local input. force: true on the
   * click — this checkbox sits directly under the "Enable" toggle switch,
   * whose own element can intercept pointer events on a plain click.
   */
  async fillEndDate(datetimeLocal: string): Promise<void> {
    const checkbox = this.frame.locator('input[type="checkbox"]:not([role="switch"])').first();
    if (!(await checkbox.isChecked())) {
      await checkbox.click({ force: true });
    }
    const input = this.frame.locator('input[type="datetime-local"]').nth(1);
    await input.fill(datetimeLocal);
  }

  /**
   * Confirmed live: shown inline on the General tab, directly under the
   * Start date field, when Next is clicked with a start date that's already
   * in the past. Also surfaces as a host-page toast if Save Campaign as
   * Draft is attempted in the same state. Exact text (no "(PST)" suffix,
   * unlike the app-level Personalization flow's equivalent message).
   */
  startDateErrorText(): Locator {
    return this.frame.getByText('Campaign start date & time should be greater than current date & time');
  }

  async assertStartDateErrorVisible(): Promise<void> {
    await expect(this.startDateErrorText()).toBeVisible({ timeout: 5000 });
  }

  /** Confirmed live: shown inline under the End date field when Next is clicked with an end date at or before the start date. */
  endDateErrorText(): Locator {
    return this.frame.getByText('Campaign end date & time should be greater than campaign start date & time');
  }

  async assertEndDateErrorVisible(): Promise<void> {
    await expect(this.endDateErrorText()).toBeVisible({ timeout: 5000 });
  }

  async clickNext(): Promise<void> {
    await this.frame.getByTestId('next').click();
  }

  /**
   * Confirmed live: from Variants, this is NOT deterministic — it has landed
   * on General in some runs and on Rules directly in others (observed
   * headless vs. headed on the same code path). Do not assume either target;
   * callers that need to land specifically on Rules should use
   * returnToRulesTab() instead of chaining this with a bare clickNext().
   */
  async clickBack(): Promise<void> {
    await this.frame.getByTestId('back').click();
  }

  /**
   * Robust "go back to Rules" for callers on Variants, tolerant of
   * clickBack()'s confirmed non-deterministic landing tab (General or Rules).
   * Detects which tab Back actually landed on via a General-tab-only element
   * and advances once more with Next only if needed.
   */
  async returnToRulesTab(): Promise<void> {
    await this.clickBack();
    const onGeneral = await this.frame
      .getByRole('textbox', { name: 'Campaign name *' })
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    if (onGeneral) {
      await this.clickNext();
    }
  }

  // ─── Wizard — Rules tab ─────────────────────────────────────────────────────

  async clickCreateRule(): Promise<void> {
    await this.frame.getByTestId('create-rule-button').click();
  }

  /**
   * Picks an existing rule template from the "Choose a rule template"
   * dropdown. Selecting a template pre-fills Rule name and the Defining-rule
   * condition with the template's own saved values (confirmed live).
   *
   * The .select__input-container / .select__option classes are a best-
   * informed guess by analogy to selectChannel (same react-select library,
   * confirmed live only for the Channels field, not independently confirmed
   * for this dropdown) — verify against a real run and adjust if it fails.
   */
  async selectRuleTemplate(templateName: string): Promise<void> {
    await this.frame.locator('.select__input-container').first().click();
    const option = this.frame.locator('.select__option', { hasText: templateName }).first();
    await option.waitFor({ state: 'visible', timeout: 5000 });
    await option.click();
  }

  /**
   * Overwrites the Rule name field. Template selection pre-fills this field
   * with the template's own name, which will collide with existing rules of
   * the same name across the shared space — always give the rule a unique
   * name via this method after selectRuleTemplate().
   */
  async fillRuleName(name: string): Promise<void> {
    const input = this.frame.getByRole('textbox', { name: 'Rule name *' });
    await input.click();
    await input.press('Control+A');
    await input.type(name);
  }

  async clickSaveRule(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Save rule' }).click();
  }

  /**
   * Builds a rule manually (no template) via the "Select a attribute" /
   * operator / value condition builder — confirmed live this is the Rules
   * tab's default state (no separate "New rule" click needed; the template
   * dropdown is simply left untouched). Single AND condition only —
   * multi-condition manual rules are out of scope. `operator` must match one
   * of the operator <select>'s option labels exactly (e.g. "Equals").
   *
   * Confirmed live (2026-09-27): Save & Activate on a campaign built from a
   * manually-created rule reliably failed to persist 4/4 times when driven
   * by automation, but succeeded immediately when the exact same steps were
   * performed manually at normal human pace — an automation-speed timing
   * issue, not a real app defect (manually confirmed with the user). The
   * short settle-wait below after Save rule gives whatever the app does
   * with the rule's condition (compiling/committing the rule string
   * server-side) the same breathing room a human naturally leaves between
   * actions, before any caller proceeds to Save & Activate.
   */
  async createManualRule(ruleName: string, attribute: string, operator: string, value: string): Promise<void> {
    await this.frame.getByRole('textbox', { name: 'Select a attribute' }).click();
    const option = this.frame.getByRole('option', { name: attribute, exact: true });
    await option.waitFor({ state: 'visible', timeout: 5000 });
    await option.click();
    await this.frame.getByTestId('option-select-operator').selectOption(operator);
    await this.frame.getByRole('textbox', { name: 'Value' }).fill(value);
    await this.fillRuleName(ruleName);
    await this.clickSaveRule();
    await this.page.waitForTimeout(2000);
  }

  /** The Rules-tab row (article) for a given rule name, scoped for status/toggle/delete lookups. */
  ruleRow(ruleName: string): Locator {
    return this.frame.getByRole('article').filter({ hasText: ruleName });
  }

  /** Reads the rule's Active/Inactive status from its toggle's accessible name. Confirmed live: aria-checked=true <-> "Active", aria-checked=false <-> "Inactive". */
  async getRuleStatusText(ruleName: string): Promise<'Active' | 'Inactive'> {
    const checked = await this.ruleRow(ruleName).getByRole('switch').getAttribute('aria-checked');
    return checked === 'true' ? 'Active' : 'Inactive';
  }

  /**
   * Toggles a rule between Active/Inactive. Confirmed live: clicking the raw
   * switch input directly times out ("intercepts pointer events") — its own
   * label span sits on top and must be clicked instead.
   */
  async toggleRuleActiveState(ruleName: string): Promise<void> {
    await this.ruleRow(ruleName).getByText(/^(Active|Inactive)$/).click();
  }

  /**
   * Confirmed live (bug-fix verification): inline red validation text
   * rendered INSIDE the rule's own card on the Variants tab (a <p>, not a
   * host-page toast) — appears specifically when Save & Activate is clicked
   * while the rule's Active content has no variant assigned. Verified live
   * that its presence count goes 0 -> 1 as a direct result of that click
   * (not a permanently-visible button label). Exact text: "Add a variant".
   */
  addVariantValidationMessage(ruleName: string): Locator {
    return this.ruleRow(ruleName).getByText('Add a variant', { exact: false });
  }

  async assertAddVariantValidationVisible(ruleName: string): Promise<void> {
    await expect(this.addVariantValidationMessage(ruleName)).toBeVisible({ timeout: 10000 });
  }

  async getAddVariantValidationText(ruleName: string): Promise<string> {
    return (await this.addVariantValidationMessage(ruleName).first().textContent())?.trim() ?? '';
  }

  /**
   * Scoped to a rule's card — inline validation shown when "Enable A/B
   * testing with" is checked on a variant but its "Campaign end date & time
   * (PST)" field is left blank. Confirmed live: clicking Save & Activate in
   * that state renders this as a <p> inside the rule's card, same inline
   * pattern as addVariantValidationMessage() above (not a host-page toast).
   * Exact text: "A/B test end date is required."
   */
  abTestEndDateValidationMessage(ruleName: string): Locator {
    return this.ruleRow(ruleName).getByText('A/B test end date is required', { exact: false });
  }

  async assertAbTestEndDateValidationVisible(ruleName: string): Promise<void> {
    await expect(this.abTestEndDateValidationMessage(ruleName)).toBeVisible({ timeout: 10000 });
  }

  async getAbTestEndDateValidationText(ruleName: string): Promise<string> {
    return (await this.abTestEndDateValidationMessage(ruleName).first().textContent())?.trim() ?? '';
  }

  // ─── Wizard — Variants tab ──────────────────────────────────────────────────

  /** Per-rule "Choose a variant" button, scoped to that rule's card on the Variants tab. */
  chooseVariantButton(ruleName: string): Locator {
    return this.ruleRow(ruleName).getByRole('button', { name: 'Choose a variant' });
  }

  /**
   * Opens Contentful's native "Add existing entry" reference picker for a
   * given rule's variant slot. Same single-click + generous-wait pattern as
   * ContentTestingCreatePage.clickChooseVariant — do not blind-retry-click
   * once the dialog is open (a second click can mis-select a picker row
   * instead, since Playwright's actionability check runs against the
   * iframe's own document and doesn't see the top-page dialog as blocking).
   */
  async clickChooseVariant(ruleName: string): Promise<void> {
    const dialog = this.page.locator('[data-test-id="entity-selector-dialog"]');
    await this.chooseVariantButton(ruleName).click();
    await expect(dialog).toBeVisible({ timeout: 15000 });
  }

  async selectVariantEntry(name: string): Promise<void> {
    const dialog = this.page.locator('[data-test-id="entity-selector-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await dialog.getByRole('textbox', { name: 'Type to search for entries' }).fill(name);
    await dialog.getByRole('button', { name }).first().click();
  }

  /**
   * Checks the "Enable A/B testing with" checkbox on a rule's chosen variant.
   * Confirmed live: this reveals a Traffic spinbutton (defaults to 100) and a
   * Campaign end date & time (PST) field on the variant, and adds a second,
   * disabled-Traffic "Control" card using the entry's own content — traffic
   * auto-balances reciprocally between the two (e.g. Variant 60 <-> Control
   * 40), confirmed live.
   */
  async enableAbTesting(ruleName: string): Promise<void> {
    await this.ruleRow(ruleName).getByRole('checkbox').click();
  }

  /**
   * Confirmed live: unlike the campaign-level start date (locked once Live,
   * see isStartDateDisabled()), the "Enable A/B testing with" checkbox stays
   * fully editable on a Live campaign — checked multiple times, including
   * 65+ seconds after the Live transition, always disabled:false, and a
   * click genuinely toggles it.
   */
  async isAbTestingCheckboxDisabled(ruleName: string): Promise<boolean> {
    return await this.ruleRow(ruleName).getByRole('checkbox').isDisabled();
  }

  /** Blurs the field after filling so its value commits before a caller immediately clicks Save — an uncommitted focused input has been observed to make Save silently no-op (Results table shows 0 rows despite the wizard closing normally). */
  async setVariantTraffic(ruleName: string, value: number): Promise<void> {
    const input = this.ruleRow(ruleName).getByRole('spinbutton').first();
    await input.fill(String(value));
    await input.press('Tab');
  }

  /**
   * Fills the variant's "Campaign end date & time (PST)" field, revealed
   * only once A/B testing is enabled on that variant. Untested hypothesis
   * being investigated: leaving this blank may be what makes Save
   * unreliable specifically for A/B-enabled campaigns (repeatedly observed
   * silent-save failures on that flow, not on the plain-variant flow) —
   * this method exists to test that theory, not because the field has been
   * confirmed required.
   */
  async fillVariantEndDate(ruleName: string, datetimeLocal: string): Promise<void> {
    const input = this.ruleRow(ruleName).locator('input[type="datetime-local"]');
    await input.fill(datetimeLocal);
  }

  /**
   * Control card is nested INSIDE the same rule-level article as the Variant
   * (unlike ContentTestingCreatePage, where Variant/Control are flat
   * siblings) — confirmed live: filtering articles by the "Control" label
   * matches both the outer rule article (whose text content includes the
   * nested Control text) and the inner Control article itself, a strict-mode
   * violation on a bare getByRole('spinbutton'). Disabled state is the
   * stable signal instead — Control's Traffic field is always disabled,
   * confirmed live both here and in ContentTestingCreatePage.
   */
  async assertControlTraffic(expected: number): Promise<void> {
    const controlSpinbutton = this.frame.locator('input[type="number"]:disabled');
    await expect(controlSpinbutton).toHaveValue(String(expected));
  }

  /** Confirms the "Enable A/B testing with" checkbox is unchecked — the plain, single-variant state (no Traffic/Control card, no B-side end date field). */
  async assertAbTestingNotEnabled(ruleName: string): Promise<void> {
    await expect(this.ruleRow(ruleName).getByRole('checkbox')).not.toBeChecked();
  }

  /** Confirms no Traffic spinbutton renders anywhere on Variants — only appears once A/B testing is enabled on some variant, confirmed live. */
  async assertNoTrafficFieldsVisible(): Promise<void> {
    await expect(this.frame.getByRole('spinbutton')).toHaveCount(0);
  }

  // ─── Save + notifications ───────────────────────────────────────────────────

  saveDraftButton(): Locator {
    return this.frame.getByRole('button', { name: 'Save Campaign as Draft' });
  }

  async clickSaveDraft(): Promise<void> {
    await this.saveDraftButton().click();
  }

  /**
   * Only appears on the Variants tab. Confirmed live: Save & Activate shows
   * the SAME "Campaign saved successfully." success toast even when the
   * campaign fails to actually schedule (e.g. a rule has no variant
   * assigned) — resulting status silently stays Draft with no error shown.
   * Callers relying on activation succeeding should verify the resulting
   * status via the entry-scoped Results table, not just this toast.
   */
  saveActivateButton(): Locator {
    return this.frame.getByRole('button', { name: 'Save & Activate Campaign' });
  }

  async clickSaveActivate(): Promise<void> {
    await this.saveActivateButton().click();
  }

  /**
   * Confirmed live: the Variants tab's submit button reads "Save & Activate
   * Campaign" when the campaign hasn't been activated yet (a fresh create,
   * or a Draft reopened via Edit) — but reads "Update Campaign" instead once
   * reopening an already-Scheduled/Live campaign via Edit. Use this method
   * (not clickSaveActivate()) when the caller knows the campaign being
   * edited is already past Draft.
   */
  async clickUpdateCampaign(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Update Campaign' }).click();
  }

  /**
   * Confirmed live, exact text: fires as a non-blocking host-page toast when
   * Next is clicked on the Rules tab while the current rule is Inactive.
   * Wizard navigation to Variants proceeds regardless — this is a warning,
   * not a hard validation block.
   */
  ruleActivationWarningToast(): Locator {
    return this.page.getByText('Make sure to activate the rule.').last();
  }

  async assertRuleActivationWarningVisible(): Promise<void> {
    await expect(this.ruleActivationWarningToast()).toBeVisible({ timeout: 10000 });
  }

  async assertRuleActivationWarningNotShown(): Promise<void> {
    await expect(this.ruleActivationWarningToast()).toHaveCount(0);
  }

  /**
   * Reads the actual text of the most recent host-page save toast, for
   * asserting the exact expected message dynamically (read from the live
   * UI, not assumed/hardcoded).
   *
   * Scoped to role=alert rather than the generic [data-test-id="cf-ui-
   * paragraph"] testid: confirmed live that testid is reused elsewhere on
   * the page for unrelated static content, so `.last()` on it can resolve
   * instantly against something already on screen — which let this method
   * return before the real save toast (and the underlying save request) had
   * actually appeared/completed, racing ahead of assertSaveSuccess() and
   * causing it to poll the Results table too early. role=alert is the
   * semantic container the toast itself uses and is not reused elsewhere,
   * confirmed live across every toast seen this session (heading/paragraph/
   * Dismiss button all live inside it). Strips the trailing "Dismiss"
   * button label that .textContent() picks up along with the message.
   */
  async getLastSaveToastText(): Promise<string> {
    const alert = this.page.getByRole('alert').last();
    await expect(alert).toBeVisible({ timeout: 15000 });
    const fullText = (await alert.textContent())?.trim() ?? '';
    return fullText.replace(/Dismiss$/, '').trim();
  }

  /**
   * Dismisses every currently-visible toast, so a prior toast can't be
   * mistaken for a new one on a later assertion. Confirmed live: clicking
   * the outer notification container does NOT dismiss it — the inner
   * "Dismiss" button must be clicked (matching RedirectionCreatePage's
   * dismissNotificationIfVisible, not ContentTestingCreatePage's
   * container-click version, which never surfaced this because none of its
   * tests re-trigger the same toast twice in one run).
   */
  async dismissNotifications(): Promise<void> {
    const notifications = this.page.locator('[data-test-id="cf-ui-notification"]');
    for (let i = 0; i < 5; i++) {
      const first = notifications.first();
      if (!(await first.isVisible({ timeout: 2000 }).catch(() => false))) break;
      await first.locator('button').click();
      await expect(first).not.toBeVisible({ timeout: 5000 }).catch(() => {});
    }
  }

  /**
   * "Did it actually save" signal — entry-scoped Results table row + status.
   * Confirmed live: the Results table can occasionally miss a just-saved
   * campaign within the first 15s regardless of which prior step ran (an
   * async fetch-settle race independent of any specific field, since it has
   * now been observed on a run that never touches the traffic field at all)
   * — reload once to force a fresh fetch rather than waiting indefinitely on
   * a client-side cache that may not update on its own.
   */
  async assertSaveSuccess(campaignName: string, status: string = 'Draft'): Promise<void> {
    const row = this.frame.getByRole('row', { name: campaignName });
    try {
      await expect(row).toBeVisible({ timeout: 15000 });
    } catch {
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      await expect(this.frame.getByRole('button', { name: '+ Campaign' })).toBeVisible({ timeout: 15000 });
      await expect(row).toBeVisible({ timeout: 15000 });
    }
    await expect(row.getByText(status)).toBeVisible();
  }

  /**
   * Reopens a saved campaign for editing via its Results-table row's "Edit
   * Campaign" icon button — confirmed live, the row's action icons have no
   * visible text or aria-label, only a `title` attribute ("Edit Campaign",
   * "Share Campaign", etc.), which Playwright's accessible-name computation
   * resolves via getByRole('button', { name }) same as a visible label.
   * Lands back on the wizard's General tab.
   */
  async clickEditCampaignInResultsTable(campaignName: string): Promise<void> {
    const row = this.frame.getByRole('row', { name: campaignName });
    await row.getByRole('button', { name: 'Edit Campaign' }).click();
  }

  // ─── Delete (entry-scoped Results table only) ──────────────────────────────
  //
  // Same page-level confirm dialog as ContentTestingCreatePage's delete:
  // heading "Are you sure?", text 'Do you really want to delete the campaign
  // "<name>"? This process can't be undone.', buttons "No"/"Yes!" (confirm
  // button data-test-id="cf-ui-modal-confirm-confirm-button") — confirmed live.

  /** Quietly no-ops if the row isn't present. */
  async deleteCampaignInResultsTable(campaignName: string): Promise<void> {
    const row = this.frame.getByRole('row', { name: campaignName });
    if (!(await row.isVisible({ timeout: 5000 }).catch(() => false))) {
      return;
    }
    await row.getByRole('button', { name: 'Delete Campaign' }).click();
    await expect(this.page.getByRole('heading', { name: 'Are you sure?' })).toBeVisible({ timeout: 5000 });
    await this.page.locator('[data-test-id="cf-ui-modal-confirm-confirm-button"]').click();
    await expect(row).toHaveCount(0, { timeout: 10000 });
  }

  /**
   * Stops a Live/Paused/Scheduled campaign via the entry-scoped Results
   * table, landing it on Expired — required before Delete is enabled for
   * those statuses (Delete Campaign is disabled for anything but
   * Draft/Expired, confirmed live). Same page-level "Are you sure?" confirm
   * dialog pattern as Delete.
   */
  async stopCampaignInResultsTable(campaignName: string): Promise<void> {
    const row = this.frame.getByRole('row', { name: campaignName });
    await row.getByRole('button', { name: 'Stop Campaign' }).click();
    await expect(this.page.getByRole('heading', { name: 'Are you sure?' })).toBeVisible({ timeout: 5000 });
    await this.page.locator('[data-test-id="cf-ui-modal-confirm-confirm-button"]').click();
    await expect(row.getByText('Expired')).toBeVisible({ timeout: 10000 });
  }

  // ─── Pause (entry-scoped Results table only) ────────────────────────────────
  //
  // Same page-level "Are you sure?" confirm-dialog pattern as Stop/Delete —
  // confirmed live: content 'Do you really want to pause the campaign
  // "<name>"?', buttons "No" (cf-ui-modal-confirm-cancel-button) / "Yes!"
  // (cf-ui-modal-confirm-confirm-button). Confirming shows the exact
  // role=alert success message "Campaign paused successfully!" and the row
  // transitions to "Paused". Clicking "No" closes the dialog with no change.

  async clickPauseCampaign(campaignName: string): Promise<void> {
    const row = this.frame.getByRole('row', { name: campaignName });
    await row.getByRole('button', { name: 'Pause Campaign' }).click();
  }

  async assertPauseConfirmDialogVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: 'Are you sure?' })).toBeVisible({ timeout: 10000 });
  }

  pauseConfirmDialogText(): Locator {
    return this.page.locator('[data-test-id="cf-ui-modal-content"]');
  }

  async cancelPauseCampaign(): Promise<void> {
    await this.page.locator('[data-test-id="cf-ui-modal-confirm-cancel-button"]').click();
    await expect(this.page.getByRole('heading', { name: 'Are you sure?' })).not.toBeVisible({ timeout: 5000 });
  }

  async confirmPauseCampaign(campaignName: string): Promise<void> {
    const row = this.frame.getByRole('row', { name: campaignName });
    await this.page.locator('[data-test-id="cf-ui-modal-confirm-confirm-button"]').click();
    await expect(row.getByText('Paused')).toBeVisible({ timeout: 10000 });
  }

  // ─── Stop — standalone, No/Yes! path (distinct from stopCampaignInResultsTable
  // above, which always confirms immediately and is used only for cleanup) ───
  //
  // Same page-level "Are you sure?" confirm-dialog pattern as Pause/Delete —
  // confirmed live: content 'Do you really want to stop the campaign
  // "<name>"? This will deactivate the campaign.', buttons "No"
  // (cf-ui-modal-confirm-cancel-button) / "Yes!"
  // (cf-ui-modal-confirm-confirm-button). Confirming shows the exact
  // role=alert success message "Campaign stopped successfully!" and the row
  // transitions to "Expired". Clicking "No" closes the dialog with no change
  // — the campaign stays in whatever status it was (e.g. still Paused, with
  // "Resume Campaign" still the available action).

  async clickStopCampaignAction(campaignName: string): Promise<void> {
    const row = this.frame.getByRole('row', { name: campaignName });
    await row.getByRole('button', { name: 'Stop Campaign' }).click();
  }

  async assertStopConfirmDialogVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: 'Are you sure?' })).toBeVisible({ timeout: 10000 });
  }

  stopConfirmDialogText(): Locator {
    return this.page.locator('[data-test-id="cf-ui-modal-content"]');
  }

  async cancelStopCampaign(): Promise<void> {
    await this.page.locator('[data-test-id="cf-ui-modal-confirm-cancel-button"]').click();
    await expect(this.page.getByRole('heading', { name: 'Are you sure?' })).not.toBeVisible({ timeout: 5000 });
  }

  async confirmStopCampaignAction(campaignName: string): Promise<void> {
    const row = this.frame.getByRole('row', { name: campaignName });
    await this.page.locator('[data-test-id="cf-ui-modal-confirm-confirm-button"]').click();
    await expect(row.getByText('Expired')).toBeVisible({ timeout: 10000 });
  }

  // ─── Resume (entry-scoped Results table only) ───────────────────────────────
  //
  // Same page-level "Are you sure?" confirm-dialog pattern as Pause/Stop/Delete
  // — confirmed live: content 'Do you really want to resume the campaign
  // "<name>"?', buttons "No" (cf-ui-modal-confirm-cancel-button) / "Yes!"
  // (cf-ui-modal-confirm-confirm-button). Confirming shows the exact
  // role=alert success message "Campaign resumed successfully!" and the row
  // transitions back to "Scheduled" (the status it was in before being
  // paused, given its start date is still in the future). Clicking "No"
  // closes the dialog with no change — the campaign stays "Paused".

  async clickResumeCampaign(campaignName: string): Promise<void> {
    const row = this.frame.getByRole('row', { name: campaignName });
    await row.getByRole('button', { name: 'Resume Campaign' }).click();
  }

  async assertResumeConfirmDialogVisible(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: 'Are you sure?' })).toBeVisible({ timeout: 10000 });
  }

  resumeConfirmDialogText(): Locator {
    return this.page.locator('[data-test-id="cf-ui-modal-content"]');
  }

  async cancelResumeCampaign(): Promise<void> {
    await this.page.locator('[data-test-id="cf-ui-modal-confirm-cancel-button"]').click();
    await expect(this.page.getByRole('heading', { name: 'Are you sure?' })).not.toBeVisible({ timeout: 5000 });
  }

  /**
   * expectedStatus defaults to "Scheduled" (resuming a campaign paused while
   * Scheduled, start date still in the future) but a campaign paused while
   * Live correctly resumes back to "Live" instead — confirmed live, pass
   * 'Live' explicitly for that case.
   */
  async confirmResumeCampaign(campaignName: string, expectedStatus: string = 'Scheduled'): Promise<void> {
    const row = this.frame.getByRole('row', { name: campaignName });
    await this.page.locator('[data-test-id="cf-ui-modal-confirm-confirm-button"]').click();
    await expect(row.getByText(expectedStatus)).toBeVisible({ timeout: 10000 });
  }

  /**
   * Full cleanup sweep for a single campaign, any status — Stops first if
   * Live/Paused/Scheduled (Delete is disabled otherwise), then Deletes.
   * Quietly no-ops if the row isn't present.
   */
  async cleanupCampaignInResultsTable(campaignName: string): Promise<void> {
    const row = this.frame.getByRole('row', { name: campaignName });
    if (!(await row.isVisible({ timeout: 5000 }).catch(() => false))) {
      return;
    }
    const needsStop = await row.getByText(/^(Live|Paused|Scheduled)$/).isVisible().catch(() => false);
    if (needsStop) {
      await this.stopCampaignInResultsTable(campaignName);
    }
    await this.deleteCampaignInResultsTable(campaignName);
  }
}
