import { test, expect, Browser, Page } from '@playwright/test';
import { SpacePage } from '../../pages/SpacePage';
import { TablesPage } from '../../pages/TablesPage';
import { config } from '../../config/config';

// ─── Timing helpers ───────────────────────────────────────────────────────────

const startTimes = new Map<string, number>();

test.beforeEach(async ({}, testInfo) => {
  startTimes.set(testInfo.testId, Date.now());
  console.log(`\n▶  STARTED  | ${testInfo.title}`);
});

test.afterEach(async ({}, testInfo) => {
  const duration = Date.now() - (startTimes.get(testInfo.testId) ?? Date.now());
  const status =
    testInfo.status === 'passed'  ? '✔  PASSED ' :
    testInfo.status === 'failed'  ? '✘  FAILED ' :
                                    '⚠  SKIPPED';
  console.log(`${status} | ${testInfo.title} (${duration}ms)`);
  if (testInfo.status === 'failed' && testInfo.error?.message) {
    console.log(`   Error: ${testInfo.error.message.split('\n')[0]}`);
  }
  startTimes.delete(testInfo.testId);
});

// ─── TC-TBL-001 to TC-TBL-009 | Tables Configuration ────────────────────────

test.describe('Tables Configuration', () => {
  let sharedPage: Page;
  let tablesPage: TablesPage;

  // Lifecycle variables — set in beforeAll so they survive Playwright worker retries
  let tableName: string;         // as typed in the form   e.g. "Automate_Table_1718..."
  let tableNameStored: string;   // as stored in the DB    e.g. "automate_table_1718..." (lowercased)
  let displayName: string;
  let updatedDisplayName: string;
  let initialCount: number;      // table count captured before creating the test table
  let creationSuccessMessage: string;

  test.beforeAll(async ({ browser }: { browser: Browser }, testInfo) => {
    testInfo.setTimeout(180000);
    const context = await browser.newContext({ storageState: 'auth/user.json' });
    sharedPage = await context.newPage();
    tablesPage = new TablesPage(sharedPage);

    const spacePage = new SpacePage(sharedPage, context);
    await spacePage.navigateToEntries(config.spaceId);
    await spacePage.openSpaceSidepanel();
    await spacePage.selectSpace(config.xeniaSpaceId, config.xeniaSpaceName);
    await spacePage.selectEnvironment('master');
    await spacePage.openAppsMenu(config.xeniaAppName);
    await spacePage.assertAppLoaded();

    await tablesPage.navigate();

    // Create the lifecycle test table here — beforeAll always runs fresh per worker,
    // so these variables are guaranteed to be defined even when a test retries.
    const ts = Date.now();
    tableName          = `Automate_Table_${ts}`;
    tableNameStored    = tableName.toLowerCase();
    displayName        = `Auto_Display_${ts}`;
    updatedDisplayName = `Auto_Display_${ts}_Updated`;

    initialCount = await tablesPage.getTableCount();
    await tablesPage.clickAddTable();
    await tablesPage.fillTableName(tableName);
    await tablesPage.fillDisplayName(displayName);
    creationSuccessMessage = await tablesPage.submitAndWait();
    await tablesPage.navigateToLastPage();
  });

  test.afterAll(async () => {
    await sharedPage.context().close();
  });

  // ── TC-TBL-001 ───────────────────────────────────────────────────────────────

  test('TC-TBL-001 | should display the Tables page with heading, Add button, and all 5 column headers', async () => {
    await tablesPage.assertPageElements();   // logs the heading to terminal
    await tablesPage.assertTableColumns();
    console.log(`\n  Tables page structure verified`);
  });

  // ── TC-TBL-002 ───────────────────────────────────────────────────────────────

  test('TC-TBL-002 | should open the Add table modal and display all required elements', async () => {
    await tablesPage.clickAddTable();
    await tablesPage.assertCreateModalVisible();
    console.log(`\n  Create modal elements:`);
    console.log(`    Modal heading  : "Add"`);
    console.log(`    Table name *   : visible`);
    console.log(`    Display name * : visible`);
    console.log(`    Save button    : visible`);
  });

  // ── TC-TBL-003 ───────────────────────────────────────────────────────────────

  test('TC-TBL-003 | should close the Add modal with the X button and return to the Tables page', async () => {
    await tablesPage.closeModal();
    await tablesPage.assertPageVisible();
    const heading = await tablesPage.getAndLogPageHeading();
    console.log(`\n  Modal closed — returned to Tables page`);
    console.log(`  Page heading after close : ${heading}`);
  });

  // ── TC-TBL-004 ───────────────────────────────────────────────────────────────

  test('TC-TBL-004 | should show validation errors for both fields when the form is submitted empty', async () => {
    await tablesPage.clickAddTable();
    await tablesPage.submitForm();
    const tableNameErr   = await tablesPage.getTableNameValidationError();
    const displayNameErr = await tablesPage.getDisplayNameValidationError();
    console.log(`\n  Validation errors (both fields empty):`);
    console.log(`    Table name error   : "${tableNameErr}" ✓`);
    console.log(`    Display name error : "${displayNameErr}" ✓`);
    await tablesPage.closeModal();
  });

  // ── TC-TBL-004B ──────────────────────────────────────────────────────────────

  test('TC-TBL-004B | should show display name validation error when only table name is filled', async () => {
    await tablesPage.clickAddTable();
    await tablesPage.fillTableName('Test_Validation');
    await tablesPage.submitForm();
    const displayNameErr = await tablesPage.getDisplayNameValidationError();
    console.log(`\n  Validation error (only table name filled):`);
    console.log(`    Display name error : "${displayNameErr}" ✓`);
    await tablesPage.closeModal();
  });

  // ── TC-TBL-004C ──────────────────────────────────────────────────────────────

  test('TC-TBL-004C | should show table name validation error when only display name is filled', async () => {
    await tablesPage.clickAddTable();
    await tablesPage.fillDisplayName('Test_Display_Validation');
    await tablesPage.submitForm();
    const tableNameErr = await tablesPage.getTableNameValidationError();
    console.log(`\n  Validation error (only display name filled):`);
    console.log(`    Table name error : "${tableNameErr}" ✓`);
    await tablesPage.closeModal();
  });

  // ── TC-TBL-005 ───────────────────────────────────────────────────────────────

  test('TC-TBL-005 | should create a new table and increase the table count by 1', async () => {
    // Table was created in beforeAll — verify the count increased by exactly 1
    const countAfter = await tablesPage.getTableCount();
    console.log(`\n  Table count before create : ${initialCount}`);
    console.log(`  Table count after create  : ${countAfter}`);
    expect(countAfter).toBe(initialCount + 1);
    expect(creationSuccessMessage).toBeTruthy();

    console.log(`\n  Table created`);
    console.log(`    Input name       : ${tableName}`);
    console.log(`    Stored name      : ${tableNameStored} (lowercased by app)`);
    console.log(`    Display name     : ${displayName}`);
    console.log(`    Count verified   : ${initialCount} → ${countAfter} (+1) ✓`);
    console.log(`    Success message  : "${creationSuccessMessage}" ✓`);
  });

  // ── TC-TBL-005B ──────────────────────────────────────────────────────────────

  test('TC-TBL-005B | should show success message but not increase count when creating with an existing table name', async () => {
    const countBefore = await tablesPage.getTableCount();
    await tablesPage.clickAddTable();
    await tablesPage.fillTableName(tableName);
    await tablesPage.fillDisplayName(displayName);
    const successMsg = await tablesPage.submitAndWait();
    const countAfter = await tablesPage.getTableCount();

    expect(successMsg).toBeTruthy();
    expect(countAfter).toBe(countBefore);

    console.log(`\n  Duplicate table name attempt:`);
    console.log(`    Table name       : ${tableName} (already exists)`);
    console.log(`    Display name     : ${displayName}`);
    console.log(`    Success message  : "${successMsg}" ✓`);
    console.log(`    Count before     : ${countBefore}`);
    console.log(`    Count after      : ${countAfter}`);
    console.log(`    Count unchanged  : ${countBefore} → ${countAfter} (no new table created) ✓`);
  });

  // ── TC-TBL-005C ──────────────────────────────────────────────────────────────

  test('TC-TBL-005C | should create a new table and increase count when using a new table name with an existing display name', async () => {
    await tablesPage.waitForNotificationGone();   // clear any lingering notification from TC-TBL-005B
    const newTableName = `Automate_DupDisp_${Date.now()}`;
    const countBefore = await tablesPage.getTableCount();
    await tablesPage.clickAddTable();
    await tablesPage.fillTableName(newTableName);
    await tablesPage.fillDisplayName(displayName);   // display names are not unique — two tables may share one
    const successMsg = await tablesPage.submitAndWait();
    await tablesPage.navigateToLastPage();
    const countAfter = await tablesPage.getTableCount();

    expect(successMsg).toBeTruthy();
    expect(countAfter).toBe(countBefore + 1);

    console.log(`\n  New table name with existing display name:`);
    console.log(`    New table name   : ${newTableName.toLowerCase()}`);
    console.log(`    Display name     : ${displayName} (shared — display names are not unique)`);
    console.log(`    Success message  : "${successMsg}" ✓`);
    console.log(`    Count before     : ${countBefore}`);
    console.log(`    Count after      : ${countAfter}`);
    console.log(`    Count increased  : ${countBefore} → ${countAfter} (+1) ✓`);
  });

  // ── TC-TBL-006 ───────────────────────────────────────────────────────────────

  test('TC-TBL-006 | should display the new table in the list with Inactive status and action elements', async () => {
    await tablesPage.navigateToLastPage();
    await tablesPage.assertTableInList(tableNameStored);
    const nameFromTable = await tablesPage.getTableNameFromCell(tableNameStored);
    await tablesPage.assertTableDisplayName(tableNameStored, displayName);
    await tablesPage.assertTableStatus(tableNameStored, 'Inactive');
    await tablesPage.assertActivateToggleVisible(tableNameStored);
    await tablesPage.assertEditButtonVisible(tableNameStored);

    console.log(`\n  Table in list:`);
    console.log(`    Name from table : ${nameFromTable} ✓`);
    console.log(`    Display name    : ${displayName} ✓`);
    console.log(`    Initial status  : Inactive ✓  (new tables always start as Inactive)`);
    console.log(`    Toggle button   : visible ✓`);
    console.log(`    Edit button     : visible ✓`);
  });

  // ── TC-TBL-007 ───────────────────────────────────────────────────────────────

  test('TC-TBL-007 | should cancel the activate toggle dialog and keep the table Inactive', async () => {
    await tablesPage.navigateToLastPage();
    await tablesPage.clickToggle(tableNameStored);
    await tablesPage.assertToggleConfirmDialog();
    console.log(`\n  Confirmation dialog: Cancel and Confirm buttons visible`);
    await tablesPage.cancelToggle();
    await tablesPage.assertTableStatus(tableNameStored, 'Inactive');
    console.log(`  Toggle cancelled — status remains: Inactive ✓`);
  });

  // ── TC-TBL-008 ───────────────────────────────────────────────────────────────

  test('TC-TBL-008 | should confirm the activate toggle and change table status to Active', async () => {
    await tablesPage.navigateToLastPage();
    await tablesPage.clickToggle(tableNameStored);
    await tablesPage.assertToggleConfirmDialog();
    await tablesPage.confirmToggle();
    await tablesPage.navigateToLastPage();
    await tablesPage.assertTableStatus(tableNameStored, 'Active');
    console.log(`\n  Toggle confirmed — status changed to: Active ✓`);
  });

  // ── TC-TBL-010 ───────────────────────────────────────────────────────────────

  test('TC-TBL-010 | should cancel the deactivate dialog and keep the table Active', async () => {
    await tablesPage.navigateToLastPage();
    await tablesPage.assertTableStatus(tableNameStored, 'Active');
    await tablesPage.clickDeactivateToggle(tableNameStored);
    await tablesPage.assertToggleConfirmDialog();
    console.log(`\n  Confirmation dialog: No and Yes buttons visible`);
    await tablesPage.cancelToggle();
    await tablesPage.assertTableStatus(tableNameStored, 'Active');
    console.log(`  Deactivate cancelled — status remains: Active ✓`);
  });

  // ── TC-TBL-011 ───────────────────────────────────────────────────────────────

  test('TC-TBL-011 | should close the deactivate dialog with X icon and keep the table Active', async () => {
    await tablesPage.navigateToLastPage();
    await tablesPage.clickDeactivateToggle(tableNameStored);
    await tablesPage.assertToggleConfirmDialog();
    await tablesPage.closeToggleDialog();
    await tablesPage.assertTableStatus(tableNameStored, 'Active');
    console.log(`\n  Dialog closed with X — status remains: Active ✓`);
  });

  // ── TC-TBL-012 ───────────────────────────────────────────────────────────────

  test('TC-TBL-012 | should confirm the deactivate toggle and change table status to Inactive', async () => {
    await tablesPage.navigateToLastPage();
    await tablesPage.clickDeactivateToggle(tableNameStored);
    await tablesPage.assertToggleConfirmDialog();
    await tablesPage.confirmDeactivate();
    await tablesPage.navigateToLastPage();
    await tablesPage.assertTableStatus(tableNameStored, 'Inactive');
    await tablesPage.assertActivateToggleVisible(tableNameStored);
    console.log(`\n  Deactivate confirmed — status changed to: Inactive ✓`);
  });

  // ── TC-TBL-013 ───────────────────────────────────────────────────────────────

  test('TC-TBL-013 | should close the activate dialog with X icon and keep the table Inactive', async () => {
    await tablesPage.navigateToLastPage();
    await tablesPage.clickToggle(tableNameStored);
    await tablesPage.assertToggleConfirmDialog();
    await tablesPage.closeToggleDialog();
    await tablesPage.assertTableStatus(tableNameStored, 'Inactive');
    console.log(`\n  Dialog closed with X — status remains: Inactive ✓`);
  });

  // ── TC-TBL-009 ───────────────────────────────────────────────────────────────

  test('TC-TBL-009 | should edit the table display name and verify the update (status resets to Inactive after edit)', async () => {
    await tablesPage.navigateToLastPage();
    await tablesPage.clickEditTable(tableNameStored);
    await tablesPage.assertUpdateModalVisible();
    await tablesPage.assertTableNameDisabled();
    console.log(`\n  Update modal opened:`);
    console.log(`    Modal heading      : "Update"`);
    console.log(`    Table name field   : disabled (read-only — cannot be changed) ✓`);
    console.log(`    Display name field : visible and editable ✓`);

    await tablesPage.updateDisplayName(updatedDisplayName);
    await tablesPage.submitAndWait();
    await tablesPage.navigateToLastPage();

    await tablesPage.assertTableInList(tableNameStored);
    await tablesPage.assertTableDisplayName(tableNameStored, updatedDisplayName);
    await tablesPage.assertTableStatus(tableNameStored, 'Inactive');

    console.log(`  Display name updated : ${updatedDisplayName} ✓`);
    console.log(`  Status after edit    : Inactive ✓  (app resets status on edit)`);
  });

  // ── TC-TBL-014 ───────────────────────────────────────────────────────────────

  test('TC-TBL-014 | should open the search filter and display the search UI elements', async () => {
    await tablesPage.navigateToLastPage();
    await tablesPage.openSearch();
    await tablesPage.assertSearchVisible();
    console.log(`\n  Search UI elements:`);
    console.log(`    "Table name" label : visible`);
    console.log(`    Search input       : visible`);
    console.log(`    Go button          : visible`);
  });

  // ── TC-TBL-015 ───────────────────────────────────────────────────────────────

  test('TC-TBL-015 | should return matching result when searching by exact table name', async () => {
    await tablesPage.searchTableName(tableNameStored);
    await tablesPage.assertTableInList(tableNameStored);
    console.log(`\n  Search by exact name:`);
    console.log(`    Search term : "${tableNameStored}"`);
    console.log(`    Result      : matching row visible ✓`);
  });

  // ── TC-TBL-016 ───────────────────────────────────────────────────────────────

  test('TC-TBL-016 | should show "No records found" when searching with a non-matching name', async () => {
    await tablesPage.searchTableName('zzz_no_match_xyz');
    await tablesPage.assertNoResultsFound();
    console.log(`\n  Search with non-matching name:`);
    console.log(`    Search term : "zzz_no_match_xyz"`);
    console.log(`    Result      : "No records found" ✓`);
  });

  // ── TC-TBL-017 ───────────────────────────────────────────────────────────────

  test('TC-TBL-017 | should show "No records found" when searching by display name', async () => {
    await tablesPage.searchTableName(updatedDisplayName);
    await tablesPage.assertNoResultsFound();
    console.log(`\n  Search by display name (not supported):`);
    console.log(`    Search term : "${updatedDisplayName}"`);
    console.log(`    Result      : "No records found" ✓  (only table name is searchable)`);
  });

  // ── TC-TBL-018 ───────────────────────────────────────────────────────────────

  test('TC-TBL-018 | should return matching results when searching by partial table name', async () => {
    const partial = tableNameStored.slice(0, 15);   // e.g. "automate_table_"
    await tablesPage.searchTableName(partial);
    await tablesPage.assertTableInList(tableNameStored);
    console.log(`\n  Search by partial name:`);
    console.log(`    Search term : "${partial}" (first 15 chars of table name)`);
    console.log(`    Result      : lifecycle table visible in results ✓`);
  });

  // ── TC-TBL-019 ───────────────────────────────────────────────────────────────

  test('TC-TBL-019 | should show "No records found" when searching with incorrect case (case-sensitive)', async () => {
    const upperName = tableNameStored.toUpperCase();
    await tablesPage.searchTableName(upperName);
    await tablesPage.assertNoResultsFound();
    console.log(`\n  Case-sensitive search:`);
    console.log(`    Search term : "${upperName}"`);
    console.log(`    Result      : "No records found" ✓  (search is case-sensitive)`);
  });
});
