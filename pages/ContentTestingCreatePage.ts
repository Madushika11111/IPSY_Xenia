import { Page, FrameLocator, Locator, expect } from '@playwright/test';

/**
 * ContentTestingCreatePage
 *
 * Content Testing is ENTRY-SCOPED. Unlike GR (and every other campaign type),
 * the creation flow does not live on a Xenia app page — it lives inside a
 * Contentful entry's editor, in the "Xenia" app-iframe field. That field still
 * renders via the same [data-test-id="cf-widget-renderer"] iframe, so the
 * constructor pattern matches the other page objects.
 *
 * Two DOM contexts are in play:
 *   - this.page   -> Contentful NATIVE UI (entry list, entry editor chrome,
 *                    the "Add existing entry" reference picker, native toasts)
 *   - this.frame  -> the Xenia field iframe (radio toggle + 3-tab wizard)
 *
 * Divergences from GradualRolloutCreatePage — verified live against the real
 * app. Do NOT "fix" these to match GR:
 *   - fillStartDate uses a native <input type="datetime-local">, NOT GR's
 *     click→ArrowRight→fill calendar widget.
 *   - Variant traffic lives in Contentful article cards (cf-ui-text-input),
 *     NOT GR's div-filter + getByPlaceholder('Traffic percentage').
 *   - No Campaign ID field on the General tab (CT has none).
 *   - assertSaveSuccess cannot reuse GR's drawer-close poll — CT has no drawer.
 *     Its confirmed success signal is the Draft row in the entry-scoped Results
 *     table (see method note).
 *   - The "Add existing entry" reference picker renders in the TOP PAGE
 *     (this.page), not inside the widget iframe.
 *   - Variant article cards render BEFORE the Control card in DOM order —
 *     Control must be located by filtering on its "Control" label, never by
 *     positional index.
 */
export class ContentTestingCreatePage {
  private readonly frame: FrameLocator;

  constructor(private readonly page: Page) {
    this.frame = page.frameLocator('[data-test-id="cf-widget-renderer"]');
  }

  // ─── Entry navigation (Contentful native — MAIN page, not the widget iframe) ──

  /**
   * Opens a content entry by name via Contentful's native Content list.
   * CT campaigns are entry-scoped, so there is no dedicated Xenia URL to
   * deep-link to. Assumes the fixture entry exists (spec beforeAll prechecks it).
   */
  async openEntryByName(name: string): Promise<void> {
    await this.page.getByRole('link', { name: 'Content', exact: true }).click();
    await this.page.getByRole('textbox', { name: 'Type to search for entries' }).fill(name);
    await this.page.keyboard.press('Enter');
    await this.page.getByRole('link', { name, exact: true }).first().click();
    // Xenia field renders inside the entry editor once the entry opens. This wait
    // has flaked at 15s under a full-suite run (repeated space/entry navigation
    // in sequence appears to slow the app's cold boot) — 30s gives real headroom
    // without masking a genuine failure, since every successful load observed
    // has settled well under 10s.
    await expect(this.frame.getByRole('radio', { name: 'Content Testing' }))
      .toBeVisible({ timeout: 30000 });
  }

  // ─── Widget toggle ─────────────────────────────────────────────────────────

  async switchToContentTestingTab(): Promise<void> {
    await this.frame.getByRole('radio', { name: 'Content Testing' }).click();
    await this.assertCampaignsTableVisible();
  }

  async assertCampaignsTableVisible(): Promise<void> {
    await expect(this.frame.getByRole('button', { name: '+ Campaign' }))
      .toBeVisible({ timeout: 10000 });
  }

  /** Closes the wizard without saving — returns to the campaigns table. */
  async closeWizard(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Close' }).click();
    await this.assertCampaignsTableVisible();
  }

  // ─── Wizard — General tab ──────────────────────────────────────────────────

  async clickAddCampaign(): Promise<void> {
    // The Content Testing results table finishes an async fetch shortly after the
    // radio toggle switches, which can re-render mid-click and swallow the first
    // click on "+ Campaign". Retry once before failing.
    const generalTab = this.frame.getByRole('tab', { name: 'General' });
    await this.frame.getByRole('button', { name: '+ Campaign' }).click();
    try {
      await expect(generalTab).toBeVisible({ timeout: 5000 });
    } catch {
      await this.frame.getByRole('button', { name: '+ Campaign' }).click();
      await expect(generalTab).toBeVisible({ timeout: 10000 });
    }
  }

  /**
   * Confirmed live: plain .fill() silently no-ops on this field during EDIT
   * (value never changes, no error, no revert-after-render — it simply never
   * takes) even though the exact same .fill() call works fine on CREATE's
   * empty field. click + Ctrl+A + type() works in both contexts and is what
   * this uses universally, rather than branching create vs. edit.
   */
  async fillName(name: string): Promise<void> {
    const nameInput = this.frame.getByRole('textbox', { name: 'Campaign name *' });
    await nameInput.click();
    await nameInput.press('Control+A');
    await nameInput.type(name);
  }

  async fillDescription(text: string): Promise<void> {
    await this.frame.getByRole('textbox', { name: 'Campaign description (optional)' }).fill(text);
  }

  /** react-select — same open/pick pattern as GradualRolloutCreatePage.selectChannel. */
  async selectChannel(channelName: string): Promise<void> {
    await this.frame.locator('.select__input-container').click();
    const option = this.frame.locator('.select__option', { hasText: channelName }).first();
    await option.waitFor({ state: 'visible', timeout: 5000 });
    await option.click();
  }

  /**
   * Native <input type="datetime-local"> — plain fill, no calendar-widget dance.
   * Reuse the spec's futureDateStr() helper for the value ('YYYY-MM-DDTHH:mm').
   *
   * Confirmed live: on a pre-populated field (i.e. during EDIT, not CREATE's
   * empty field) a bare .fill() silently does not take — the value stays
   * unchanged with no error — while .clear() immediately before .fill() does
   * work. Same underlying issue as fillName()'s edit-mode fix, applied here
   * with .clear() instead since a native datetime-local's segmented widget
   * doesn't respond to click+Ctrl+A+type the way a plain textbox does.
   */
  async fillStartDate(datetimeLocal: string): Promise<void> {
    const input = this.frame.locator('input[type="datetime-local"]').first();
    await input.clear();
    await input.fill(datetimeLocal);
  }

  async clickNext(): Promise<void> {
    await this.frame.getByTestId('next').click();
  }

  /** Reveals the end date textbox — hidden until checked, same checkbox-gated pattern as GR. Confirmed live via a plain checkbox click. */
  async toggleEndDate(): Promise<void> {
    await this.frame.getByRole('checkbox').click();
  }

  /** Native <input type="datetime-local"> — same clear-then-fill pattern as fillStartDate. */
  async fillEndDate(datetimeLocal: string): Promise<void> {
    const input = this.frame.locator('input[type="datetime-local"]').nth(1);
    await input.clear();
    await input.fill(datetimeLocal);
  }

  // Validation getters (texts confirmed live). All render as an inline <paragraph>
  // directly under their field, inside the iframe — except startDateInvalidToast,
  // which is a page-level host toast (data-test-id="cf-ui-notification") that only
  // fires on a SECOND Next click while the start date is still empty (not the first).
  nameError(): Locator {
    return this.frame.getByText('Please enter campaign name');
  }
  startDateError(): Locator {
    return this.frame.getByText('Please select campaign start date & time');
  }
  /** Toasts persist and can accumulate across repeated Next clicks — scope to .last() like GR does for notifications. */
  startDateInvalidToast(): Locator {
    return this.page.getByText('Please select a valid campaign start date & time').last();
  }
  startDatePastError(): Locator {
    return this.frame.getByText('Campaign start date & time should be greater than current date & time');
  }
  endDateBeforeStartError(): Locator {
    return this.frame.getByText('Campaign end date & time should be greater than campaign start date & time');
  }

  // ─── Wizard — Variants tab ─────────────────────────────────────────────────

  /**
   * Opens Contentful's native "Add existing entry" reference picker.
   * Deliberately a SINGLE click with a generous wait, never a blind retry-click:
   * once the dialog is open, a second click at the same iframe-relative
   * coordinates can land on the dialog's own content instead (Playwright's
   * actionability check runs against the iframe's own document and doesn't see
   * the top-page dialog as an obstruction), silently mis-selecting whatever
   * entry row happens to sit at those screen coordinates.
   *
   * Confirmed live: the dialog reliably opens on a single click, but
   * getByRole('dialog', {name: 'Add existing entry'}) does not match it (its
   * accessible name doesn't resolve cleanly) and it's not wrapped in the
   * generic cf-ui-modal-content either. Verified via DOM inspection: the
   * stable container is [data-test-id="entity-selector-dialog"].
   */
  async clickChooseVariant(): Promise<void> {
    const dialog = this.page.locator('[data-test-id="entity-selector-dialog"]');
    await this.frame.getByRole('button', { name: 'Choose variant' }).click();
    await expect(dialog).toBeVisible({ timeout: 15000 });
  }

  /**
   * Selects a variant entry from the "Add existing entry" dialog.
   * Confirmed live: this native picker renders in the TOP page, not the
   * widget iframe. Types into the dialog's search box first to narrow the
   * list before clicking, since row buttons carry compound accessible names
   * ("<ContentType> <status> <EntryName>").
   */
  async selectVariantEntry(name: string): Promise<void> {
    const dialog = this.page.locator('[data-test-id="entity-selector-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await dialog.getByRole('textbox', { name: 'Type to search for entries' }).fill(name);
    await dialog.getByRole('button', { name }).first().click();
  }

  /**
   * Sets a variant's traffic. Selector confirmed live — Contentful article
   * card, traffic spinbutton (NOT GR's Traffic-percentage placeholder).
   * `variantLabel` is usually the variant entry name.
   *
   * Scoped to role=spinbutton specifically, not the raw cf-ui-text-input
   * testid: confirmed live that during EDIT (not CREATE) the same article
   * card also renders a second, readonly cf-ui-text-input holding the
   * linked entry's raw UUID, which made the bare testid selector ambiguous
   * (strict-mode violation) once the wizard was reopened for edit.
   */
  async setVariantTraffic(variantLabel: string, value: number): Promise<void> {
    const article = this.frame.getByRole('article').filter({ hasText: variantLabel });
    await article.getByRole('spinbutton').fill(String(value));
  }

  /**
   * Asserts Control traffic. Control is a DISABLED spinbutton that auto-balances
   * to 100 - variant (confirmed live). Variant article cards render BEFORE
   * Control in DOM order, so Control must be located by its "Control" label,
   * never by positional index.
   */
  async assertControlTraffic(expected: number): Promise<void> {
    const controlArticle = this.frame.getByRole('article').filter({ hasText: 'Control' });
    await expect(controlArticle.getByRole('spinbutton')).toHaveValue(String(expected));
  }

  /** Confirmed client-side rule: the source entry cannot be its own variant. */
  assertSameEntryRejectedToast(): Locator {
    return this.page.getByText('Variant already selected as a control');
  }

  // ─── Save + notifications ──────────────────────────────────────────────────

  saveDraftButton(): Locator {
    return this.frame.getByRole('button', { name: 'Save Campaign as Draft' });
  }

  async clickSaveDraft(): Promise<void> {
    await this.saveDraftButton().click();
  }

  /**
   * Only appears on the Variants tab (never on General, unlike Save as Draft
   * which appears on both). Confirmed with the user: the start date must have
   * already ELAPSED for the campaign to land on Live — a future start date
   * lands on Scheduled instead. Use the spec's nowDateStr() helper.
   */
  saveActivateButton(): Locator {
    return this.frame.getByRole('button', { name: 'Save & Activate Campaign' });
  }

  async clickSaveActivate(): Promise<void> {
    await this.saveActivateButton().click();
  }

  /** Matches GradualRolloutListPage.dismissNotifications — click the toast itself. */
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

  /**
   * "Did it actually save" signal. GR polls for its drawer to close — CT has NO
   * drawer, so that pattern does not apply. The confirmed CT success signal is
   * the new row landing in the entry-scoped Results table with the expected
   * status, so this takes the campaign name and polls that row (a deliberate
   * divergence from GR's no-arg assertSaveSuccess). Defaults to 'Draft' to
   * match the original happy-path caller; pass 'Live' after Save & Activate.
   */
  async assertSaveSuccess(campaignName: string, status: string = 'Draft'): Promise<void> {
    const row = this.frame.getByRole('row', { name: campaignName });
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row.getByText(status)).toBeVisible();
  }

  // ─── Wizard — Edit (entry-scoped Results table only) ──────────────────────
  //
  // Confirmed live: "Edit Campaign" in the entry-scoped Results table reopens
  // this SAME 3-tab wizard, pre-populated. The global /ab-testing list page's
  // "Edit Campaign" is a different, unrelated flow (opens a Contentful native
  // "Editor overlay" on the campaign's source entry with Personalization
  // pre-selected) — do not use it for edit tests.
  //
  // Field-lock rules by status (all confirmed live):
  //   Draft:     everything editable. Buttons: General has Save-as-Draft+Next;
  //              Variants has Save-as-Draft+Save-&-Activate.
  //   Scheduled: everything editable (including start date). Buttons: General
  //              has only Cancel+Next (no Save-as-Draft); Variants has only
  //              "Update Campaign" (no Save-as-Draft/Activate split).
  //   Live:      start date disabled (with lock message) + channels disabled
  //              (confirmed via raw HTML: select--is-disabled on the whole
  //              multi-select, not just individually-disabled chips). Add/
  //              change/remove-variant controls (the variant "Actions" menu,
  //              "Choose variant", "Create variant") are entirely ABSENT, not
  //              merely disabled. Existing-variant traffic remains editable.
  //              Save buttons: same as Scheduled ("Update Campaign" only).
  //              GRACE WINDOW (confirmed by the user): the start date is NOT
  //              locked immediately at activation — it stays editable until
  //              a full minute past the start time has elapsed (e.g. start
  //              9:14 PM -> still editable up to 9:15 PM). Tests asserting
  //              the start-date lock must use a start time more than a
  //              minute in the past (see minutesAgoDateStr() in the spec),
  //              not nowDateStr() or a start time just barely elapsed.

  /**
   * Opens the edit wizard for a campaign row in the entry-scoped Results
   * table. Retries once on a swallowed first click, mirroring
   * clickAddCampaign()'s documented async-rerender race (confirmed live: the
   * first Edit Campaign click can be dropped the same way).
   */
  async clickEditCampaignInResultsTable(campaignName: string): Promise<void> {
    const row = this.frame.getByRole('row', { name: campaignName });
    const generalTab = this.frame.getByRole('tab', { name: 'General' });
    await row.getByRole('button', { name: 'Edit Campaign' }).click();
    try {
      await expect(generalTab).toBeVisible({ timeout: 5000 });
    } catch {
      await row.getByRole('button', { name: 'Edit Campaign' }).click();
      await expect(generalTab).toBeVisible({ timeout: 10000 });
    }
  }

  /**
   * Reads every editable field across both tabs, for pre-population and
   * persistence checks. Assumes the wizard is currently open on the General
   * tab (true immediately after clickEditCampaignInResultsTable). Side
   * effect: advances the wizard to the Variants tab via Next in order to read
   * per-variant traffic — the wizard is left on Variants tab when this
   * returns, matching where a caller would need to be next anyway to assert
   * variant-specific field states.
   */
  async getWizardFields(): Promise<{
    name: string;
    description: string;
    channels: string[];
    startDate: string;
    endDate: string | null;
    variantTraffic: Record<string, string>;
  }> {
    const name = await this.frame.getByRole('textbox', { name: 'Campaign name *' }).inputValue();
    const description = await this.frame.getByRole('textbox', { name: 'Campaign description (optional)' }).inputValue();
    const channels = (await this.frame.locator('.select__multi-value__label').allTextContents())
      .map(t => t.trim()).filter(Boolean);
    const startDate = await this.frame.locator('input[type="datetime-local"]').first().inputValue();
    const hasEndDate = await this.frame.getByRole('checkbox').isChecked();
    const endDate = hasEndDate
      ? await this.frame.locator('input[type="datetime-local"]').nth(1).inputValue()
      : null;

    await this.clickNext();

    // Variant/Control card headings render as a "-" placeholder for a moment
    // after the Variants tab mounts (confirmed live — the linked entry's
    // display name loads async) before resolving to the real entry name.
    // Reading immediately after clickNext() races that load; wait for the
    // first card to resolve before reading any of them.
    await expect(this.frame.getByRole('article').first().getByRole('heading'))
      .not.toHaveText('-', { timeout: 10000 });

    const articles = this.frame.getByRole('article');
    const count = await articles.count();
    const variantTraffic: Record<string, string> = {};
    for (let i = 0; i < count; i++) {
      const headingText = (await articles.nth(i).getByRole('heading').textContent())?.trim() ?? `variant_${i}`;
      const traffic = await articles.nth(i).getByRole('spinbutton').inputValue();
      variantTraffic[headingText] = traffic;
    }

    return { name, description, channels, startDate, endDate, variantTraffic };
  }

  /** Live only — confirmed exact inline message. */
  startDateLockMessage(): Locator {
    return this.frame.getByText('This campaign is currently running. You cannot edit the start date.');
  }

  /** Draft/Scheduled edit state check — the inverse of assertStartDateDisabled. */
  startDateInput(): Locator {
    return this.frame.locator('input[type="datetime-local"]').first();
  }

  async assertStartDateDisabled(): Promise<void> {
    await expect(this.startDateInput()).toBeDisabled();
  }

  async assertStartDateLockMessage(): Promise<void> {
    await expect(this.startDateLockMessage()).toBeVisible();
  }

  /**
   * Confirmed live via raw HTML inspection: the whole channels multi-select
   * carries `select--is-disabled` / `select__control--is-disabled` classes for
   * Live — not just individually-disabled remove buttons on each chip.
   */
  /** Draft/Scheduled edit state check — the inverse of assertChannelsDisabled. */
  channelsSelect(): Locator {
    return this.frame.locator('.basic-multi-select');
  }

  async assertChannelsDisabled(): Promise<void> {
    await expect(this.channelsSelect()).toHaveClass(/select--is-disabled/);
  }

  /** Draft/Scheduled only — absent entirely for Live (see assertAddVariantControlsAbsent). */
  chooseVariantButton(): Locator {
    return this.frame.getByRole('button', { name: 'Choose variant' });
  }

  /** Live only — "Choose variant"/"Create variant" render at all for Draft/Scheduled; absent entirely for Live. */
  async assertAddVariantControlsAbsent(): Promise<void> {
    await expect(this.frame.getByRole('button', { name: 'Choose variant' })).toHaveCount(0);
    await expect(this.frame.getByRole('button', { name: 'Create variant' })).toHaveCount(0);
  }

  /** Draft/Scheduled only — present per-variant; entirely absent for Live (see assertVariantActionsMenuAbsent). */
  variantActionsButton(): Locator {
    return this.frame.getByRole('button', { name: 'Actions' }).first();
  }

  /** Live only — the per-variant "Actions" menu (Change/Remove/Edit variant) is entirely absent, not just disabled. */
  async assertVariantActionsMenuAbsent(): Promise<void> {
    await expect(this.frame.getByRole('button', { name: 'Actions' })).toHaveCount(0);
  }

  /** Returns to the General tab from Variants during an edit (no direct tab-click navigation — confirmed same restriction as create). */
  async clickBack(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Back' }).click();
    await expect(this.frame.getByRole('tab', { name: 'General' })).toBeVisible({ timeout: 5000 });
  }

  /**
   * Scheduled/Live edit's only save action (General tab shows Cancel+Next
   * only; this button lives on the Variants tab, replacing the Draft-only
   * Save-as-Draft/Save-&-Activate split). Status is preserved on save.
   */
  updateCampaignButton(): Locator {
    return this.frame.getByRole('button', { name: 'Update Campaign' });
  }

  async clickUpdateCampaign(): Promise<void> {
    await this.updateCampaignButton().click();
  }

  // ─── Delete (entry-scoped Results table only) ──────────────────────────────
  //
  // Confirmed live (2026-08-31): a pure-Draft CT campaign (never activated)
  // does NOT appear in the global /ab-testing list page's search results at
  // all ("No results." even though the row is plainly present in the
  // entry-scoped Results table) — so ContentTestingListPage's cleanup path
  // cannot reach it. Draft-only edit tests must clean up via this method
  // instead. Once a campaign has been through Save & Activate (Scheduled or
  // Live), it IS reachable via the global list page as usual (confirmed by
  // TC-CT-002/072/073/074/075's cleanup all succeeding there).
  //
  // The confirm dialog here renders on the TOP page, not inside the widget
  // iframe, and uses a different heading/button pattern than the global list
  // page's delete dialog: heading "Are you sure?", text 'Do you really want
  // to delete the campaign "<name>"? This process can't be undone.', buttons
  // "No"/"Yes!" (confirm button data-test-id="cf-ui-modal-confirm-confirm-button").

  /** Quietly no-ops if the row isn't present — mirrors cleanupCampaign()'s "already clean" exit. */
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
   * Full cleanup sweep for a single campaign, any status, entirely via the
   * entry-scoped Results table. Confirmed live: campaigns are NOT reliably
   * reachable via the global /ab-testing list page's search regardless of
   * status — a pure Draft returned "No results.", and a Scheduled campaign
   * (created via Save & Activate, never touched Live) also produced a false
   * "not found" there, leaving it orphaned. The entry-scoped table's Stop
   * uses the SAME page-level confirm dialog as Delete (confirmed live: "Are
   * you sure?" / "Do you really want to stop the campaign "<name>"? This
   * will deactivate the campaign." / "No"/"Yes!"), so this is a uniform,
   * reliable cleanup path for every status.
   */
  async cleanupCampaignInResultsTable(campaignName: string): Promise<void> {
    const row = this.frame.getByRole('row', { name: campaignName });
    if (!(await row.isVisible({ timeout: 5000 }).catch(() => false))) {
      return;
    }
    const needsStop = await row.getByText(/^(Live|Paused|Scheduled)$/).isVisible().catch(() => false);
    if (needsStop) {
      await row.getByRole('button', { name: 'Stop Campaign' }).click();
      await expect(this.page.getByRole('heading', { name: 'Are you sure?' })).toBeVisible({ timeout: 5000 });
      await this.page.locator('[data-test-id="cf-ui-modal-confirm-confirm-button"]').click();
      await expect(row.getByText('Expired')).toBeVisible({ timeout: 10000 });
    }
    await this.deleteCampaignInResultsTable(campaignName);
  }
}
