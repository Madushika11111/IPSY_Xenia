import { FrameLocator, Page, expect } from '@playwright/test';

export class GradualRolloutListPage {
  private readonly frame: FrameLocator;

  constructor(private readonly page: Page) {
    this.frame = page.frameLocator('[data-test-id="cf-widget-renderer"]');
  }

  // ─── Navigation ──────────────────────────────────────────────────────────────

  async navigate(): Promise<void> {
    await this.frame.getByRole('link', { name: 'Gradual rollout', exact: true }).click();
    await this.assertPageVisible();
    // Clear any leftover name search from the previous test so every test starts
    // with a clean search state (status = All statuses, date = Today, name = empty).
    const resetBtn = this.frame.getByRole('button', { name: 'Reset' });
    if (await resetBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await resetBtn.click();
    }
  }

  async assertPageVisible(): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { name: 'Gradual rollout campaigns' })
    ).toBeVisible({ timeout: 10000 });
  }

  // ─── List page assertions ────────────────────────────────────────────────────

  async getTotalCampaignCount(): Promise<number> {
    const el = this.frame.getByText(/\d+ Campaigns/).first();
    await expect(el).toBeVisible({ timeout: 10000 });
    const text = await el.textContent() ?? '';
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  async assertDefaultFilters(): Promise<void> {
    const statusFilter = this.frame.getByRole('button', { name: 'All statuses' });
    await expect(statusFilter).toBeVisible();
    console.log(`  Status filter (default): All statuses`);
    const dateFilter = this.frame.getByRole('combobox').filter({ hasText: 'Today' });
    await expect(dateFilter).toBeVisible();
    const dateText = (await dateFilter.textContent() ?? '?').trim();
    console.log(`  Date filter (default)  : ${dateText}`);
  }

  async getResultsCount(): Promise<number> {
    const el = this.frame.getByRole('heading', { name: /Results \(/ });
    await expect(el).toBeVisible({ timeout: 10000 });
    const text = await el.textContent() ?? '';
    const match = text.match(/\((\d+)\)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  // Polls Results(N) until two consecutive reads 1 s apart return the same value,
  // guarding against stale DOM counts while a filter API call is in-flight.
  async getStableResultsCount(): Promise<number> {
    let lastCount = -1;
    await expect.poll(
      async () => {
        const el = this.frame.getByRole('heading', { name: /Results \(/ });
        await expect(el).toBeVisible({ timeout: 5000 });
        const text = await el.textContent() ?? '';
        const match = text.match(/\((\d+)\)/);
        const current = match ? parseInt(match[1], 10) : -1;
        if (current === lastCount && current >= 0) return true;
        lastCount = current;
        return false;
      },
      { timeout: 20000, intervals: [1000] }
    ).toBe(true);
    return lastCount;
  }

  async assertSearchButtons(): Promise<void> {
    await expect(this.frame.getByRole('button', { name: 'Search' })).toBeVisible();
    await expect(this.frame.getByRole('button', { name: 'Reset' })).toBeVisible();
  }

  async assertFilterLabels(): Promise<void> {
    await expect(this.frame.getByText('Search by name')).toBeVisible();
    await expect(this.frame.locator('label').filter({ hasText: 'Status' })).toBeVisible();
    await expect(this.frame.getByText('Date', { exact: true })).toBeVisible();
  }

  async assertStatusFilterOptions(): Promise<void> {
    await this.frame.getByRole('button', { name: /All statuses|Live|Scheduled|Paused|Draft|Expired|Stopped/ }).first().click();
    for (const option of ['Live', 'Scheduled', 'Paused', 'Draft', 'Expired']) {
      await expect(
        this.frame.locator('div').filter({ hasText: new RegExp(`^${option}$`) }).first()
      ).toBeVisible({ timeout: 5000 });
    }
    // Close the dropdown by clicking the button again
    await this.frame.getByRole('button', { name: /All statuses|Live|Scheduled|Paused|Draft|Expired|Stopped/ }).first().click();
  }

  async assertDateFilterOptions(): Promise<void> {
    // Use .first() to target the date filter combobox — the second combobox is the
    // pagination size selector (shows a number like "10") and must be excluded.
    await this.frame.getByRole('combobox').first().click();
    for (const option of ['All days', 'Today', 'Yesterday', 'Last 7 days', 'Last 28 days', 'Custom']) {
      await expect(
        this.frame.getByRole('option', { name: option })
      ).toBeVisible({ timeout: 5000 });
    }
    await this.page.keyboard.press('Escape');
  }

  async filterByDate(option: string): Promise<void> {
    await this.frame.getByRole('combobox').first().click();
    await this.frame.getByRole('option', { name: option }).click();
  }

  async resetFilters(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Reset' }).click();
  }

  async assertRowCountVisible(): Promise<void> {
    await expect(
      this.frame.getByText(/Showing \d+/)
    ).toBeVisible({ timeout: 10000 });
  }

  async assertDateCellsVisible(): Promise<void> {
    await expect(
      this.frame.getByText(/\d{4}-\d{2}-\d{2}/).first()
    ).toBeVisible({ timeout: 5000 });
  }

  async assertStatusNotInResults(status: string): Promise<void> {
    await expect(
      this.frame.getByRole('cell', { name: status, exact: true }).first()
    ).not.toBeVisible({ timeout: 5000 });
  }

  async assertTodayDateInResults(): Promise<void> {
    // The "Today" filter returns campaigns ACTIVE today — no row is required to
    // display today's literal date (a Live campaign started last week is a
    // valid match). Assert the filter's real invariant on the visible rows:
    // start date on/before today, end date "N/A" or on/after today.
    const d     = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const rows = this.frame.locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10000 });
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    for (let i = 0; i < rowCount; i++) {
      const cells = await rows.nth(i).getByRole('cell').allTextContents();
      // Columns: [checkbox, Name, Start date, End date, Channels, Status, Actions]
      const start = (cells[2] ?? '').slice(0, 10);
      const end   = (cells[3] ?? '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(start)) {
        expect(start <= today, `row ${i + 1}: start ${start} must be on/before today ${today}`).toBeTruthy();
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(end)) {
        expect(end >= today, `row ${i + 1}: end ${end} must be on/after today ${today}`).toBeTruthy();
      }
    }
    console.log(`  All ${rowCount} visible rows are active today (start ≤ ${today} ≤ end/N/A) ✓`);
  }

  async filterByMultipleStatuses(statuses: string[]): Promise<void> {
    // Open the current status filter button ONCE — the dropdown stays open between
    // multi-select clicks (confirmed by codegen: Paused+Scheduled pattern), so
    // all desired statuses are clicked in a single open session.
    for (const s of ['All statuses', 'Live', 'Scheduled', 'Active', 'Paused', 'Expired', 'Draft', 'Stopped']) {
      const btn = this.frame.getByRole('button', { name: s });
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        break;
      }
    }
    // Wait for the dropdown to be fully open before clicking
    await this.frame.locator('div').filter({ hasText: new RegExp(`^${statuses[0]}$`) }).first()
      .waitFor({ state: 'visible', timeout: 5000 });
    // Click each status — dropdown stays open between clicks
    for (const status of statuses) {
      await this.frame.locator('div').filter({ hasText: new RegExp(`^${status}$`) }).first().click();
    }
    // Dropdown stays open; it will close when Search is clicked
  }

  async assertSearchNameEmpty(): Promise<void> {
    await expect(
      this.frame.getByRole('textbox', { name: 'Enter campaign name' })
    ).toHaveValue('', { timeout: 5000 });
  }

  async assertDateFilterValue(value: string | RegExp): Promise<void> {
    // Date filter options are text (Today, All days…) so filter({ hasText }) does not
    // accidentally match the pagination combobox (which shows numbers like "10").
    await expect(
      this.frame.getByRole('combobox').filter({ hasText: value })
    ).toBeVisible({ timeout: 5000 });
  }

  async filterByCustomDateRange(
    prevMonthClicks: number,
    startPattern: string | RegExp,
    endPattern: string | RegExp,
    monthName?: string,
  ): Promise<void> {
    await this.frame.getByRole('combobox').first().click();
    await this.frame.getByRole('option', { name: 'Custom' }).click();
    for (let i = 0; i < prevMonthClicks; i++) {
      await this.frame.getByRole('button', { name: 'Go to the Previous Month' }).click();
    }
    // The calendar shows two month grids side by side, and a date near a month
    // boundary appears in BOTH (e.g. June 28 renders in the June grid and as a
    // leading cell of the July grid) — scope clicks to the named month's grid.
    const scope = monthName
      ? this.frame.getByRole('grid', { name: monthName })
      : this.frame;
    // Calendar renders start-date cells as gridcell, end-date cells as button after start is picked
    await scope.getByRole('gridcell', { name: startPattern }).click();
    await scope.getByRole('button', { name: endPattern }).click();
    await this.frame.getByRole('button', { name: 'Done' }).click();
  }

  // ─── Create button ───────────────────────────────────────────────────────────

  async clickCreateButton(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Campaigns' }).nth(1).click();
  }

  // ─── Search ──────────────────────────────────────────────────────────────────

  async searchByName(name: string): Promise<void> {
    await this.frame.getByRole('textbox', { name: 'Enter campaign name' }).fill(name);
    await this.frame.getByRole('button', { name: 'Search' }).click();
  }

  async assertNoResults(): Promise<void> {
    await expect(
      this.frame.getByRole('cell', { name: 'No results.' })
    ).toBeVisible({ timeout: 10000 });
  }

  async applyAllFilters(): Promise<void> {
    // Status filter is already "All statuses" by default (button, not combobox)
    // Only change the date filter from "Today" → "All days"
    const dateFilter = this.frame.getByRole('combobox').filter({ hasText: 'Today' });
    if (await dateFilter.isVisible()) {
      await dateFilter.click();
      await this.frame.getByRole('option', { name: 'All days' }).click();
    }
    await this.frame.getByRole('button', { name: 'Search' }).click();
  }

  async logCampaignActions(status: string): Promise<void> {
    const actions = [
      'View Details',
      'Edit Campaign',
      'Copy Campaign',
      'Pause Campaign',
      'Resume Campaign',
      'Stop Campaign',
      'Share Campaign',
      'Delete Campaign',
    ];
    console.log(`\n  ── ${status} Campaign — Available Actions ──────────`);
    for (const name of actions) {
      const btn = this.frame.getByRole('button', { name }).first();
      const visible = await btn.isVisible();
      const disabled = visible ? await btn.isDisabled() : false;
      const state = !visible ? 'not available' : disabled ? 'disabled   ✗' : 'enabled    ✓';
      console.log(`  ${name.padEnd(22)} : ${state}`);
    }
    console.log(`  ───────────────────────────────────────────────────`);
  }

  // ─── Campaign row assertions ─────────────────────────────────────────────────

  async assertCampaignVisible(name: string): Promise<void> {
    // .first(): the environment can contain several campaigns with the same
    // name (e.g. leftovers from repeated edit-test runs) — asserting at least
    // one matching row avoids strict-mode violations on duplicates
    await expect(
      this.frame.getByRole('cell', { name, exact: true }).first()
    ).toBeVisible({ timeout: 10000 });
  }

  // Retries searchByName every 2 s until the campaign cell appears (up to 30 s).
  // Use this instead of searchByName + assertCampaignVisible when backend search-index
  // latency may delay results (e.g. immediately after saving a new campaign).
  async searchAndAssertVisible(name: string): Promise<void> {
    await expect.poll(
      async () => {
        await this.searchByName(name);
        return this.frame.getByRole('cell', { name, exact: true }).first().isVisible();
      },
      { timeout: 30000, intervals: [2000] }
    ).toBeTruthy();
  }

  async assertCampaignStatus(status: string): Promise<void> {
    await expect(
      this.frame.getByText(status).first()
    ).toBeVisible({ timeout: 10000 });
  }

  async assertScheduledCampaignActions(): Promise<void> {
    await expect(this.frame.getByRole('button', { name: 'View Details' }).first()).toBeVisible();
    await expect(this.frame.getByRole('button', { name: 'Edit Campaign' }).first()).toBeVisible();
    await expect(this.frame.getByRole('button', { name: 'Stop Campaign' }).first()).toBeVisible();
  }

  async assertAllScheduledActionIcons(): Promise<void> {
    await expect(this.frame.getByRole('button', { name: 'View Details' }).first()).toBeVisible();
    await expect(this.frame.getByRole('button', { name: 'Edit Campaign' }).first()).toBeVisible();
    await expect(this.frame.getByRole('button', { name: 'Copy Campaign' }).first()).toBeVisible();
    await expect(this.frame.getByRole('button', { name: 'Pause Campaign' }).first()).toBeVisible();
    await expect(this.frame.getByRole('button', { name: 'Stop Campaign' }).first()).toBeVisible();
    // Delete is disabled (not enabled) for Scheduled campaigns
    await expect(this.frame.getByRole('button', { name: 'Delete Campaign' }).first()).toBeDisabled();
  }

  async assertShareNotVisible(): Promise<void> {
    // Share Campaign uses Tailwind group-hover:opacity — the button is in the DOM at
    // all times but has opacity:0 at rest.  Playwright's isVisible() ignores CSS opacity,
    // so we assert the computed style directly.
    const share = this.frame.getByRole('button', { name: 'Share Campaign' }).first();
    await expect(share).toHaveCSS('opacity', '0');
  }

  async hoverCampaignRow(name: string): Promise<void> {
    // Hover over the table row to trigger the CSS group-hover that reveals Share Campaign.
    await this.frame.getByRole('row').filter({ hasText: name }).first().hover();
  }

  async assertShareVisible(): Promise<void> {
    // After row hover the group-hover:opacity-100 class kicks in — assert opacity:1.
    const share = this.frame.getByRole('button', { name: 'Share Campaign' }).first();
    await expect(share).toHaveCSS('opacity', '1', { timeout: 3000 });
  }

  async assertPausedCampaignActions(): Promise<void> {
    await expect(this.frame.getByRole('button', { name: 'View Details' }).first()).toBeVisible();
    await expect(this.frame.getByRole('button', { name: 'Edit Campaign' }).first()).toBeVisible();
    await expect(this.frame.getByRole('button', { name: 'Resume Campaign' })).toBeVisible();
    await expect(this.frame.getByRole('button', { name: 'Stop Campaign' }).first()).toBeVisible();
  }

  async assertPauseCampaignButtonVisible(): Promise<void> {
    await expect(this.frame.getByRole('button', { name: 'Pause Campaign' }).first()).toBeVisible({ timeout: 5000 });
  }

  async assertResumeCampaignButtonAbsent(): Promise<void> {
    await expect(this.frame.getByRole('button', { name: 'Resume Campaign' })).not.toBeVisible({ timeout: 5000 });
  }

  async assertExpiredCampaignActions(): Promise<void> {
    await expect(this.frame.getByRole('button', { name: 'View Details' }).first()).toBeVisible();
    await expect(this.frame.getByRole('button', { name: 'Edit Campaign' }).first()).toBeVisible();
    await expect(this.frame.getByRole('button', { name: 'Copy Campaign' }).first()).toBeVisible();
    await expect(this.frame.getByRole('button', { name: 'Delete Campaign' }).first()).toBeEnabled();
    // Pause and Stop are rendered but disabled for Expired campaigns
    await expect(this.frame.getByRole('button', { name: 'Pause Campaign' }).first()).toBeDisabled();
    await expect(this.frame.getByRole('button', { name: 'Stop Campaign' }).first()).toBeDisabled();
  }

  async assertDeleteCampaignButtonEnabled(): Promise<void> {
    await expect(this.frame.getByRole('button', { name: 'Delete Campaign' }).first()).toBeEnabled({ timeout: 5000 });
  }

  // ─── View Details ────────────────────────────────────────────────────────────

  async clickViewDetails(): Promise<void> {
    await this.frame.getByRole('button', { name: 'View Details' }).first().click();
  }

  async assertDetailsStatus(status: string): Promise<void> {
    await expect(
      this.frame.locator('[data-test-id="cf-ui-subheading"]').getByText(status)
    ).toBeVisible({ timeout: 10000 });
  }

  async assertDetailsCampaignId(campaignId: string): Promise<void> {
    await expect(
      this.frame.getByText(`Campaign ID${campaignId}`)
    ).toBeVisible({ timeout: 10000 });
  }

  async assertDetailsCampaignName(campaignName: string): Promise<void> {
    await expect(
      this.frame.locator('[data-test-id="cf-ui-subheading"]').getByText(campaignName)
    ).toBeVisible({ timeout: 5000 });
  }

  async clickBackFromDetails(): Promise<void> {
    await this.frame.locator('[data-test-id="cf-ui-button"]').click();
  }

  async assertDetailsModalVisible(): Promise<void> {
    await expect(
      this.frame.locator('[data-test-id="cf-ui-modal-content"]')
    ).toBeVisible({ timeout: 10000 });
  }

  async assertDetailsModalHeaderVisible(): Promise<void> {
    await expect(
      this.frame.locator('[data-test-id="cf-ui-modal-header"]')
    ).toBeVisible({ timeout: 5000 });
  }

  async assertDetailsCampaignIdHeading(): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { name: 'Campaign ID' })
    ).toBeVisible({ timeout: 5000 });
  }

  async assertDetailsStartDate(dateStr: string): Promise<void> {
    await expect(
      this.frame.getByText(`Campaign start date & time (PST)${dateStr}`)
    ).toBeVisible({ timeout: 5000 });
  }

  async assertDetailsEndDate(dateStr: string): Promise<void> {
    await expect(
      this.frame.getByText(`Campaign end date & time (PST)${dateStr}`)
    ).toBeVisible({ timeout: 5000 });
  }

  async assertDetailsChannel(channel: string): Promise<void> {
    await expect(
      this.frame.getByText(`Channel${channel}`)
    ).toBeVisible({ timeout: 5000 });
  }

  async assertDetailsDescriptionEmpty(): Promise<void> {
    await expect(this.frame.getByText('Description-')).toBeVisible({ timeout: 5000 });
  }

  async assertDetailsVariants(): Promise<void> {
    await expect(this.frame.getByText('Control%')).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByText('Variant 1%')).toBeVisible();
  }

  async assertDetailsSubheadingVisible(): Promise<void> {
    await expect(
      this.frame.locator('[data-test-id="cf-ui-subheading"]').first()
    ).toBeVisible({ timeout: 5000 });
  }

  async assertDetailsChannelHeading(): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { name: 'Channel' })
    ).toBeVisible({ timeout: 5000 });
  }

  async assertDetailsTrafficSplitsVisible(): Promise<void> {
    // Control% is always present when a campaign has a feature with variants
    await expect(this.frame.getByText('Control%')).toBeVisible({ timeout: 5000 });
  }

  async getCampaignIdFromDetails(): Promise<string> {
    // The View Details modal renders flat text: "...Campaign ID<value>Description..."
    // Parse it the same way logViewDetails() does to extract the value between the two labels.
    const modal = this.frame.locator('[data-test-id="cf-ui-modal-content"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
    const raw        = ((await modal.textContent()) ?? '').replace(/\s+/g, ' ').trim();
    const labelStart = raw.indexOf('Campaign ID');
    if (labelStart === -1) return '';
    const valueStart = labelStart + 'Campaign ID'.length;
    const nextStart  = raw.indexOf('Description', valueStart);
    return raw.slice(valueStart, nextStart === -1 ? undefined : nextStart).trim();
  }

  async closeDetailsModal(): Promise<void> {
    try {
      await this.frame.getByRole('button').filter({ hasText: '×' }).first().click({ timeout: 3000 });
    } catch {
      await this.page.keyboard.press('Escape');
    }
    await expect(
      this.frame.locator('[data-test-id="cf-ui-modal-content"]')
    ).not.toBeVisible({ timeout: 5000 });
  }

  async logViewDetails(): Promise<void> {
    const modal = this.frame.locator('[data-test-id="cf-ui-modal-content"]');

    // Collapse whitespace so label-boundary slicing works on a single flat string.
    const raw = ((await modal.textContent()) ?? '').replace(/\s+/g, ' ').trim();

    // Slice the value that sits between two known label strings.
    const extract = (label: string, nextLabel?: string): string => {
      const start = raw.indexOf(label);
      if (start === -1) return '?';
      const vs = start + label.length;
      const end = nextLabel ? raw.indexOf(nextLabel, vs) : raw.length;
      return raw.slice(vs, end === -1 ? undefined : end).trim() || '-';
    };

    // The subheading appends the status badge AFTER the name (e.g. "Live_3Live").
    // Strip the status suffix rather than the first occurrence so names containing
    // a status word (e.g. "Live_3") are extracted correctly.
    const subText = ((await this.frame.locator('[data-test-id="cf-ui-subheading"]').first().textContent()) ?? '').trim();
    const statusSuffixes = ['Scheduled', 'Live', 'Active', 'Paused', 'Expired', 'Draft', 'Stopped'];
    let statusWord = subText;
    let campaignNameInPanel = subText;
    for (const s of statusSuffixes) {
      if (subText.endsWith(s)) {
        statusWord = s;
        campaignNameInPanel = subText.slice(0, -s.length).trim();
        break;
      }
    }

    // Extract variant labels — the panel shows "Control%Variant 1%Variant 2%" etc.
    // Numeric traffic values are not displayed in this read-only panel.
    const variantLabels = [...raw.matchAll(/(Control|Variant \d+)%/g)].map(m => m[1]);

    console.log(`\n  ── View Details Panel ──────────────────────────────────────────`);
    console.log(`  Campaign name           : ${campaignNameInPanel}`);
    console.log(`  Status                  : ${statusWord}`);
    console.log(`  Campaign ID             : ${extract('Campaign ID', 'Description')}`);
    console.log(`  Start date & time (PST) : ${extract('Campaign start date & time (PST)', 'Campaign end date')}`);
    console.log(`  End date & time (PST)   : ${extract('Campaign end date & time (PST)', 'Channel')}`);
    console.log(`  Channel                 : ${extract('Channel', 'Campaign ID')}`);
    console.log(`  Description             : ${extract('Description', 'Control')}`);
    console.log(`  Traffic splits          : ${variantLabels.length > 0 ? variantLabels.join(', ') : '(none found)'}`);
    console.log(`  ───────────────────────────────────────────────────────────────`);
  }

  async assertCampaignStartDateContains(datePart: string): Promise<void> {
    await expect(this.frame.getByText(datePart).first()).toBeVisible({ timeout: 10000 });
  }

  async assertCampaignEndDateNA(): Promise<void> {
    await expect(this.frame.getByRole('cell', { name: 'N/A' }).first()).toBeVisible({ timeout: 10000 });
  }

  async assertCampaignEndDateContains(datePart: string): Promise<void> {
    await expect(this.frame.getByText(datePart).first()).toBeVisible({ timeout: 10000 });
  }

  async assertCampaignChannelInList(channel: string): Promise<void> {
    await expect(this.frame.getByText(channel).first()).toBeVisible({ timeout: 10000 });
  }

  async assertChannelCellInListRow(channel: string): Promise<void> {
    // Targets the channel table cell specifically — more precise than getByText()
    // which can match text in filter buttons or other parts of the frame.
    await expect(
      this.frame.getByRole('cell', { name: channel })
    ).toBeVisible({ timeout: 10000 });
  }

  // ─── Pause ───────────────────────────────────────────────────────────────────

  async clickPauseCampaign(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Pause Campaign' }).first().click();
  }

  async assertPauseDialog(): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { name: 'Pause Campaign?' })
    ).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByText('Are you sure you want to')).toBeVisible();
    await expect(this.frame.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(this.frame.getByRole('button', { name: 'Pause' })).toBeVisible();
  }

  async confirmPause(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Pause' }).click();
    await expect(this.page.locator('[data-test-id="cf-ui-notification"]').last()).toBeVisible({ timeout: 10000 });
    await this.page.locator('[data-test-id="cf-ui-notification"]').last().click();
  }

  async cancelPause(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Cancel' }).click();
  }

  // ─── Resume ──────────────────────────────────────────────────────────────────

  async clickResumeCampaign(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Resume Campaign' }).click();
  }

  async assertResumeDialog(): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { name: 'Resume Campaign?' })
    ).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByText('Are you sure you want to')).toBeVisible();
    await expect(this.frame.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(this.frame.getByRole('button', { name: 'Resume' })).toBeVisible();
  }

  async confirmResume(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Resume' }).click();
    await expect(this.page.locator('[data-test-id="cf-ui-notification"]').last()).toBeVisible({ timeout: 10000 });
    await this.page.locator('[data-test-id="cf-ui-notification"]').last().click();
  }

  async cancelResume(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Cancel' }).click();
  }

  // ─── Stop ────────────────────────────────────────────────────────────────────

  async clickStopCampaign(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Stop Campaign' }).first().click();
  }

  async assertStopDialog(campaignName: string): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { name: 'Stop Campaign?' })
    ).toBeVisible({ timeout: 5000 });
    // Match dialog body without depending on exact quote style around the campaign name
    await expect(this.frame.getByText(/The campaign .* will/)).toBeVisible();
    await expect(this.frame.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(this.frame.getByRole('button', { name: 'Stop' })).toBeVisible();
  }

  async confirmStop(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Stop' }).click();
    // Stop uses cf-ui-paragraph for its success notification
    await expect(this.page.locator('[data-test-id="cf-ui-paragraph"]').first()).toBeVisible({ timeout: 10000 });
    await this.page.locator('[data-test-id="cf-ui-paragraph"]').first().click();
  }

  async cancelStop(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Cancel' }).click();
  }

  // ─── Delete (Expired campaigns only) ────────────────────────────────────────

  async clickDeleteCampaign(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Delete Campaign' }).first().click();
  }

  async assertDeleteDialog(): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { name: 'Delete Campaign?' })
    ).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByText('Are you sure you want to')).toBeVisible();
    await expect(this.frame.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(this.frame.getByRole('button', { name: 'Delete' })).toBeVisible();
  }

  async confirmDelete(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Delete' }).click();
    await expect(this.page.locator('[data-test-id="cf-ui-paragraph"]').first()).toBeVisible({ timeout: 10000 });
    await this.page.locator('[data-test-id="cf-ui-paragraph"]').first().click();
  }

  async cancelDelete(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Cancel' }).click();
  }

  async clickCopyCampaign(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Copy Campaign' }).first().click();
  }

  async clickSearch(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Search' }).click();
  }

  async getFirstRowName(): Promise<string> {
    const firstDataRow = this.frame.getByRole('row').nth(1);
    return ((await firstDataRow.getByRole('cell').nth(1).textContent()) ?? '').trim();
  }

  // ─── Edit (Update) Campaign drawer ──────────────────────────────────────────

  async clickEditCampaign(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Edit Campaign' }).first().click();
  }

  async assertUpdateDrawerVisible(): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { name: 'Update campaign' })
    ).toBeVisible({ timeout: 10000 });
  }

  async assertCancelButtonVisible(): Promise<void> {
    await expect(
      this.frame.getByTestId('onclose-basic-drawer')
    ).toBeVisible({ timeout: 5000 });
  }

  async assertUpdateCampaignButtonDisabled(): Promise<void> {
    await expect(
      this.frame.getByTestId('submit-save-active-drawer')
    ).toBeDisabled({ timeout: 5000 });
  }

  async assertCampaignIdFieldDisabled(): Promise<void> {
    await expect(
      this.frame.getByRole('textbox', { name: 'Campaign ID *' })
    ).toBeDisabled({ timeout: 5000 });
  }

  async fillUpdateCampaignName(name: string): Promise<void> {
    await this.frame.getByRole('textbox', { name: 'Campaign name *' }).fill(name);
  }

  async assertUpdateCampaignButtonEnabled(): Promise<void> {
    await expect(
      this.frame.getByTestId('submit-save-active-drawer')
    ).toBeEnabled({ timeout: 5000 });
  }

  async fillUpdateEndDate(dateStr: string): Promise<void> {
    const checkbox = this.frame.getByRole('dialog', { name: 'Update campaign' }).getByRole('checkbox');
    if (!await checkbox.isChecked()) {
      await checkbox.check();
    }
    const input = this.frame.getByRole('textbox', { name: 'Set campaign end date & time' });
    await input.click();
    await input.press('ArrowRight');
    await input.fill(dateStr);
  }

  async clickUpdateSaveButton(): Promise<void> {
    // dispatchEvent bypasses the Contentful bandwidth-limit banner overlay
    // (<span class="css-0">) that intercepts pointer events over the button.
    await this.frame.getByTestId('submit-save-active-drawer').dispatchEvent('click');
  }

  async assertUpdateSuccess(): Promise<void> {
    const heading = this.frame.getByRole('heading', { name: 'Update campaign' });
    const startMs = Date.now();
    while (Date.now() - startMs < 15000) {
      if (await heading.isVisible() === false) return;
      await this.page.waitForTimeout(200);
    }
    throw new Error('assertUpdateSuccess: drawer did not close within 15 s');
  }

  async assertCampaignEndDateIsNA(): Promise<void> {
    await expect(this.frame.getByRole('cell', { name: 'N/A' })).toBeVisible({ timeout: 5000 });
  }

  async removeUpdateEndDate(): Promise<void> {
    const checkbox = this.frame.getByRole('dialog', { name: 'Update campaign' }).getByRole('checkbox');
    if (await checkbox.isChecked()) {
      await checkbox.uncheck();
    }
  }

  async assertUpdateDrawerChannelSelected(channelName: string): Promise<void> {
    await expect(
      this.frame.locator('.select__multi-value').filter({ hasText: channelName })
    ).toBeVisible({ timeout: 5000 });
  }

  async assertUpdateEndDateUnchecked(): Promise<void> {
    await expect(
      this.frame.getByRole('dialog', { name: 'Update campaign' }).getByRole('checkbox')
    ).not.toBeChecked({ timeout: 5000 });
  }

  async getUpdateDrawerSelectedChannels(): Promise<string[]> {
    return (await this.frame.locator('.select__multi-value__label').allTextContents())
      .map(t => t.trim()).filter(Boolean);
  }

  async isUpdateEndDateChecked(): Promise<boolean> {
    return this.frame.getByRole('dialog', { name: 'Update campaign' }).getByRole('checkbox').isChecked();
  }

  async assertUpdateNameFieldEnabled(): Promise<void> {
    await expect(
      this.frame.getByRole('textbox', { name: 'Campaign name *' })
    ).toBeEnabled({ timeout: 5000 });
  }

  async assertUpdateStartDateFieldEnabled(): Promise<void> {
    await expect(
      this.frame.getByRole('textbox', { name: 'Campaign start date & time (' })
    ).toBeEnabled({ timeout: 5000 });
  }

  async assertUpdateStartDateFieldDisabled(): Promise<void> {
    await expect(
      this.frame.getByRole('textbox', { name: 'Campaign start date & time (' })
    ).toBeDisabled({ timeout: 5000 });
  }

  async fillUpdateStartDate(dateStr: string): Promise<void> {
    const input = this.frame.getByRole('textbox', { name: 'Campaign start date & time (' });
    await input.click();
    await input.press('ArrowRight');
    await input.fill(dateStr);
  }

  async assertAddNewVariantsButtonEnabled(): Promise<void> {
    const btn = this.frame.getByText('Add new variants');
    await expect(btn).toBeVisible({ timeout: 5000 });
    await expect(btn).not.toHaveAttribute('aria-disabled', 'true', { timeout: 5000 });
  }

  async clickAddNewVariantsInUpdateDrawer(): Promise<void> {
    await this.frame.getByText('Add new variants').click();
  }

  async assertUpdateDrawerHasSaveDraftButton(): Promise<void> {
    await expect(
      this.frame.getByTestId('submit-save-draft-drawer')
    ).toBeVisible({ timeout: 5000 });
  }

  async clickUpdateSaveDraftButton(): Promise<void> {
    await this.frame.getByTestId('submit-save-draft-drawer').dispatchEvent('click');
  }

  async assertAddNewVariantsButtonDisabled(): Promise<void> {
    // Rendered as <a aria-disabled="true"> — toBeDisabled() only works on native form
    // elements, so we check the aria-disabled attribute directly.
    const btn = this.frame.getByText('Add new variants');
    await expect(btn).toBeVisible({ timeout: 5000 });
    await expect(btn).toHaveAttribute('aria-disabled', 'true', { timeout: 5000 });
  }

  async assertUpdateChannelSelectorEnabled(): Promise<void> {
    await expect(
      this.frame.locator('.select__input-container')
    ).toBeVisible({ timeout: 5000 });
  }

  async assertUpdateVariantTrafficEnabled(): Promise<void> {
    // Index 0 = Control (disabled), index 1 = Variant 1 (enabled)
    await expect(
      this.frame.getByPlaceholder('Traffic percentage').nth(1)
    ).toBeEnabled({ timeout: 5000 });
  }

  async selectUpdateDrawerChannel(channelName: string): Promise<void> {
    // React-select removes already-selected items from the dropdown — skip if already chosen.
    const alreadySelected = this.frame.locator('.select__multi-value', { hasText: channelName });
    if (await alreadySelected.isVisible().catch(() => false)) return;
    await this.frame.locator('.select__input-container').click();
    const option = this.frame.locator('.select__option', { hasText: channelName }).first();
    await option.waitFor({ state: 'visible', timeout: 5000 });
    await option.click();
  }

  // Opens the dropdown up to `count` times and picks the first available (unselected) option
  // each time — no hardcoded names needed.  Returns the labels that were actually selected.
  async selectAvailableUpdateDrawerChannels(count: number): Promise<string[]> {
    const selected: string[] = [];
    for (let i = 0; i < count; i++) {
      await this.frame.locator('.select__input-container').click();
      const firstOption = this.frame.locator('.select__option').first();
      try {
        await firstOption.waitFor({ state: 'visible', timeout: 5000 });
      } catch {
        break; // No more unselected channels available
      }
      const label = (await firstOption.textContent() ?? '').trim();
      if (!label) break;
      await firstOption.click();
      selected.push(label);
    }
    return selected;
  }

  async setUpdateDrawerVariantTrafficByIndex(index: number, value: number): Promise<void> {
    const input = this.frame.getByRole('spinbutton').nth(index);
    await input.click();
    await input.fill(String(value));
  }

  async getUpdateDrawerFields(): Promise<{
    name: string;
    campaignId: string;
    startDate: string;
    endDate: string;
    channels: string[];
    traffic: string[];
  }> {
    const name       = await this.frame.getByRole('textbox', { name: 'Campaign name *' }).inputValue();
    const campaignId = await this.frame.getByRole('textbox', { name: 'Campaign ID *' }).inputValue();
    const startDate  = await this.frame.getByRole('textbox', { name: 'Campaign start date & time (' }).inputValue();
    // Wait for the channel multi-value labels to render before reading them.
    // The drawer heading appears before the select widget fully mounts.
    try {
      await this.frame.locator('.select__multi-value__label').first().waitFor({ state: 'visible', timeout: 5000 });
    } catch { /* no labels yet — allTextContents will return [] */ }
    const channels   = (await this.frame.locator('.select__multi-value__label').allTextContents())
      .map(t => t.trim()).filter(Boolean);
    const hasEndDate = await this.frame
      .getByRole('dialog', { name: 'Update campaign' })
      .getByRole('checkbox')
      .isChecked();
    const endDate = hasEndDate
      ? await this.frame.getByRole('textbox', { name: 'Set campaign end date & time' }).inputValue()
      : 'N/A (not set)';
    const trafficLocator = this.frame.getByPlaceholder('Traffic percentage');
    const trafficCount   = await trafficLocator.count();
    const traffic: string[] = [];
    for (let i = 0; i < trafficCount; i++) {
      traffic.push(await trafficLocator.nth(i).inputValue());
    }
    return { name, campaignId, startDate, endDate, channels, traffic };
  }

  async getUpdateDrawerVariantCount(): Promise<number> {
    const total = await this.frame.getByPlaceholder('Traffic percentage').count();
    return total - 1; // Subtract 1 for Control
  }

  async getUpdateDrawerTrafficByIndex(index: number): Promise<number> {
    const value = await this.frame.getByPlaceholder('Traffic percentage').nth(index).inputValue();
    return parseInt(value, 10);
  }

  async getListRowStatus(): Promise<string> {
    for (const s of ['Scheduled', 'Live', 'Active', 'Paused', 'Expired', 'Draft', 'Stopped']) {
      if (await this.frame.getByRole('cell', { name: s }).isVisible().catch(() => false)) {
        return s;
      }
    }
    return '—';
  }

  async closeUpdateDrawer(): Promise<void> {
    await this.frame.getByTestId('onclose-basic-drawer').click();
  }

  // ─── Status filter ───────────────────────────────────────────────────────────

  async filterByStatus(status: string): Promise<void> {
    // If the desired status is already active, nothing to do.
    if (await this.frame.getByRole('button', { name: status }).isVisible().catch(() => false)) return;

    // Find whichever filter button is currently shown and click it to open the dropdown,
    // then select the desired status. Handles the case where a prior test left a different
    // status active (e.g. "Live") so "All statuses" is no longer present.
    for (const s of ['All statuses', 'Live', 'Scheduled', 'Active', 'Paused', 'Expired', 'Draft', 'Stopped']) {
      const btn = this.frame.getByRole('button', { name: s });
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await this.frame.locator('div').filter({ hasText: new RegExp(`^${status}$`) }).first().click();
        return;
      }
    }
  }

  async assertStatusFilterActive(status: string): Promise<void> {
    await expect(
      this.frame.getByRole('button', { name: status })
    ).toBeVisible({ timeout: 5000 });
  }

  async assertLiveCampaignInResults(): Promise<void> {
    // getByRole('cell') already scopes to table cells; the filter button (role=button) is
    // excluded, so .first() is correct — .nth(1) would require ≥2 Live rows to be visible.
    await expect(
      this.frame.getByRole('cell', { name: 'Live' }).first()
    ).toBeVisible({ timeout: 20000 });
  }

  async hasLiveCampaignInResults(): Promise<boolean> {
    // Use expect with a timeout rather than isVisible() (which is an instant snapshot
    // with no wait and returns false before results have finished rendering).
    try {
      await expect(
        this.frame.getByRole('cell', { name: 'Live' }).nth(1)
      ).toBeVisible({ timeout: 15000 });
      return true;
    } catch {
      return false;
    }
  }

  async getDetailsCampaignName(): Promise<string> {
    const subText = ((await this.frame.locator('[data-test-id="cf-ui-subheading"]').first().textContent()) ?? '').trim();
    // The subheading appends the status badge AFTER the name (e.g. "Live_3Live").
    // Remove the suffix rather than the first occurrence to handle names that contain a status word.
    const statuses = ['Scheduled', 'Live', 'Active', 'Paused', 'Expired', 'Draft', 'Stopped'];
    for (const s of statuses) {
      if (subText.endsWith(s)) return subText.slice(0, -s.length).trim();
    }
    return subText;
  }

  async confirmPauseLive(): Promise<void> {
    // Live campaign pause uses cf-ui-paragraph (same as Stop/Delete)
    await this.frame.getByRole('button', { name: 'Pause' }).click();
    await expect(this.page.locator('[data-test-id="cf-ui-paragraph"]').first()).toBeVisible({ timeout: 10000 });
    await this.page.locator('[data-test-id="cf-ui-paragraph"]').first().click();
  }

  async confirmResumeLive(): Promise<void> {
    // Live campaign resume uses cf-ui-paragraph (same as Stop/Delete)
    await this.frame.getByRole('button', { name: 'Resume' }).click();
    await expect(this.page.locator('[data-test-id="cf-ui-paragraph"]').first()).toBeVisible({ timeout: 10000 });
    await this.page.locator('[data-test-id="cf-ui-paragraph"]').first().click();
  }

  async assertPauseCampaignButtonNotVisible(): Promise<void> {
    await expect(
      this.frame.getByRole('button', { name: 'Pause Campaign' }).first()
    ).not.toBeVisible({ timeout: 5000 });
  }

  async clearStatusFilter(): Promise<void> {
    // Click the current status filter button (label changes to match selected status)
    // then select "All statuses" from the dropdown.
    for (const s of ['Live', 'Scheduled', 'Active', 'Paused', 'Expired', 'Draft', 'Stopped']) {
      const btn = this.frame.getByRole('button', { name: s });
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await this.frame.locator('div').filter({ hasText: /^All statuses$/ }).first().click();
        return;
      }
    }
    // Filter is already "All statuses" — nothing to do
  }

  async assertDraftCampaignActions(): Promise<void> {
    await expect(this.frame.getByRole('button', { name: 'Edit Campaign' }).first()).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Copy Campaign' }).first()).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Delete Campaign' }).first()).toBeEnabled({ timeout: 5000 });
    // Pause and Stop are rendered but disabled for Draft campaigns (campaign is not running)
    await expect(this.frame.getByRole('button', { name: 'Pause Campaign' }).first()).toBeDisabled({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Stop Campaign' }).first()).toBeDisabled({ timeout: 5000 });
    // Resume Campaign is not applicable for Draft campaigns
    await expect(this.frame.getByRole('button', { name: 'Resume Campaign' })).not.toBeVisible({ timeout: 5000 });
  }

  async assertDraftRowNA(): Promise<void> {
    // Draft campaigns have no start date, end date, or channel — all three columns show N/A
    await expect(this.frame.getByRole('cell', { name: 'N/A' }).first()).toBeVisible({ timeout: 10000 });
    await expect(this.frame.getByRole('cell', { name: 'N/A' }).nth(1)).toBeVisible({ timeout: 5000 });
    await expect(this.frame.getByRole('cell', { name: 'N/A' }).nth(2)).toBeVisible({ timeout: 5000 });
  }

  async assertNoNACellsInResults(): Promise<void> {
    // When a single campaign is shown after a name search, no N/A cells means
    // all columns (start date, end date, channel) have real values.
    await expect(
      this.frame.getByRole('cell', { name: 'N/A' }).first()
    ).not.toBeVisible({ timeout: 5000 });
  }

  async assertLiveCampaignActions(): Promise<void> {
    await expect(this.frame.getByRole('button', { name: 'View Details' }).first()).toBeEnabled({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Edit Campaign' }).first()).toBeEnabled({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Copy Campaign' }).first()).toBeEnabled({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Pause Campaign' }).first()).toBeEnabled({ timeout: 5000 });
    await expect(this.frame.getByRole('button', { name: 'Stop Campaign' }).first()).toBeEnabled({ timeout: 5000 });
    // Delete Campaign is disabled for Live campaigns
    await expect(this.frame.getByRole('button', { name: 'Delete Campaign' }).first()).toBeDisabled({ timeout: 5000 });
    // Resume Campaign is not applicable for Live campaigns
    await expect(this.frame.getByRole('button', { name: 'Resume Campaign' })).not.toBeVisible({ timeout: 5000 });
  }
}
