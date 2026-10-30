import { FrameLocator, Page, expect } from '@playwright/test';

/**
 * CopyPage — handles the Create campaign drawer that opens when "Copy Campaign"
 * is clicked on any campaign list page (Gradual Rollout, Eligibility, Personalization, etc.).
 *
 * Copy behaviour (from source):
 *   • id          : null       → always a new campaign
 *   • name        : preserved from original
 *   • campaignId  : pre-filled with campaign.control (control variant ID)
 *   • startDateTime / endDateTime : '' (cleared)
 *   • status      : 'Draft'
 *   • features    : copied with abTestId: null
 */
export class CopyPage {
  readonly frame: FrameLocator;

  constructor(private readonly page: Page) {
    this.frame = page.frameLocator('[data-test-id="cf-widget-renderer"]');
  }

  // ─── Drawer visibility ────────────────────────────────────────────────────────

  async assertCreateDrawerVisible(): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { name: 'Create campaign' })
    ).toBeVisible({ timeout: 10000 });
    console.log(`  "Create campaign" drawer opened (not "Update campaign") ✓`);
  }

  async assertNotUpdateDrawer(): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { name: 'Update campaign' })
    ).not.toBeVisible({ timeout: 3000 });
  }

  // ─── Field state — positive assertions ───────────────────────────────────────

  async assertNamePrefilled(): Promise<void> {
    const input = this.frame.getByRole('textbox', { name: 'Campaign name *' });
    await expect(input).toBeVisible({ timeout: 5000 });
    const value = await input.inputValue();
    expect(value.length, 'Campaign name should be pre-filled from the original').toBeGreaterThan(0);
  }

  async getNameValue(): Promise<string> {
    await this.frame.getByRole('textbox', { name: 'Campaign name *' }).waitFor({ state: 'visible', timeout: 5000 });
    return this.frame.getByRole('textbox', { name: 'Campaign name *' }).inputValue();
  }

  async assertStartDateEmpty(): Promise<void> {
    const input = this.frame.getByRole('textbox', { name: 'Campaign start date & time (' });
    await expect(input).toBeVisible({ timeout: 5000 });
    const value = await input.inputValue();
    expect(value, 'Start date should be empty after copy — user must set a new one').toBe('');
  }

  async assertEndDateNotSet(): Promise<void> {
    // Standard drawers hide the end date behind an unchecked checkbox after copy.
    const dialog   = this.frame.getByRole('dialog', { name: 'Create campaign' });
    const checkbox = dialog.getByRole('checkbox');
    if (await checkbox.isVisible({ timeout: 2000 }).catch(() => false)) {
      expect(
        await checkbox.isChecked(),
        'End date checkbox should be unchecked — end date is cleared after copy'
      ).toBe(false);
    }
  }

  async assertCampaignIdPrefilled(): Promise<void> {
    // GR copy sets campaignId to campaign.control — it should be pre-filled, not empty
    const input = this.frame.getByRole('textbox', { name: 'Campaign ID *' });
    await expect(input).toBeVisible({ timeout: 5000 });
    const value = await input.inputValue();
    expect(value.length, 'Campaign ID should be pre-filled with the control variant ID').toBeGreaterThan(0);
  }

  async assertCampaignIdEmpty(): Promise<void> {
    // Redirection (and some other types) do NOT pre-fill Campaign ID.
    // Personalization copy form may not expose a Campaign ID field at all —
    // in that case we skip the check rather than failing.
    const input = this.frame.getByRole('textbox', { name: 'Campaign ID *' });
    const visible = await input.isVisible({ timeout: 3000 }).catch(() => false);
    if (!visible) {
      console.log(`  Campaign ID field not present in this form — skip check`);
      return;
    }
    const value = await input.inputValue();
    expect(value, 'Campaign ID should be empty — user must provide a new one').toBe('');
  }

  async getCampaignIdValue(): Promise<string> {
    return this.frame.getByRole('textbox', { name: 'Campaign ID *' }).inputValue();
  }

  async assertActionButtonsVisible(): Promise<void> {
    // RSuite drawer uses data-testid on the button wrappers
    const saveActivate = this.frame.getByTestId('submit-save-active-drawer');
    const saveDraft    = this.frame.getByTestId('submit-save-draft-drawer');
    await expect(saveActivate).toBeVisible({ timeout: 5000 });
    await expect(saveDraft).toBeVisible({ timeout: 5000 });
  }

  // ─── Fill fields ──────────────────────────────────────────────────────────────

  async fillName(name: string): Promise<void> {
    const input = this.frame.getByRole('textbox', { name: 'Campaign name *' });
    await input.clear();
    await input.fill(name);
  }

  async fillStartDate(dateStr: string): Promise<void> {
    const input = this.frame.getByRole('textbox', { name: 'Campaign start date & time (' });
    await input.click();
    await input.press('ArrowRight');
    await input.fill(dateStr);
    // Click elsewhere to trigger blur-based validation
    await this.frame.getByRole('textbox', { name: 'Campaign name *' }).click();
  }

  async fillEndDate(dateStr: string): Promise<void> {
    const dialog   = this.frame.getByRole('dialog', { name: 'Create campaign' });
    const checkbox = dialog.getByRole('checkbox');
    if (await checkbox.isVisible({ timeout: 2000 }).catch(() => false)) {
      if (!await checkbox.isChecked()) await checkbox.check();
    }
    const input = this.frame.getByRole('textbox', { name: 'Set campaign end date & time' });
    // Guard: forms that don't expose end date (e.g. PE copy form) — fail fast, don't hang
    if (!await input.isVisible({ timeout: 5000 }).catch(() => false)) {
      throw new Error('fillEndDate: "Set campaign end date & time" field not found within 5 s');
    }
    // Use explicit timeout so a visible-but-not-interactable input fails fast instead of hanging
    await input.click({ timeout: 8000 });
    await input.press('ArrowRight');
    await input.fill(dateStr, { timeout: 8000 });
    await this.frame.getByRole('textbox', { name: 'Campaign name *' }).click();
  }

  // Returns true when the Campaign ID was filled, false when the field is absent
  // (some form variants — e.g. Redirection V1 — do not expose a Campaign ID input).
  // Callers that need the fill to succeed (format/duplicate tests) should assert the
  // return value.  Callers that use Campaign ID only as a secondary step (draft-save,
  // date-validation tests) can safely ignore it.
  async clearAndFillCampaignId(id: string): Promise<boolean> {
    const inputExact   = this.frame.getByRole('textbox', { name: 'Campaign ID *' });
    const inputRelaxed = this.frame.getByRole('textbox', { name: 'Campaign ID', exact: false });
    // Try strict label first; fall back to relaxed (omits asterisk in some form variants)
    const strictVisible = await inputExact.isVisible({ timeout: 8000 }).catch(() => false);
    const input = strictVisible ? inputExact : inputRelaxed;
    if (!strictVisible && !await input.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log(`  Campaign ID field not present in this form — skipping ID fill`);
      return false;
    }
    await input.clear();
    await input.fill(id);
    await input.press('Tab');
    const validating = this.frame.getByText(/Validating/);
    try {
      await expect(validating).toBeVisible({ timeout: 1500 });
      await expect(validating).not.toBeVisible({ timeout: 8000 });
    } catch {
      // Validation settled too fast — fine.
    }
    return true;
  }

  // Returns true when the invalid ID was entered, false when the field is absent.
  async fillInvalidCampaignId(id: string): Promise<boolean> {
    const inputExact   = this.frame.getByRole('textbox', { name: 'Campaign ID *' });
    const inputRelaxed = this.frame.getByRole('textbox', { name: 'Campaign ID', exact: false });
    const strictVisible = await inputExact.isVisible({ timeout: 8000 }).catch(() => false);
    const input = strictVisible ? inputExact : inputRelaxed;
    if (!strictVisible && !await input.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log(`  Campaign ID field not present in this form — skipping ID fill`);
      return false;
    }
    await input.clear();
    await input.fill(id);
    // Click elsewhere to trigger inline format validation (no Tab — avoids async server check)
    await this.frame.getByRole('textbox', { name: 'Campaign name *' }).click();
    return true;
  }

  // ─── Action buttons ───────────────────────────────────────────────────────────

  async clickSaveActivate(): Promise<void> {
    await this.frame.getByTestId('submit-save-active-drawer').click({ timeout: 15000 });
  }

  async clickSaveDraft(): Promise<void> {
    await this.frame.getByTestId('submit-save-draft-drawer').click({ timeout: 15000 });
  }

  async closeDrawer(): Promise<void> {
    // RSuite drawer (GR create form) uses .rs-drawer-header-close
    const rsClose  = this.frame.locator('.rs-drawer-header-close');
    const stdClose = this.frame.getByTestId('onclose-basic-drawer');
    if (await rsClose.isVisible({ timeout: 2000 }).catch(() => false)) {
      await rsClose.click();
      return;
    }
    if (await stdClose.isVisible({ timeout: 2000 }).catch(() => false)) {
      await stdClose.click({ force: true });
      return;
    }
    await this.page.keyboard.press('Escape');
  }

  // ─── Success detection ────────────────────────────────────────────────────────

  async assertSaveSuccess(): Promise<void> {
    const rsClose = this.frame.locator('.rs-drawer-header-close');
    const heading = this.frame.getByRole('heading', { name: 'Create campaign' });
    const notify  = this.page.locator('.css-1pm4qpo').first();

    // Determine drawer type once upfront (1 s probe — no retry loop needed).
    // GR uses RSuite (.rs-drawer-header-close exists).
    // Eligibility / Redirection / Personalization use the standard Contentful drawer
    // (.rs-drawer-header-close is absent → `isVisible` returns false immediately,
    //  which previously caused an unintended early-return).
    const hasRsDrawer = await rsClose.isVisible({ timeout: 1000 }).catch(() => false);

    const startMs = Date.now();
    while (Date.now() - startMs < 15000) {
      if (hasRsDrawer) {
        if (!await rsClose.isVisible().catch(() => true)) return;
      } else {
        if (!await heading.isVisible().catch(() => false)) return;
        if (await notify.isVisible().catch(() => false)) return;
      }
      await this.page.waitForTimeout(200);
    }
    throw new Error('assertSaveSuccess: no success signal detected within 15 s');
  }

  async dismissNotifications(): Promise<void> {
    const notifications = this.page.locator('[data-test-id="cf-ui-notification"]');
    const count = await notifications.count();
    for (let i = count - 1; i >= 0; i--) {
      if (await notifications.nth(i).isVisible().catch(() => false)) {
        await notifications.nth(i).click().catch(() => {});
      }
    }
    await this.page.locator('.css-1pm4qpo')
      .waitFor({ state: 'hidden', timeout: 3000 })
      .catch(() => {});
  }

  // ─── Validation error assertions — negative scenarios ────────────────────────

  async assertStartDateRequiredError(): Promise<void> {
    await expect(
      this.frame.getByText('Please select campaign start')
    ).toBeVisible({ timeout: 5000 });
  }

  async assertStartDatePastError(): Promise<void> {
    await expect(
      this.frame.getByText(/Campaign start date.*should be greater than current date/i)
    ).toBeVisible({ timeout: 5000 });
  }

  async assertEndDateBeforeStartError(): Promise<void> {
    // Most forms show an inline constraint message.
    // GR may surface it as a page-level notification.
    const frameConstraint = this.frame.getByText(/Campaign end date.*should be greater than campaign start date/i);
    const pageConstraint  = this.page.getByText(/Campaign end date.*should be greater than campaign start date/i);
    // EL form: clears the invalid end date on submit and surfaces a required-style error
    // instead of an explicit constraint message — both indicate the same validation fired.
    const frameCleared    = this.frame.getByText(/Please select campaign end date/i);
    await expect(frameConstraint.or(pageConstraint).or(frameCleared)).toBeVisible({ timeout: 10000 });
  }

  async assertCampaignIdFormatError(): Promise<void> {
    await expect(
      this.frame.getByText(/Campaign ID can only contain/i)
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
    // rejection only surfaces when the campaign is saved, as a Contentful
    // notification on the host page (outside the widget iframe):
    //   "Save Failed Campaign Already Exists id = <id>"
    const note = this.page
      .locator('[data-test-id="cf-ui-paragraph"]')
      .filter({ hasText: /Campaign Already Exists/i })
      .first();
    await expect(note).toBeVisible({ timeout: 15000 });
    return (await note.textContent())?.trim() ?? '';
  }

  async assertNameRequiredError(): Promise<void> {
    await expect(
      this.frame.getByText('Please enter campaign name')
    ).toBeVisible({ timeout: 5000 });
  }

  async assertChannelRequiredError(): Promise<void> {
    await expect(
      this.frame.getByText('Please select at least one')
    ).toBeVisible({ timeout: 5000 });
  }

  async assertCampaignIdRequiredError(): Promise<void> {
    await expect(
      this.frame.getByText(/Please enter campaign ID/i)
    ).toBeVisible({ timeout: 5000 });
  }
}
