import { FrameLocator, Page, expect } from '@playwright/test';

export class CampaignListPage {
  private readonly frame: FrameLocator;
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.frame = page.frameLocator('[data-test-id="cf-widget-renderer"]');
  }

  async assertPageVisible(campaignType: string): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { name: `${campaignType} campaigns` })
    ).toBeVisible({ timeout: 10000 });
    await expect(
      this.frame.getByRole('link', { name: campaignType, exact: true })
    ).toBeVisible();
    console.log(`\n  ── ${campaignType} campaigns page ─────────────────────`);
  }

  async assertFilters(statusName: string): Promise<void> {
    await expect(this.frame.getByRole('button', { name: statusName })).toBeVisible();
    const dateFilter = this.frame.getByRole('combobox').filter({ hasText: 'All days' });
    await expect(dateFilter).toBeVisible();

    const dateText = (await dateFilter.textContent() ?? '?').trim();
    console.log(`  Status filter    : ${statusName}`);
    console.log(`  Date filter      : ${dateText}`);
  }

  /** Asserts every search & filter control on the list page is present: the Name textbox, Status dropdown, Date dropdown, and the Search/Reset buttons. */
  async assertSearchFilterUIVisible(): Promise<void> {
    await expect(this.frame.getByRole('textbox', { name: 'Enter campaign name' })).toBeVisible({ timeout: 10000 });
    await expect(this.frame.getByRole('button', { name: /All statuses|Live|Scheduled|Paused|Draft|Expired/ }).first()).toBeVisible();
    await expect(this.frame.getByRole('combobox').filter({ hasText: /Today|All days/ })).toBeVisible();
    await expect(this.frame.getByRole('button', { name: 'Search' })).toBeVisible();
    await expect(this.frame.getByRole('button', { name: 'Reset' })).toBeVisible();
  }

  async getTotalCampaignCount(): Promise<number> {
    const el = this.frame.getByText(/\d+ Campaigns/).first();
    await expect(el).toBeVisible({ timeout: 10000 });
    const text = await el.textContent() ?? '';
    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Asserts two things and logs the outcome:
   * 1. Results heading shows the exact count from the Dashboard card.
   *    Uses expect().toBeVisible() so Playwright retries until the correct count
   *    appears — avoids reading a stale "Results (0)" during page load.
   * 2. Total campaign count (top of page) is ≥ the filtered results count.
   */
  async assertCountsValid(dashboardCount: number): Promise<void> {
    await expect(
      this.frame.getByRole('heading', { name: `Results (${dashboardCount})` }),
      `Results heading should show count ${dashboardCount} matching the Dashboard card`
    ).toBeVisible({ timeout: 10000 });

    const totalCount = await this.getTotalCampaignCount();

    console.log(`  Results count    : ${dashboardCount}`);
    console.log(`  Total campaigns  : ${totalCount}`);
    console.log(`  ───────────────────────────────────────────────────`);

    expect(
      totalCount,
      `Total campaigns (${totalCount}) should be ≥ filtered count (${dashboardCount})`
    ).toBeGreaterThanOrEqual(dashboardCount);
  }

  async navigateToDashboard(): Promise<void> {
    await this.frame.getByRole('link', { name: 'Dashboard' }).click();
    await expect(
      this.frame.getByRole('heading', { name: 'Dashboard' })
    ).toBeVisible({ timeout: 10000 });
  }

  // ─── Navigation to a campaign-type list ───────────────────────────────────────

  async navigate(campaignType: string): Promise<void> {
    await this.frame.getByRole('link', { name: campaignType, exact: true }).click();
    await this.assertPageVisible(campaignType);
  }

  async clickCreateButton(): Promise<void> {
    // The "Campaigns" breadcrumb button (2nd on the page — 1st is the sidebar nav toggle)
    // opens the Create campaign drawer directly.
    await this.frame.getByRole('button', { name: 'Campaigns' }).nth(1).click();
  }

  // ─── Search / row lookup ───────────────────────────────────────────────────────

  /**
   * A campaign with a future start date (e.g. Scheduled) is invisible under the
   * "Today" date filter and only shows under "All days" — confirmed live. Call
   * this before searching for anything not guaranteed to start today.
   */
  async filterByDate(option: string): Promise<void> {
    const trigger = this.frame.getByRole('combobox').filter({ hasText: /Today|All days/ });
    const optionLocator = this.frame.getByRole('option', { name: option });

    // The dropdown occasionally fails to open on the first click (same class of
    // flaky-overlay issue as the Search button above) — retry the trigger click
    // as a unit rather than trusting a single click to have opened the menu.
    await expect(async () => {
      await trigger.click();
      await expect(optionLocator).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30000 });

    await optionLocator.click();
  }

  /**
   * Selects "Custom" from the Date filter and picks a specific day range via
   * the calendar grid that appears — confirmed live: choosing "Custom" opens
   * a two-month calendar picker (not a text input), with "Cancel"/"Done"
   * buttons. "Done" is already enabled after a single day is clicked (a
   * same-day range), and clicking a second day extends the range; applying
   * it sets the trigger's own label to "MMM D - MMM D, YYYY" (e.g. "Sep 20 -
   * Sep 26, 2026"). Does not click Search itself — same convention as
   * filterByDate(). Both dates must already be visible in the two
   * currently-shown months (no "next month" navigation here) — callers pick
   * a range close enough to today for that to hold.
   */
  async filterByCustomDateRange(startDate: Date, endDate: Date): Promise<void> {
    const trigger = this.frame.getByRole('combobox').filter({ hasText: /Today|All days/ });
    const customOption = this.frame.getByRole('option', { name: 'Custom' });

    await expect(async () => {
      await trigger.click();
      await expect(customOption).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30000 });
    await customOption.click();

    await this.clickCalendarDay(startDate);
    await this.clickCalendarDay(endDate);
    await this.frame.getByRole('button', { name: 'Done' }).click();
  }

  /**
   * Clicks a specific day in the Custom date range calendar. Matched by
   * "<Month> <Day><suffix>, <Year>" only (not the leading weekday, and not
   * the "Today, " prefix confirmed live on today's own cell) since a RegExp
   * name match is a substring match, not anchored. .first() — a date near
   * the start/end of a month can render twice (as trailing/leading overflow
   * days in both adjacent month grids shown side by side); either instance
   * selects the same real date.
   */
  private async clickCalendarDay(date: Date): Promise<void> {
    const month = date.toLocaleString('en-US', { month: 'long' });
    const day = date.getDate();
    const year = date.getFullYear();
    const label = new RegExp(`${month} ${day}(st|nd|rd|th), ${year}`);
    await this.frame.getByRole('button', { name: label }).first().click();
  }

  /**
   * Filters the list to campaigns with the given status and returns the
   * first matching campaign's name — for tests that just need "a campaign
   * in status X" and don't need to prove the transition into that status
   * themselves (that's covered by the dedicated creation/lifecycle tests).
   * Confirmed live: this space already has plenty of existing campaigns in
   * every status from prior runs, so this avoids the multi-minute real-time
   * wait a fresh Scheduled -> Live transition otherwise requires.
   *
   * The status filter's dropdown items are plain clickable text nodes, not
   * role="option" (confirmed live) — same pattern as
   * GradualRolloutListPage's equivalent filter.
   */
  async findExistingCampaignByStatus(status: string): Promise<string> {
    // Confirmed live: a previous test in this shared-page session can leave
    // text in the Name search box (e.g. its own just-created campaign's
    // name) — searching by Status alone without clearing it combines both
    // filters and silently returns 0 results for a status that genuinely
    // has plenty of matches.
    await this.frame.getByRole('textbox', { name: 'Enter campaign name' }).fill('');

    const statusButton = this.frame.getByRole('button', { name: /All statuses|Live|Scheduled|Paused|Draft|Expired/ }).first();
    const optionLocator = this.frame.locator('div').filter({ hasText: new RegExp(`^${status}$`) }).first();

    await expect(async () => {
      await statusButton.click();
      await expect(optionLocator).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30000 });
    await optionLocator.click();

    await this.frame.getByRole('button', { name: 'Search' }).click({ timeout: 30000 });

    // Picking the first row's name isn't enough on its own: this space has a
    // few campaigns that genuinely share the exact same name across two
    // physical rows (confirmed live, e.g. "P13n_2-edit name"). row() falls
    // back to .first() so a single action never crashes on that, but with a
    // true duplicate ".first()" isn't guaranteed to keep resolving to the
    // *same* physical row across separate queries — confirmed live: pausing
    // hit one duplicate, then the status re-check's own .first() landed on
    // the other (still-Live) one, so the poll never saw "Paused". Skip ahead
    // to a candidate whose name is unique among these results so every
    // later row(name) call in the test reliably targets that one row.
    const rows = this.frame.getByRole('row')
      .filter({ has: this.frame.getByRole('cell', { name: status, exact: true }) });
    await expect(rows.first()).toBeVisible({ timeout: 15000 });

    const rowCount = await rows.count();
    let foundName: string | null = null;
    for (let i = 0; i < rowCount; i++) {
      const name = ((await rows.nth(i).getByRole('cell').nth(2).textContent()) ?? '').trim();
      if (await this.frame.getByRole('cell', { name, exact: true }).count() === 1) {
        foundName = name;
        break;
      }
    }

    // Reset the status filter back to "All statuses" before returning — left
    // on `status`, it silently excludes the campaign from every later
    // searchByName() call as soon as its status actually changes (confirmed
    // live: pausing a "Live"-filtered selection made it vanish from its own
    // subsequent status poll, which then hung until timeout on "—").
    await this.frame.getByRole('button', { name: status }).click();
    await this.frame.locator('div').filter({ hasText: /^All statuses$/ }).first().click();

    if (!foundName) {
      throw new Error(`No uniquely-named campaign found with status "${status}" among the first ${rowCount} results.`);
    }
    return foundName;
  }

  /** Clears the name/status/date filters back to their defaults and re-runs an unfiltered search — confirmed live: a repeated same-name searchByName() poll can keep returning a stale status past a real change (e.g. Scheduled -> Live right at the start time), while a Reset followed by a fresh search picks up the change immediately. */
  async clickReset(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Reset' }).click();
  }

  /**
   * Clicks Search with no filter changes of its own — for callers (like
   * getUnfilteredResultsCount()) that need one clean, explicit fetch to hook
   * a settle-wait onto. clickReset() and filterByDate() each auto-refresh on
   * their own without an explicit Search click, which is fine on their own
   * but means two of them run back to back (as in a Reset -> "All days"
   * sequence) can leave two overlapping in-flight fetches with no single
   * deterministic trigger to wait against.
   */
  async clickSearch(): Promise<void> {
    await this.frame.getByRole('button', { name: 'Search' }).click({ timeout: 30000 });
  }

  /**
   * The robust, two-phase-settled count with no status/name filter applied —
   * for baseline "All statuses" reads. Explicitly re-triggers the fetch via
   * clickSearch() after the caller's own Reset/date setup, rather than
   * trusting clickReset()'s and filterByDate()'s own auto-refresh timing.
   */
  async getUnfilteredResultsCount(): Promise<number> {
    const countBefore = await this.getResultsCount();
    await this.clickSearch();
    return this.waitForResultsCountToChangeFrom(countBefore);
  }

  /**
   * Reads and parses the live "Results (N)" heading — never a hardcoded
   * expectation. A single immediate read: right after changing a filter,
   * prefer waitForResultsCountToChangeFrom() instead of trusting this alone
   * — see its own doc comment for why a naive "read it once" or even a
   * "stable across two quick reads" check isn't safe here.
   */
  async getResultsCount(): Promise<number> {
    const heading = this.frame.getByRole('heading', { name: /^Results \(\d+\)$/ });
    const text = (await heading.textContent()) ?? '';
    const match = text.match(/\((\d+)\)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Polls getResultsCount() until it differs from a known "before" value AND
   * then holds steady for a few consecutive reads, up to a generous budget
   * matching searchByName()'s own documented worst-case latency under this
   * space's real campaign volume (up to ~30s). Two failure modes confirmed
   * live, reproducible, each defeating a simpler check on its own:
   *   1. A naive "stable across two consecutive reads" check is fooled by a
   *      count that simply hasn't updated yet — it reads the same stale
   *      number twice in a row and wrongly concludes it's "done".
   *   2. Comparing only against the "before" value (this method's own
   *      earlier version) is fooled the other way: the heading briefly shows
   *      a transient intermediate value before settling — observed going
   *      311 (the prior unfiltered total) -> a wrong number -> 52 (the real
   *      "Scheduled" count) — and a bare "changed from before" check latches
   *      onto that transient value the moment it first differs.
   * Requiring the value to both differ from `previousCount` and then repeat
   * 3 times in a row survives both. If the new count genuinely happens to
   * equal the old one by coincidence, this spends the full budget before
   * returning — correctness holds, it's just not fast in that rare case.
   */
  async waitForResultsCountToChangeFrom(previousCount: number, timeout = 30000): Promise<number> {
    return this.pollUntilSettledChange(() => this.getResultsCount(), previousCount, timeout);
  }

  /**
   * A settled *baseline* read — for a "before" count taken with no known
   * prior value to compare against, rather than after a specific action.
   * Confirmed live, reproducible: a plain single read right after the page
   * loads can catch getTotalCampaignCount() before its real number has
   * rendered (observed reading "0" moments before it became "311") — the
   * same two-phase render lag documented on waitForResultsCountToChangeFrom(),
   * just with no "before" value of its own to detect the change from. Passing
   * an impossible sentinel (-1) into the same settle poll forces it straight
   * into the stability-confirmation phase, so the caller gets a value that's
   * held steady across 3 consecutive reads rather than a first-paint snapshot.
   */
  async getSettledTotalCampaignCount(timeout = 30000): Promise<number> {
    return this.pollUntilSettledChange(() => this.getTotalCampaignCount(), -1, timeout);
  }

  /**
   * Generic two-phase settle poll shared by every "wait for a count to
   * genuinely change" helper on this page (Results heading, total campaign
   * count, ...) — see waitForResultsCountToChangeFrom()'s doc comment for
   * the two distinct races this survives that a simpler check doesn't.
   */
  private async pollUntilSettledChange(read: () => Promise<number>, previousValue: number, timeout = 30000): Promise<number> {
    const start = Date.now();
    let current = await read();
    while (current === previousValue && Date.now() - start < timeout) {
      await this.page.waitForTimeout(300);
      current = await read();
    }

    let stableReads = 1;
    let lastValue = current;
    while (stableReads < 3 && Date.now() - start < timeout) {
      await this.page.waitForTimeout(300);
      const next = await read();
      if (next === lastValue) {
        stableReads++;
      } else {
        stableReads = 1;
        lastValue = next;
      }
    }
    return lastValue;
  }

  /** Same settle-wait as waitForResultsCountToChangeFrom(), but for the page-level "N Campaigns" total (getTotalCampaignCount()) rather than the filtered "Results (N)" heading — for tests verifying a create/delete actually changed the overall count. */
  async waitForTotalCampaignCountToChangeFrom(previousCount: number, timeout = 30000): Promise<number> {
    return this.pollUntilSettledChange(() => this.getTotalCampaignCount(), previousCount, timeout);
  }

  /**
   * Selects a status from the Status filter dropdown and clicks Search, with
   * no name term involved — for tests that verify status-only filtering.
   * Distinct from findExistingCampaignByStatus(), which also picks a single
   * campaign and resets the filter back afterward; this one leaves the
   * filter applied so the caller can inspect the filtered results itself.
   * Waits for the Results count to actually change before returning — see
   * waitForResultsCountToChangeFrom()'s doc comment for why that matters.
   */
  async filterByStatus(status: string): Promise<void> {
    const statusButton = this.frame.getByRole('button', { name: /All statuses|Live|Scheduled|Paused|Draft|Expired|\d+ selected/ }).first();
    const optionLocator = this.frame.locator('div').filter({ hasText: new RegExp(`^${status}$`) }).first();

    await expect(async () => {
      await statusButton.click();
      await expect(optionLocator).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30000 });
    await optionLocator.click();

    const countBefore = await this.getResultsCount();
    await this.frame.getByRole('button', { name: 'Search' }).click({ timeout: 30000 });
    await this.waitForResultsCountToChangeFrom(countBefore);
  }

  /**
   * Selects MULTIPLE statuses from the Status filter dropdown and clicks
   * Search — confirmed live: this dropdown is a genuine multi-select (not a
   * single-select like the Date filter). Clicking one option keeps the
   * dropdown open rather than closing it, so every status after the first is
   * picked from that same open list without re-clicking the trigger — doing
   * so would toggle the already-open dropdown closed instead. Once 2+ are
   * selected the trigger's own label changes to "N selected" rather than
   * naming them, so it's located generically here rather than by name.
   */
  async filterByStatuses(statuses: string[]): Promise<void> {
    const statusButton = this.frame.getByRole('button', { name: /All statuses|Live|Scheduled|Paused|Draft|Expired|\d+ selected/ }).first();
    const firstOption = this.frame.locator('div').filter({ hasText: new RegExp(`^${statuses[0]}$`) }).first();

    await expect(async () => {
      await statusButton.click();
      await expect(firstOption).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30000 });

    for (const status of statuses) {
      await this.frame.locator('div').filter({ hasText: new RegExp(`^${status}$`) }).first().click();
    }

    const countBefore = await this.getResultsCount();
    await this.frame.getByRole('button', { name: 'Search' }).click({ timeout: 30000 });
    await this.waitForResultsCountToChangeFrom(countBefore);
  }

  /**
   * Spot-checks the first few visible result rows all show the given status —
   * proof a status-only filter actually filtered, not just that at least one
   * matching campaign happens to exist. Bounded to a handful of rows rather
   * than every row on the page, matching this suite's existing count-based
   * checks elsewhere (e.g. assertCountsValid()) rather than an exhaustive scan.
   */
  async assertAllVisibleRowsHaveStatus(status: string, sampleSize = 5): Promise<void> {
    const rowCount = await this.getResultsCount();
    const checkCount = Math.min(rowCount, sampleSize);
    for (let i = 0; i < checkCount; i++) {
      const row = this.frame.getByRole('row').filter({ hasNot: this.frame.getByRole('columnheader') }).nth(i);
      await expect(row.getByRole('cell', { name: status, exact: true })).toBeVisible({ timeout: 10000 });
    }
  }

  /** Same spot-check as assertAllVisibleRowsHaveStatus(), but for a multi-select filter — each sampled row must show ONE of the selected statuses, not any particular one of them. */
  async assertAllVisibleRowsHaveAnyStatus(statuses: string[], sampleSize = 5): Promise<void> {
    const rowCount = await this.getResultsCount();
    const checkCount = Math.min(rowCount, sampleSize);
    for (let i = 0; i < checkCount; i++) {
      const row = this.frame.getByRole('row').filter({ hasNot: this.frame.getByRole('columnheader') }).nth(i);
      let matchedStatus: string | null = null;
      for (const status of statuses) {
        if (await row.getByRole('cell', { name: status, exact: true }).isVisible().catch(() => false)) {
          matchedStatus = status;
          break;
        }
      }
      expect(matchedStatus, `Row ${i} should show one of [${statuses.join(', ')}]`).not.toBeNull();
    }
  }

  async searchByName(name: string): Promise<void> {
    await this.frame.getByRole('textbox', { name: 'Enter campaign name' }).fill(name);
    // Explicit override above the suite-wide 15s actionTimeout — against this list's
    // 270+ campaigns the Search button legitimately stays disabled ("Searching...")
    // longer than 15s (confirmed live: it became enabled again ~100ms after the
    // global timeout fired). This is a known-slow interaction, not a stuck locator.
    await this.frame.getByRole('button', { name: 'Search' }).click({ timeout: 30000 });
  }

  async assertCampaignVisible(name: string): Promise<void> {
    await expect(
      this.frame.getByRole('cell', { name, exact: true }).first()
    ).toBeVisible({ timeout: 15000 });
  }

  /** Scoped absence check — for filters (e.g. Status + Date with no Name term) where other genuine matches can exist, so a blanket assertNoResults() would be wrong. Exact-name match, same as assertCampaignVisible(). */
  async assertCampaignNotVisible(name: string): Promise<void> {
    await expect(this.frame.getByRole('cell', { name, exact: true })).toHaveCount(0, { timeout: 10000 });
  }

  async assertNoResults(): Promise<void> {
    await expect(this.frame.getByText('No results.')).toBeVisible({ timeout: 10000 });
  }

  /**
   * Returns '—' (not the literal status text) when no row is present. Without
   * `name`, checks unscoped across the whole current results — only safe when
   * the search is known to return exactly one row (e.g. a freshly-generated,
   * timestamped campaign name). With `name`, scopes to that campaign's own
   * row — required whenever the search could return more than one result
   * (confirmed live: searching an existing short name like "p13_3" also
   * matches "p13_3d", "p13_3d2", etc. — the unscoped check then hits a
   * strict-mode violation on any status shared by more than one of those
   * rows, silently swallowed into a false "—" by the try/catch below).
   */
  async getListRowStatus(name?: string): Promise<string> {
    const scope = name ? this.row(name) : this.frame;
    for (const s of ['Scheduled', 'Live', 'Paused', 'Expired', 'Draft']) {
      if (await scope.getByRole('cell', { name: s, exact: true }).first().isVisible().catch(() => false)) {
        return s;
      }
    }
    return '—';
  }

  /**
   * Searches fresh and polls until the row's status matches — status can lag a
   * save/action toast by a moment. Poll timeout must exceed searchByName()'s own
   * allowed Search-button click time (30s, see playwright.config.ts actionTimeout)
   * — confirmed live (found running the suite from VS Code): a 15s poll budget
   * couldn't even complete a single full search+read cycle against this space's
   * 300+ campaigns, so it failed every time regardless of the actual status,
   * masked behind the outer test's own 120s timeout rather than a clear poll error.
   */
  async assertRowStatus(name: string, status: string, timeout = 90000): Promise<void> {
    await expect.poll(
      async () => {
        await this.searchByName(name);
        return this.getListRowStatus(name);
      },
      { timeout, intervals: [500, 1000, 2000] }
    ).toBe(status);
  }

  /** Reads the Channels column's accessible name for a campaign row, e.g. "web, Mobile". */
  async assertRowChannels(name: string, channelsText: string): Promise<void> {
    await expect(this.row(name).getByRole('cell', { name: channelsText, exact: true })).toBeVisible({ timeout: 10000 });
  }

  /**
   * Start/End date columns render as "YYYY-MM-DD hh:mm AM/PM" (confirmed live) —
   * a 12-hour format distinct from the datetime-local input format used to fill
   * the Create campaign form. Callers convert before calling these.
   */
  async assertRowStartDate(name: string, expectedDateText: string): Promise<void> {
    await expect(this.row(name).getByRole('cell', { name: expectedDateText, exact: true })).toBeVisible({ timeout: 10000 });
  }

  async assertRowEndDate(name: string, expectedDateText: string): Promise<void> {
    await expect(this.row(name).getByRole('cell', { name: expectedDateText, exact: true })).toBeVisible({ timeout: 10000 });
  }

  async clickEditCampaignForRow(name: string): Promise<void> {
    await this.row(name).getByRole('button', { name: 'Edit Campaign' }).click();
  }

  // ─── Lifecycle actions (Pause / Resume / Stop / Delete) ────────────────────────

  /**
   * Scoped to `.first()` — some existing campaigns in this space genuinely
   * share the exact same name across two physical rows (confirmed live, e.g.
   * "P13n_2-edit name"), which otherwise trips a strict-mode violation on
   * every row-scoped action below. Picking the first is fine for these
   * lifecycle tests: they only need *a* row in the right state to act on,
   * not a guarantee of which physical duplicate that is.
   */
  private row(name: string) {
    return this.frame.getByRole('row').filter({ has: this.frame.getByRole('cell', { name, exact: true }) }).first();
  }

  /**
   * The Pause/Resume/Stop/Delete confirmation is an `alertdialog` (not `dialog`)
   * rendered inside the app iframe — confirmed live, shared shape across all four
   * actions: a heading, a message paragraph, "Cancel", and the action button.
   */
  private confirmDialog() {
    return this.frame.getByRole('alertdialog');
  }

  /** Reads the live confirmation dialog's message text — never a hardcoded string. */
  async getConfirmDialogMessage(): Promise<string> {
    return (await this.confirmDialog().locator('p').first().textContent()) ?? '';
  }

  async getConfirmDialogHeading(): Promise<string> {
    return (await this.confirmDialog().getByRole('heading').first().textContent()) ?? '';
  }

  async assertActionEnabled(name: string, actionName: string): Promise<void> {
    await expect(this.row(name).getByRole('button', { name: actionName })).toBeEnabled({ timeout: 10000 });
  }

  async assertActionDisabled(name: string, actionName: string): Promise<void> {
    await expect(this.row(name).getByRole('button', { name: actionName })).toBeDisabled({ timeout: 10000 });
  }

  /**
   * Reads the live enabled/disabled state of every action button on a row —
   * never hardcoded — so callers can log the actual split as an explicit
   * verification step and compare it against what's expected for that status.
   * "Resume Campaign" only renders at all once a campaign is Paused, so it's
   * skipped (rather than reported disabled) everywhere else.
   */
  async getRowActionStates(name: string): Promise<{ enabled: string[]; disabled: string[] }> {
    const ROW_ACTIONS = [
      'Share Campaign', 'View Details', 'Edit Campaign', 'Copy Campaign',
      'Pause Campaign', 'Resume Campaign', 'Stop Campaign', 'Delete Campaign',
    ];
    const row = this.row(name);
    const enabled: string[] = [];
    const disabled: string[] = [];
    for (const action of ROW_ACTIONS) {
      const button = row.getByRole('button', { name: action });
      if (await button.count() === 0) continue;
      if (await button.isEnabled()) {
        enabled.push(action);
      } else {
        disabled.push(action);
      }
    }
    return { enabled, disabled };
  }

  async clickPauseCampaign(name: string): Promise<void> {
    await this.row(name).getByRole('button', { name: 'Pause Campaign' }).click();
  }

  async assertPauseDialogVisible(): Promise<void> {
    await expect(this.confirmDialog().getByRole('heading', { name: 'Pause Campaign?' })).toBeVisible({ timeout: 5000 });
  }

  async confirmPause(): Promise<void> {
    await this.confirmDialog().getByRole('button', { name: 'Pause', exact: true }).click();
  }

  async clickResumeCampaign(name: string): Promise<void> {
    await this.row(name).getByRole('button', { name: 'Resume Campaign' }).click();
  }

  async assertResumeDialogVisible(): Promise<void> {
    await expect(this.confirmDialog().getByRole('heading', { name: 'Resume Campaign?' })).toBeVisible({ timeout: 5000 });
  }

  async confirmResume(): Promise<void> {
    await this.confirmDialog().getByRole('button', { name: 'Resume', exact: true }).click();
  }

  async clickStopCampaign(name: string): Promise<void> {
    await this.row(name).getByRole('button', { name: 'Stop Campaign' }).click();
  }

  async assertStopDialogVisible(): Promise<void> {
    await expect(this.confirmDialog().getByRole('heading', { name: 'Stop Campaign?' })).toBeVisible({ timeout: 5000 });
  }

  async confirmStop(): Promise<void> {
    await this.confirmDialog().getByRole('button', { name: 'Stop', exact: true }).click();
  }

  async clickDeleteCampaign(name: string): Promise<void> {
    await this.row(name).getByRole('button', { name: 'Delete Campaign' }).click();
  }

  async assertDeleteDialogVisible(): Promise<void> {
    await expect(this.confirmDialog().getByRole('heading', { name: 'Delete Campaign?' })).toBeVisible({ timeout: 5000 });
  }

  async confirmDelete(): Promise<void> {
    await this.confirmDialog().getByRole('button', { name: 'Delete', exact: true }).click();
  }

  async cancelConfirmDialog(): Promise<void> {
    await this.confirmDialog().getByRole('button', { name: 'Cancel' }).click();
  }

  /** Polls (with fresh searches) until the campaign no longer appears in the results at all. */
  async assertCampaignRemoved(name: string): Promise<void> {
    await expect.poll(
      async () => {
        await this.searchByName(name);
        return (await this.frame.getByRole('cell', { name, exact: true }).count()) > 0;
      },
      { timeout: 30000, intervals: [500, 1000, 2000] }
    ).toBe(false);
  }

  // ─── Row getters — for live-vs-live comparison, never a hardcoded expected value ─

  /** Column order confirmed live: #, checkbox, Name, Start date, End date, Channels, Status, Entries, Actions. */
  async getRowStartDate(name: string): Promise<string> {
    return ((await this.row(name).getByRole('cell').nth(3).textContent()) ?? '').trim();
  }

  async getRowChannels(name: string): Promise<string> {
    return ((await this.row(name).getByRole('cell').nth(5).textContent()) ?? '').trim();
  }

  // ─── View Details dialog ────────────────────────────────────────────────────

  private viewDetailsDialog() {
    return this.frame.getByRole('dialog').first();
  }

  async clickViewDetails(name: string): Promise<void> {
    await this.row(name).getByRole('button', { name: 'View Details' }).click();
  }

  async assertViewDetailsVisible(): Promise<void> {
    await expect(this.viewDetailsDialog().getByRole('heading').first()).toBeVisible({ timeout: 10000 });
  }

  /**
   * The dialog heading combines the campaign name and its status as two
   * separate DOM nodes inside one heading (confirmed live: a bare text node
   * for the name, then a nested element for the status pill) — this splits
   * them apart by slicing the status off the END of the combined string,
   * never with a plain `.replace()` (found live: that strips the FIRST
   * occurrence of the status word anywhere in the string, corrupting names
   * that happen to contain it too, e.g. "P13N_..._ScheduledActions_...").
   */
  async getViewDetailsNameAndStatus(): Promise<{ name: string; status: string }> {
    const heading = this.viewDetailsDialog().getByRole('heading').first();
    const full = (await heading.textContent()) ?? '';
    const status = ((await heading.locator('> *').last().textContent()) ?? '').trim();
    const name = full.endsWith(status) ? full.slice(0, full.length - status.length).trim() : full.trim();
    return { name, status };
  }

  /** Each field is a "<h6 label>" + value pair sharing one wrapper — strips the label out of the wrapper's full text rather than assuming a fixed value position. */
  private async getViewDetailsField(label: string): Promise<string> {
    const labelHeading = this.viewDetailsDialog().getByRole('heading', { name: label, exact: true });
    const container = labelHeading.locator('xpath=..');
    const full = (await container.textContent()) ?? '';
    return full.replace(label, '').trim();
  }

  async getViewDetailsStartDate(): Promise<string> {
    return this.getViewDetailsField('Campaign start date & time (PST)');
  }

  async getViewDetailsEndDate(): Promise<string> {
    return this.getViewDetailsField('Campaign end date & time (PST)');
  }

  async getViewDetailsChannels(): Promise<string> {
    return this.getViewDetailsField('Channels');
  }

  async getViewDetailsDescription(): Promise<string> {
    return this.getViewDetailsField('Description');
  }

  /** Reads every field the View Details dialog shows, all captured live — never hardcoded. */
  async getAllViewDetails(): Promise<{
    name: string; status: string; startDate: string; endDate: string; channels: string; description: string;
  }> {
    const { name, status } = await this.getViewDetailsNameAndStatus();
    const startDate   = await this.getViewDetailsStartDate();
    const endDate      = await this.getViewDetailsEndDate();
    const channels     = await this.getViewDetailsChannels();
    const description  = await this.getViewDetailsDescription();
    return { name, status, startDate, endDate, channels, description };
  }

  async closeViewDetails(): Promise<void> {
    await this.viewDetailsDialog().getByRole('button', { name: 'Close' }).click();
  }
}
