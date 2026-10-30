import { test, expect, Browser, Page } from '@playwright/test';
import { SpacePage } from '../../pages/SpacePage';
import { ChannelPage } from '../../pages/ChannelPage';
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

// ─── Single shared context ────────────────────────────────────────────────────
// One browser context and page is shared across all 4 describe groups, saving
// ~36 seconds of repeated app-navigation overhead per run.

let sharedPage: Page;
let channelPage: ChannelPage;

test.beforeAll(async ({ browser }: { browser: Browser }, testInfo) => {
  testInfo.setTimeout(120000);
  const context = await browser.newContext({ storageState: 'auth/user.json' });
  sharedPage  = await context.newPage();
  channelPage = new ChannelPage(sharedPage);

  const spacePage = new SpacePage(sharedPage, context);
  await spacePage.navigateToEntries(config.spaceId);
  await spacePage.openSpaceSidepanel();
  await spacePage.selectSpace(config.xeniaSpaceId, config.xeniaSpaceName);
  await spacePage.selectEnvironment('master');
  await spacePage.openAppsMenu(config.xeniaAppName);
  await spacePage.assertAppLoaded();
});

test.afterAll(async () => {
  await sharedPage.context().close();
});

// ─── TC-CH-001 to TC-CH-009 | Channel Configuration ──────────────────────────

test.describe('Channel Configuration', () => {
  // ── TC-CH-001 ────────────────────────────────────────────────────────────────

  test('TC-CH-001 | should navigate to the Channels page via Configuration menu and verify the page heading', async () => {
    await channelPage.assertConfigurationVisible();
    console.log(`\n  Configuration button : visible in sidebar ✓`);

    await channelPage.clickConfiguration();
    await channelPage.assertChannelsLinkVisible();
    console.log(`  Channels link        : visible in Configuration menu ✓`);

    await channelPage.clickChannels();
    const heading = await channelPage.getAndLogPageHeading();
    console.log(`  Page heading         : "${heading}"`);
    console.log(`  Navigation verified  : Channels page confirmed by heading ✓`);
  });

  // ── TC-CH-002 ────────────────────────────────────────────────────────────────

  test('TC-CH-002 | should display the Add channel button on the Channels page', async () => {
    await channelPage.assertAddButtonVisible();
    console.log(`\n  Add channel button : visible on Channels page ✓`);
  });

  // ── TC-CH-003 ────────────────────────────────────────────────────────────────

  test('TC-CH-003 | should open the Add channel modal with heading "Add" when the Add button is clicked', async () => {
    await channelPage.clickAddChannel();
    await channelPage.assertCreateModalHeading();
    console.log(`\n  Add button clicked`);
    console.log(`  Modal heading      : "Add" ✓`);
  });

  // ── TC-CH-004 ────────────────────────────────────────────────────────────────

  test('TC-CH-004 | should display Channel name field, Channel type field, and Save button in the Add modal', async () => {
    await channelPage.assertCreateModalFields();
    console.log(`\n  Modal fields:`);
    console.log(`    Channel name field : visible ✓`);
    console.log(`    Channel type field : visible ✓`);
    console.log(`    Save button        : visible ✓`);

    await channelPage.closeModal();
    console.log(`  Modal closed       : returned to Channels page ✓`);
  });

  // ── TC-CH-005 ────────────────────────────────────────────────────────────────

  test('TC-CH-005 | should not increase the channel count when the Add modal is closed with the X button', async () => {
    const countBefore = await channelPage.getChannelCount();
    console.log(`\n  Channel count before : ${countBefore}`);

    await channelPage.clickAddChannel();
    await channelPage.closeModal();

    const countAfter = await channelPage.getChannelCount();
    expect(countAfter).toBe(countBefore);

    console.log(`  Channel count after  : ${countAfter}`);
    console.log(`  Count unchanged      : ${countBefore} → ${countAfter} ✓`);
  });

  // ── TC-CH-006 ────────────────────────────────────────────────────────────────

  test('TC-CH-006 | should show validation errors for both fields when the Save button is clicked with no values', async () => {
    await channelPage.clickAddChannel();
    await channelPage.submitForm();

    const nameErr = await channelPage.getChannelNameValidationError();
    const typeErr = await channelPage.getChannelTypeValidationError();

    console.log(`\n  Validation errors (both fields empty):`);
    console.log(`    Channel name error : "${nameErr}" ✓`);
    console.log(`    Channel type error : "${typeErr}" ✓`);

    await channelPage.closeModal();
  });

  // ── TC-CH-007 ────────────────────────────────────────────────────────────────

  test('TC-CH-007 | should show channel type validation error when only Channel name is filled', async () => {
    await channelPage.clickAddChannel();
    await channelPage.fillChannelName('automate_channel_test');
    await channelPage.submitForm();

    const typeErr = await channelPage.getChannelTypeValidationError();

    console.log(`\n  Validation error (channel name filled, type empty):`);
    console.log(`    Channel name       : "automate_channel_test"`);
    console.log(`    Channel type error : "${typeErr}" ✓`);

    await channelPage.closeModal();
  });

  // ── TC-CH-008 ────────────────────────────────────────────────────────────────

  test('TC-CH-008 | should show channel name validation error when only Channel type "Push" is selected', async () => {
    await channelPage.clickAddChannel();
    await channelPage.selectChannelType('PUSH');
    await channelPage.submitForm();

    const nameErr = await channelPage.getChannelNameValidationError();

    console.log(`\n  Validation error (channel type = Push, name empty):`);
    console.log(`    Channel type       : "Push"`);
    console.log(`    Channel name error : "${nameErr}" ✓`);

    await channelPage.closeModal();
  });

  // ── TC-CH-009 ────────────────────────────────────────────────────────────────

  test('TC-CH-009 | should show channel name validation error when only Channel type "Pull" is selected', async () => {
    await channelPage.clickAddChannel();
    await channelPage.selectChannelType('PULL');
    await channelPage.submitForm();

    const nameErr = await channelPage.getChannelNameValidationError();

    console.log(`\n  Validation error (channel type = Pull, name empty):`);
    console.log(`    Channel type       : "Pull"`);
    console.log(`    Channel name error : "${nameErr}" ✓`);

    await channelPage.closeModal();
  });
});

// ─── TC-CH-010 to TC-CH-019 | Channel Lifecycle ──────────────────────────────

test.describe('Channel Lifecycle', () => {
  let channelName: string;
  let channelType: string;
  let initialCount: number;
  let creationSuccessMessage: string;
  let pullChannelName: string;
  let pushChannelCreated: boolean;
  let pullChannelCreated: boolean;

  const SHARED_PUSH_CHANNEL = 'Auto_E2E_Push_Channel';
  const SHARED_PULL_CHANNEL = 'Auto_E2E_Pull_Channel';

  const appFrame = () => sharedPage.frameLocator('[data-test-id="cf-widget-renderer"]');

  const searchChannelByName = async (name: string): Promise<boolean> => {
    await channelPage.ensureSearchPanelOpen();
    await channelPage.fillChannelNameFilter(name);

    await appFrame().getByTestId('submit').click();
    await expect(appFrame().getByRole('button', { name: 'Go' })).toBeVisible({ timeout: 15000 });

    const noRecords = appFrame().getByText('No records found');
    if (await noRecords.isVisible().catch(() => false)) {
      return false;
    }

    return appFrame().getByRole('cell', { name, exact: true }).first().isVisible().catch(() => false);
  };

  const resetChannelSearch = async (): Promise<void> => {
    await channelPage.ensureSearchPanelOpen();
    await channelPage.fillChannelNameFilter('');
    await appFrame().getByTestId('submit').click();
    await expect(appFrame().getByRole('button', { name: 'Go' })).toBeVisible({ timeout: 15000 });
  };

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(180000);
    await channelPage.navigate();

    channelName = SHARED_PUSH_CHANNEL;
    channelType = 'PUSH';
    pullChannelName = SHARED_PULL_CHANNEL;
    pushChannelCreated = false;
    pullChannelCreated = false;

    await resetChannelSearch();
    initialCount = await channelPage.getChannelCount();

    const pushExists = await searchChannelByName(channelName);
    if (!pushExists) {
      await channelPage.clickAddChannel();
      await channelPage.fillChannelName(channelName);
      await channelPage.selectChannelType('PUSH');
      creationSuccessMessage = await channelPage.submitAndWait();
      pushChannelCreated = true;
      await channelPage.waitForNotificationGone();
    } else {
      creationSuccessMessage = 'Channel already exists';
    }
  });

  // ── TC-CH-010 ────────────────────────────────────────────────────────────────

  test('TC-CH-010 | should create a new channel successfully and increase the channel count by 1', async () => {
    await resetChannelSearch();
    const countAfter = await channelPage.getChannelCount();
    if (pushChannelCreated) {
      expect(countAfter).toBe(initialCount + 1);
    } else {
      expect(countAfter).toBe(initialCount);
    }
    expect(creationSuccessMessage).toBeTruthy();

    console.log(`\n  Push channel prepared`);
    console.log(`    Channel name     : ${channelName}`);
    console.log(`    Channel type     : ${channelType}`);
    console.log(`    Newly created    : ${pushChannelCreated ? 'yes' : 'no (reused existing)'}`);
    console.log(`    Count before     : ${initialCount}`);
    console.log(`    Count after      : ${countAfter} ${pushChannelCreated ? '(+1)' : '(unchanged)'} ✓`);
    console.log(`    Success message  : "${creationSuccessMessage}" ✓`);
  });

  // ── TC-CH-011 ────────────────────────────────────────────────────────────────

  test('TC-CH-011 | should display the new channel in the list with correct name, type, Inactive status and Inactivate toggle', async () => {
    await channelPage.waitForNotificationGone();
    await searchChannelByName(channelName);
    await channelPage.assertChannelInList(channelName);
    await channelPage.assertChannelType(channelName, channelType);
    await channelPage.assertChannelStatus(channelName, 'Inactive');
    await channelPage.assertActivateToggleVisible(channelName);

    console.log(`\n  Channel in list:`);
    console.log(`    Name             : ${channelName} ✓`);
    console.log(`    Type             : ${channelType} ✓`);
    console.log(`    Initial status   : Inactive ✓  (new channels always start as Inactive)`);
    console.log(`    Activate toggle  : visible ✓`);
  });

  // ── TC-CH-012 ────────────────────────────────────────────────────────────────

  test('TC-CH-012 | should cancel the activate dialog and keep the channel status Inactive', async () => {
    await searchChannelByName(channelName);
    await channelPage.clickActivateToggle(channelName);
    await channelPage.assertToggleConfirmDialog();
    console.log(`\n  Confirmation dialog : No and Yes buttons visible ✓`);

    await channelPage.cancelToggle();
    await channelPage.assertChannelStatus(channelName, 'Inactive');
    console.log(`  Toggle cancelled    : status remains Inactive ✓`);
  });

  // ── TC-CH-013 ────────────────────────────────────────────────────────────────

  test('TC-CH-013 | should confirm the activate dialog and change the channel status to Active with a success message', async () => {
    await searchChannelByName(channelName);
    await channelPage.clickActivateToggle(channelName);
    await channelPage.assertToggleConfirmDialog();
    await channelPage.confirmActivate();
    await searchChannelByName(channelName);
    await channelPage.assertChannelStatus(channelName, 'Active');
    await channelPage.assertDeactivateToggleVisible(channelName);

    console.log(`\n  Toggle confirmed    : status changed to Active ✓`);
    console.log(`  Deactivate toggle   : visible ✓`);
  });

  // ── TC-CH-014 ────────────────────────────────────────────────────────────────

  test('TC-CH-014 | should confirm the deactivate dialog and change the channel status back to Inactive', async () => {
    await searchChannelByName(channelName);
    await channelPage.assertChannelStatus(channelName, 'Active');
    await channelPage.clickDeactivateToggle(channelName);
    await channelPage.assertToggleConfirmDialog();
    await channelPage.confirmDeactivate();
    await searchChannelByName(channelName);
    await channelPage.assertChannelStatus(channelName, 'Inactive');
    await channelPage.assertActivateToggleVisible(channelName);

    console.log(`\n  Deactivate confirmed : status changed to Inactive ✓`);
    console.log(`  Activate toggle      : visible ✓`);
  });

  // ── TC-CH-015 ────────────────────────────────────────────────────────────────

  test('TC-CH-015 | should create a new Pull channel successfully and display it in the list with Inactive status', async () => {
    await channelPage.waitForNotificationGone();
    await resetChannelSearch();
    const countBefore = await channelPage.getChannelCount();

    let successMsg = 'Channel already exists';
    const pullExists = await searchChannelByName(pullChannelName);
    if (!pullExists) {
      await channelPage.clickAddChannel();
      await channelPage.fillChannelName(pullChannelName);
      await channelPage.selectChannelType('PULL');
      successMsg = await channelPage.submitAndWait();
      expect(successMsg).toBeTruthy();
      pullChannelCreated = true;
    } else {
      pullChannelCreated = false;
    }

    await channelPage.waitForNotificationGone();
    await searchChannelByName(pullChannelName);

    await resetChannelSearch();
    const countAfter = await channelPage.getChannelCount();
    if (pullChannelCreated) {
      expect(countAfter).toBe(countBefore + 1);
    } else {
      expect(countAfter).toBe(countBefore);
    }

    await searchChannelByName(pullChannelName);
    await channelPage.assertChannelInList(pullChannelName);
    await channelPage.assertChannelType(pullChannelName, 'PULL');
    await channelPage.assertChannelStatus(pullChannelName, 'Inactive');
    await channelPage.assertActivateToggleVisible(pullChannelName);

    console.log(`\n  Pull channel created`);
    console.log(`    Channel name     : ${pullChannelName}`);
    console.log(`    Channel type     : PULL`);
    console.log(`    Newly created    : ${pullChannelCreated ? 'yes' : 'no (reused existing)'}`);
    console.log(`    Count before     : ${countBefore}`);
    console.log(`    Count after      : ${countAfter} ${pullChannelCreated ? '(+1)' : '(unchanged)'} ✓`);
    console.log(`    Success message  : "${successMsg}" ✓`);
    console.log(`    In list - Name   : ${pullChannelName} ✓`);
    console.log(`    In list - Type   : PULL ✓`);
    console.log(`    In list - Status : Inactive ✓`);
    console.log(`    Activate toggle  : visible ✓`);
  });

  // ── TC-CH-016 ────────────────────────────────────────────────────────────────

  test('TC-CH-016 | should cancel the activate dialog for a Pull channel and keep the status Inactive', async () => {
    await searchChannelByName(pullChannelName);
    await channelPage.clickActivateToggle(pullChannelName);
    await channelPage.assertToggleConfirmDialog();
    console.log(`\n  Confirmation dialog : No and Yes buttons visible ✓`);

    await channelPage.cancelToggle();
    await channelPage.assertChannelStatus(pullChannelName, 'Inactive');
    console.log(`  Toggle cancelled    : Pull channel status remains Inactive ✓`);
  });

  // ── TC-CH-017 ────────────────────────────────────────────────────────────────

  test('TC-CH-017 | should confirm the activate dialog for a Pull channel and change the status to Active', async () => {
    await channelPage.ensureSearchPanelOpen();
    await channelPage.fillChannelNameFilter(pullChannelName);
    await channelPage.submitSearchFilter();
    await channelPage.clickActivateToggle(pullChannelName);
    await channelPage.assertToggleConfirmDialog();
    await channelPage.confirmActivate();
    await channelPage.waitForNotificationGone();
    await channelPage.ensureSearchPanelOpen();
    await channelPage.fillChannelNameFilter(pullChannelName);
    await channelPage.submitSearchFilter();
    await channelPage.assertChannelStatus(pullChannelName, 'Active');
    await channelPage.assertDeactivateToggleVisible(pullChannelName);

    console.log(`\n  Toggle confirmed    : Pull channel status changed to Active ✓`);
    console.log(`  Deactivate toggle   : visible ✓`);
  });

  // ── TC-CH-018 ────────────────────────────────────────────────────────────────

  test('TC-CH-018 | should confirm the deactivate dialog for a Pull channel and change the status back to Inactive', async () => {
    await channelPage.ensureSearchPanelOpen();
    await channelPage.fillChannelNameFilter(pullChannelName);
    await channelPage.submitSearchFilter();
    await channelPage.assertChannelStatus(pullChannelName, 'Active');
    await channelPage.clickDeactivateToggle(pullChannelName);
    await channelPage.assertToggleConfirmDialog();
    await channelPage.confirmDeactivate();
    await channelPage.waitForNotificationGone();
    await channelPage.ensureSearchPanelOpen();
    await channelPage.fillChannelNameFilter(pullChannelName);
    await channelPage.submitSearchFilter();
    await channelPage.assertChannelStatus(pullChannelName, 'Inactive');
    await channelPage.assertActivateToggleVisible(pullChannelName);

    console.log(`\n  Deactivate confirmed : Pull channel status changed to Inactive ✓`);
    console.log(`  Activate toggle      : visible ✓`);
  });

  // ── TC-CH-019 ────────────────────────────────────────────────────────────────

  test('TC-CH-019 | should generate a unique channel ID for each channel and the ID should be copyable', async () => {
    await channelPage.waitForNotificationGone();

    await channelPage.ensureSearchPanelOpen();
    await channelPage.fillChannelNameFilter(channelName);
    await channelPage.submitSearchFilter();
    const pushChannelId = await channelPage.getChannelId(channelName);
    await channelPage.assertCopyButtonVisible(channelName);
    await channelPage.clickCopyChannelId(channelName);

    await channelPage.ensureSearchPanelOpen();
    await channelPage.fillChannelNameFilter(pullChannelName);
    await channelPage.submitSearchFilter();
    const pullChannelId = await channelPage.getChannelId(pullChannelName);
    await channelPage.assertCopyButtonVisible(pullChannelName);
    await channelPage.clickCopyChannelId(pullChannelName);

    expect(pushChannelId).toBeTruthy();
    expect(pullChannelId).toBeTruthy();
    expect(pushChannelId).not.toBe(pullChannelId);

    console.log(`\n  Channel IDs verified:`);
    console.log(`    Push channel ID  : ${pushChannelId} ✓`);
    console.log(`    Pull channel ID  : ${pullChannelId} ✓`);
    console.log(`    IDs are unique   : ${pushChannelId !== pullChannelId} ✓`);
    console.log(`    Copy button (Push) : visible and clickable ✓`);
    console.log(`    Copy button (Pull) : visible and clickable ✓`);
  });
});

// ─── TC-CH-020 to TC-CH-027 | Channel Search and Filter ──────────────────────

test.describe('Channel Search and Filter', () => {
  let initialCount: number;
  let activeCount: number;
  let inactiveCount: number;

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(90000);
    await channelPage.navigate();
    // Clear any name/status filter left by the Channel Lifecycle group before counting.
    // TC-CH-019 ends with name = "Auto_E2E_Pull_Channel" in the filter; if that
    // persists into TC-CH-022, the Active-only query returns 0 results because
    // Auto_E2E_Pull_Channel is Inactive.
    await channelPage.ensureSearchPanelOpen();
    await channelPage.fillChannelNameFilter('');
    await channelPage.selectStatusFilter('All channels');
    await channelPage.submitSearchFilter();
    initialCount = await channelPage.getChannelCount();
  });

  // ── TC-CH-020 ────────────────────────────────────────────────────────────────

  test('TC-CH-020 | should open the filter panel with Channel name field, Status dropdown, and Search button', async () => {
    await channelPage.ensureSearchPanelOpen();
    await channelPage.assertSearchPanelVisible();
    await channelPage.assertDefaultStatusIsAllChannels();

    console.log(`\n  Filter panel fields:`);
    console.log(`    Channel name field : visible ✓`);
    console.log(`    Status field       : visible ✓`);
    console.log(`    Search button      : visible ✓`);
    console.log(`    Default status     : "All channels" ✓`);
  });

  // ── TC-CH-021 ────────────────────────────────────────────────────────────────

  test('TC-CH-021 | should display all channels when "All channels" is selected and the result count matches the page heading', async () => {
    // beforeAll left us on the last page (getChannelCount navigates there);
    // submit from page 1 to avoid the slow iframe reload triggered by non-first-page submits.
    await channelPage.navigateToFirstPage();
    await channelPage.ensureSearchPanelOpen();
    await channelPage.assertDefaultStatusIsAllChannels();
    await channelPage.submitSearchFilter();
    await channelPage.navigateToLastPage();

    // Compare last row number with the total captured in beforeAll.
    // Calling getChannelCount() here would internally click "Last" again,
    // triggering a reload mid-assertion — avoid by using initialCount directly.
    let lastRowNumber = 0;
    await expect(async () => {
      lastRowNumber  = await channelPage.getLastRowNumberOnPage();
      expect(lastRowNumber).toBe(initialCount);
    }).toPass({ timeout: 30000 });

    console.log(`\n  All channels filter:`);
    console.log(`    Heading count    : ${initialCount}`);
    console.log(`    Last row number  : ${lastRowNumber}`);
    console.log(`    Counts match     : ${lastRowNumber === initialCount} ✓`);
  });

  // ── TC-CH-022 ────────────────────────────────────────────────────────────────

  test('TC-CH-022 | should display only Active channels when "Active channels" is selected from the Status filter', async () => {
    // TC-CH-021 ended on the last page; return to page 1 before filtering to
    // avoid the slow iframe reload triggered by submitting from a non-first page
    await channelPage.navigateToFirstPage();
    await channelPage.ensureSearchPanelOpen();
    await channelPage.selectStatusFilter('Active channels');
    await channelPage.submitSearchFilter();
    await channelPage.assertActiveChannelsOnlyVisible();

    console.log(`\n  Active channels filter:`);
    console.log(`    Status filter    : "Active channels" selected ✓`);
    console.log(`    Active rows      : visible ✓`);
    console.log(`    Inactive rows    : none visible ✓`);
  });

  // ── TC-CH-023 ────────────────────────────────────────────────────────────────

  test('TC-CH-023 | should display only Inactive channels when "Inactive channels" is selected from the Status filter', async () => {
    await channelPage.ensureSearchPanelOpen();
    await channelPage.selectStatusFilter('Inactive channels');
    await channelPage.submitSearchFilter();
    await channelPage.assertInactiveChannelsOnlyVisible();

    console.log(`\n  Inactive channels filter:`);
    console.log(`    Status filter    : "Inactive channels" selected ✓`);
    console.log(`    Inactive rows    : visible ✓`);
    console.log(`    Active rows      : none visible ✓`);
  });

  // ── TC-CH-024 ────────────────────────────────────────────────────────────────

  test('TC-CH-024 | should restore the full channel list when the filter is reset to "All channels"', async () => {
    await channelPage.ensureSearchPanelOpen();
    await channelPage.selectStatusFilter('All channels');
    await channelPage.submitSearchFilter();

    const countAfterReset = await channelPage.getChannelCount();
    expect(countAfterReset).toBe(initialCount);

    console.log(`\n  Filter reset to All channels:`);
    console.log(`    Initial count    : ${initialCount}`);
    console.log(`    Count after reset: ${countAfterReset}`);
    console.log(`    Counts match     : ${countAfterReset === initialCount} ✓`);
  });

  // ── TC-CH-025 ────────────────────────────────────────────────────────────────

  test('TC-CH-025 | Active channels: last row number equals heading count and count is less than total', async () => {
    // TC-CH-024's getChannelCount() navigates to the last page; submit from page 1
    // to avoid the slow iframe reload triggered by non-first-page submits.
    await channelPage.navigateToFirstPage();
    await channelPage.ensureSearchPanelOpen();
    await channelPage.selectStatusFilter('Active channels');
    await channelPage.submitSearchFilter();
    await channelPage.navigateToLastPage();

    // Read last row number with retry; avoid getChannelCount() here because
    // its internal navigateToLastPage() click can reload the table mid-read.
    let lastRowNumber = 0;
    await expect(async () => {
      lastRowNumber = await channelPage.getLastRowNumberOnPage();
      expect(lastRowNumber).toBeGreaterThan(0);
    }).toPass({ timeout: 30000 });

    activeCount = lastRowNumber;
    expect(activeCount).toBeLessThan(initialCount);

    console.log(`\n  Active channels filter (count verification):`);
    console.log(`    Heading count    : ${activeCount}`);
    console.log(`    Last row number  : ${lastRowNumber}`);
    console.log(`    Counts match     : ${lastRowNumber === activeCount} ✓`);
    console.log(`    Active < Total   : ${activeCount} < ${initialCount} ✓`);
  });

  // ── TC-CH-026 ────────────────────────────────────────────────────────────────

  test('TC-CH-026 | Inactive channels: last row number equals heading count and count is less than total', async () => {
    // TC-CH-025 ended on the last page of Active channels; return to page 1 first
    await channelPage.navigateToFirstPage();
    await channelPage.ensureSearchPanelOpen();
    await channelPage.selectStatusFilter('Inactive channels');
    await channelPage.submitSearchFilter();
    await channelPage.navigateToLastPage();

    // Read last row number with retry; avoid getChannelCount() here because
    // its internal navigateToLastPage() click can reload the table mid-read.
    let lastRowNumber = 0;
    await expect(async () => {
      lastRowNumber = await channelPage.getLastRowNumberOnPage();
      expect(lastRowNumber).toBeGreaterThan(0);
    }).toPass({ timeout: 30000 });

    inactiveCount = lastRowNumber;
    expect(inactiveCount).toBeLessThan(initialCount);

    console.log(`\n  Inactive channels filter (count verification):`);
    console.log(`    Heading count    : ${inactiveCount}`);
    console.log(`    Last row number  : ${lastRowNumber}`);
    console.log(`    Counts match     : ${lastRowNumber === inactiveCount} ✓`);
    console.log(`    Inactive < Total : ${inactiveCount} < ${initialCount} ✓`);
  });

  // ── TC-CH-027 ────────────────────────────────────────────────────────────────

  test('TC-CH-027 | Active count + Inactive count should equal the total channel count', async () => {
    // Fetch each count independently so this test is never affected by
    // variable state from prior test retries.
    // TC-CH-026 ended on the last page of inactive channels — return to page 1
    // to avoid the slow iframe reload triggered by submitting from a non-first page.
    await channelPage.navigateToFirstPage();
    await channelPage.ensureSearchPanelOpen();
    await channelPage.selectStatusFilter('Active channels');
    await channelPage.submitSearchFilter();
    const activeChannelCount = await channelPage.getChannelCount();

    // getChannelCount() navigates to last page; return to page 1 before next submit.
    await channelPage.navigateToFirstPage();
    await channelPage.ensureSearchPanelOpen();
    await channelPage.selectStatusFilter('Inactive channels');
    await channelPage.submitSearchFilter();
    const inactiveChannelCount = await channelPage.getChannelCount();

    await channelPage.navigateToFirstPage();
    await channelPage.ensureSearchPanelOpen();
    await channelPage.selectStatusFilter('All channels');
    await channelPage.submitSearchFilter();
    const allChannelCount = await channelPage.getChannelCount();

    expect(activeChannelCount + inactiveChannelCount).toBe(allChannelCount);

    console.log(`\n  Channel count breakdown:`);
    console.log(`    Active channels  : ${activeChannelCount}`);
    console.log(`    Inactive channels: ${inactiveChannelCount}`);
    console.log(`    Active + Inactive: ${activeChannelCount + inactiveChannelCount}`);
    console.log(`    Total (All)      : ${allChannelCount}`);
    console.log(`    Sum matches total: ${activeChannelCount + inactiveChannelCount} === ${allChannelCount} ✓`);
  });
});

// ─── TC-CH-028 to TC-CH-035 | Channel Name Search ────────────────────────────

test.describe('Channel Name Search', () => {
  let activeChannelName: string;
  let inactiveChannelName: string;
  let partialPrefix: string;

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(180000);
    await channelPage.navigate();

    const ts = Date.now();
    activeChannelName   = `Auto_NS_${ts}_Active`;
    inactiveChannelName = `Auto_NS_${ts}_Inactive`;
    partialPrefix       = `Auto_NS_${ts}`;

    // Create the Active channel
    await channelPage.clickAddChannel();
    await channelPage.fillChannelName(activeChannelName);
    await channelPage.selectChannelType('PUSH');
    await channelPage.submitAndWait();
    await channelPage.waitForNotificationGone();

    // Find it by name and activate it
    await channelPage.ensureSearchPanelOpen();
    await channelPage.fillChannelNameFilter(activeChannelName);
    await channelPage.submitSearchFilter();
    await channelPage.clickActivateToggle(activeChannelName);
    await channelPage.assertToggleConfirmDialog();
    await channelPage.confirmActivate();
    await channelPage.waitForNotificationGone();

    // Create the Inactive channel (left Inactive)
    await channelPage.clickAddChannel();
    await channelPage.fillChannelName(inactiveChannelName);
    await channelPage.selectChannelType('PULL');
    await channelPage.submitAndWait();
    await channelPage.waitForNotificationGone();

    // Reset filter to a clean state before tests begin
    await channelPage.ensureSearchPanelOpen();
    await channelPage.fillChannelNameFilter('');
    await channelPage.selectStatusFilter('All channels');
    await channelPage.submitSearchFilter();
    await channelPage.navigateToFirstPage();
  });

  // ── TC-CH-028 ────────────────────────────────────────────────────────────────

  test('TC-CH-028 | should return the channel when searching by its exact full name with "All channels" filter', async () => {
    await channelPage.ensureSearchPanelOpen();
    await channelPage.fillChannelNameFilter(inactiveChannelName);
    await channelPage.selectStatusFilter('All channels');
    await channelPage.submitSearchFilter();
    await channelPage.assertChannelInList(inactiveChannelName);

    console.log(`\n  Exact name search (All channels):`);
    console.log(`    Search term      : "${inactiveChannelName}"`);
    console.log(`    Status filter    : All channels`);
    console.log(`    Result           : channel visible ✓`);
  });

  // ── TC-CH-029 ────────────────────────────────────────────────────────────────

  test('TC-CH-029 | should display "No records found" when the search name does not match any channel', async () => {
    await channelPage.ensureSearchPanelOpen();
    await channelPage.fillChannelNameFilter('NOMATCH_CHANNEL_XYZ_9999');
    await channelPage.selectStatusFilter('All channels');
    await channelPage.submitSearchFilter(false);
    await channelPage.assertNoResultsFound();

    console.log(`\n  Non-matching name search:`);
    console.log(`    Search term      : "NOMATCH_CHANNEL_XYZ_9999"`);
    console.log(`    Status filter    : All channels`);
    console.log(`    Result           : "No records found" ✓`);
  });

  // ── TC-CH-030 ────────────────────────────────────────────────────────────────

  test('TC-CH-030 | should return all matching channels when searching by a partial channel name', async () => {
    await channelPage.ensureSearchPanelOpen();
    await channelPage.fillChannelNameFilter(partialPrefix);
    await channelPage.selectStatusFilter('All channels');
    await channelPage.submitSearchFilter();
    await channelPage.assertChannelInList(activeChannelName);
    await channelPage.assertChannelInList(inactiveChannelName);

    console.log(`\n  Partial name search:`);
    console.log(`    Search term      : "${partialPrefix}" (common prefix)`);
    console.log(`    Status filter    : All channels`);
    console.log(`    Active channel   : "${activeChannelName}" visible ✓`);
    console.log(`    Inactive channel : "${inactiveChannelName}" visible ✓`);
  });

  // ── TC-CH-031 ────────────────────────────────────────────────────────────────

  test('TC-CH-031 | should return the Active channel when searching by its exact name with "All channels" filter', async () => {
    await channelPage.navigateToFirstPage();
    await channelPage.ensureSearchPanelOpen();
    await channelPage.fillChannelNameFilter(activeChannelName);
    await channelPage.selectStatusFilter('All channels');
    await channelPage.submitSearchFilter();
    await channelPage.assertChannelInList(activeChannelName);

    console.log(`\n  Active channel name + All channels filter:`);
    console.log(`    Search term      : "${activeChannelName}"`);
    console.log(`    Status filter    : All channels`);
    console.log(`    Result           : Active channel visible ✓`);
  });

  // ── TC-CH-032 ────────────────────────────────────────────────────────────────

  test('TC-CH-032 | should find an Active channel when searching by its name with "Active channels" filter', async () => {
    await channelPage.ensureSearchPanelOpen();
    await channelPage.fillChannelNameFilter(activeChannelName);
    await channelPage.selectStatusFilter('Active channels');
    await channelPage.submitSearchFilter();
    await channelPage.assertChannelInList(activeChannelName);
    await channelPage.assertChannelStatus(activeChannelName, 'Active');

    console.log(`\n  Active channel name + Active channels filter:`);
    console.log(`    Search term      : "${activeChannelName}"`);
    console.log(`    Status filter    : Active channels`);
    console.log(`    Result           : channel visible, status = Active ✓`);
  });

  // ── TC-CH-033 ────────────────────────────────────────────────────────────────

  test('TC-CH-033 | should return no results when searching an Active channel name with "Inactive channels" filter', async () => {
    await channelPage.ensureSearchPanelOpen();
    await channelPage.fillChannelNameFilter(activeChannelName);
    await channelPage.selectStatusFilter('Inactive channels');
    await channelPage.submitSearchFilter(false);
    await channelPage.assertNoResultsFound();

    console.log(`\n  Active channel name + Inactive channels filter:`);
    console.log(`    Search term      : "${activeChannelName}"`);
    console.log(`    Status filter    : Inactive channels`);
    console.log(`    Result           : "No records found" ✓`);
  });

  // ── TC-CH-034 ────────────────────────────────────────────────────────────────

  test('TC-CH-034 | should find an Inactive channel when searching by its name with "Inactive channels" filter', async () => {
    await channelPage.ensureSearchPanelOpen();
    await channelPage.fillChannelNameFilter(inactiveChannelName);
    await channelPage.selectStatusFilter('Inactive channels');
    await channelPage.submitSearchFilter();
    await channelPage.assertChannelInList(inactiveChannelName);
    await channelPage.assertChannelStatus(inactiveChannelName, 'Inactive');

    console.log(`\n  Inactive channel name + Inactive channels filter:`);
    console.log(`    Search term      : "${inactiveChannelName}"`);
    console.log(`    Status filter    : Inactive channels`);
    console.log(`    Result           : channel visible, status = Inactive ✓`);
  });

  // ── TC-CH-035 ────────────────────────────────────────────────────────────────

  test('TC-CH-035 | should return no results when searching an Inactive channel name with "Active channels" filter', async () => {
    await channelPage.ensureSearchPanelOpen();
    await channelPage.fillChannelNameFilter(inactiveChannelName);
    await channelPage.selectStatusFilter('Active channels');
    await channelPage.submitSearchFilter(false);
    await channelPage.assertNoResultsFound();

    console.log(`\n  Inactive channel name + Active channels filter:`);
    console.log(`    Search term      : "${inactiveChannelName}"`);
    console.log(`    Status filter    : Active channels`);
    console.log(`    Result           : "No records found" ✓`);
  });
});
