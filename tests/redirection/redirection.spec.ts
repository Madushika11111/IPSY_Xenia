import { test, expect, Browser, Page } from '@playwright/test';
import { SpacePage } from '../../pages/SpacePage';
import { RedirectionListPage } from '../../pages/RedirectionListPage';
import { RedirectionCreatePage } from '../../pages/RedirectionCreatePage';
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

// ─── TC-RD-001 to ... | Redirection Campaign ─────────────────────────────────
// One browser context and page shared across all tests in this file.
// The Xenia app is opened once in beforeAll — tests share the same page.

test.describe('Redirection Campaign', () => {
  let sharedPage: Page;
  let rdListPage:   RedirectionListPage;
  let rdCreatePage: RedirectionCreatePage;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const context  = await browser.newContext({ storageState: 'auth/user.json' });
    sharedPage     = await context.newPage();
    rdListPage     = new RedirectionListPage(sharedPage);
    rdCreatePage   = new RedirectionCreatePage(sharedPage);

    const spacePage = new SpacePage(sharedPage, context);
    await spacePage.navigateToEntries(config.spaceId);
    await spacePage.openSpaceSidepanel();
    await spacePage.selectSpace(config.xeniaSpaceId, config.xeniaSpaceName);
    await spacePage.selectEnvironment('master');
    await spacePage.openAppsMenu(config.xeniaAppName);
    await spacePage.assertAppLoaded();

    // assertAppLoaded() only confirms the Contentful nav is mounted — the Xenia app
    // inside the iframe renders asynchronously and may still be showing a spinner.
    // Wait here for the sidebar Dashboard link (first stable Xenia UI element) so
    // TC-RD-001 doesn't race against a still-loading iframe.
    await sharedPage
      .frameLocator('[data-test-id="cf-widget-renderer"]')
      .getByRole('link', { name: 'Dashboard' })
      .waitFor({ state: 'visible', timeout: 60000 });
  });

  test.afterAll(async () => {
    await sharedPage.context().close();
  });

  // ── TC-RD-001 to TC-RD-003 | Sidebar Navigation & Campaign Creation ──────────

  // ── TC-RD-001 ────────────────────────────────────────────────────────────────
  // Verify the Redirection link is present in the sidebar campaign section after
  // the user logs in and navigates to the Xenia app.

  test('TC-RD-001 | should display the Redirection link in the sidebar campaign section after navigating to the Xenia app', async () => {
    const frame = sharedPage.frameLocator('[data-test-id="cf-widget-renderer"]');

    // 1. Xenia app iframe is rendered and the widget frame is present
    await expect(
      sharedPage.locator('[data-test-id="cf-widget-renderer"]')
    ).toBeAttached({ timeout: 20000 });
    console.log(`\n  Xenia app iframe : attached to DOM ✓`);

    // 2. Redirection sidebar link is visible with the exact label "Redirection"
    await rdListPage.assertSidebarLinkVisible();
    const linkText = await rdListPage.getSidebarLinkText();
    expect(linkText, 'Sidebar link text must be exactly "Redirection"').toBe('Redirection');
    console.log(`  Redirection sidebar link : visible ✓`);
    console.log(`  Link label               : "${linkText}" (exact match) ✓`);

    // 3. The element is a navigation link (role = link), not a button or plain text
    await expect(
      frame.getByRole('link', { name: 'Redirection', exact: true })
    ).toHaveRole('link');
    console.log(`  Element role             : link ✓`);

    // 4. Clicking the sidebar link navigates to the Redirection campaigns list page
    await rdListPage.navigate();
    console.log(`  Clicked Redirection link : navigated to list page ✓`);

    // 5. The Redirection campaigns page heading is visible inside the iframe
    await expect(
      frame.getByRole('heading', { name: 'Redirection campaigns' })
    ).toBeVisible({ timeout: 10000 });
    const headingText = (
      await frame.getByRole('heading', { name: 'Redirection campaigns' }).textContent()
    )?.trim();
    expect(headingText, 'Page heading must be "Redirection campaigns"').toBe('Redirection campaigns');
    console.log(`  Page heading             : "${headingText}" ✓`);

    // 6. The sidebar link remains visible after navigation (it is the active section)
    await rdListPage.assertSidebarLinkVisible();
    console.log(`  Redirection sidebar link : still visible after navigation ✓`);
  });

  // ── TC-RD-002 ────────────────────────────────────────────────────────────────
  // Clicking the Redirection sidebar link navigates to the correct campaign page.
  // Starts from Dashboard so the navigation itself is exercised from a fresh state.

  test('TC-RD-002 | should navigate to the Redirection campaigns page and display the correct page heading when the Redirection sidebar link is clicked', async () => {
    const frame = sharedPage.frameLocator('[data-test-id="cf-widget-renderer"]');

    // 1. Navigate away to Dashboard first so the click truly triggers a page transition
    await frame.getByRole('link', { name: 'Dashboard' }).click();
    await expect(
      frame.getByRole('heading', { name: 'Dashboard' })
    ).toBeVisible({ timeout: 15000 });
    console.log(`\n  Starting point           : Dashboard page ✓`);

    // 2. Redirection sidebar link is visible before clicking
    await rdListPage.assertSidebarLinkVisible();
    console.log(`  Redirection sidebar link : visible in sidebar ✓`);

    // 3. Click the Redirection sidebar link (from codegen)
    await frame.getByRole('link', { name: 'Redirection', exact: true }).click();
    console.log(`  Redirection sidebar link : clicked ✓`);

    // 4. "Redirection campaigns" heading is visible (from codegen)
    await expect(
      frame.getByRole('heading', { name: 'Redirection campaigns' })
    ).toBeVisible({ timeout: 10000 });
    console.log(`  Page heading visible     : "Redirection campaigns" ✓`);

    // 5. Heading text matches exactly — not a partial or wrong page
    const headingText = (
      await frame.getByRole('heading', { name: 'Redirection campaigns' }).textContent()
    )?.trim();
    expect(headingText, 'Heading must be exactly "Redirection campaigns"').toBe('Redirection campaigns');
    console.log(`  Page heading exact text  : "${headingText}" ✓`);

    // 6. Dashboard heading is no longer visible — confirms the page changed
    await expect(
      frame.getByRole('heading', { name: 'Dashboard' })
    ).not.toBeVisible({ timeout: 5000 });
    console.log(`  Dashboard heading        : no longer visible (page transitioned) ✓`);

    // 7. The Redirection sidebar link is still present after landing on the page
    await rdListPage.assertSidebarLinkVisible();
    console.log(`  Redirection sidebar link : still visible on destination page ✓`);
  });

  // ── TC-RD-003 ────────────────────────────────────────────────────────────────
  // The "+Campaigns" button is visible on the Redirection list page.
  // Clicking it opens the Create campaign drawer, confirmed by the heading and the
  // three action buttons (Save & Activate, Save as Draft, Cancel).

  test('TC-RD-003 | should display the "+Campaigns" button on the Redirection list page and open the Create campaign drawer with Save & Activate, Save as Draft, and Cancel buttons when clicked', async () => {
    const frame = sharedPage.frameLocator('[data-test-id="cf-widget-renderer"]');

    // 1. Navigate to the Redirection campaigns list page (clean starting state)
    await rdListPage.navigate();
    console.log(`\n  Starting point           : Redirection campaigns page ✓`);

    // 2. "+Campaigns" create button is visible on the list page (from codegen)
    await rdListPage.assertCreateButtonVisible();
    console.log(`  "+Campaigns" button      : visible on list page ✓`);

    // 3. Click the "+Campaigns" button (from codegen)
    await rdListPage.clickCreateButton();
    console.log(`  "+Campaigns" button      : clicked ✓`);

    // 4. Create campaign drawer opens — heading "Create campaign" is visible (from codegen)
    await rdCreatePage.assertCreateDrawerVisible();
    const drawerHeading = (
      await frame.getByRole('heading', { name: 'Create campaign' }).textContent()
    )?.trim();
    expect(drawerHeading, 'Drawer heading must be "Create campaign"').toBe('Create campaign');
    console.log(`  Drawer heading           : "${drawerHeading}" ✓`);

    // 5. "Save & Activate Campaign" button is visible (from codegen: submit-save-active-drawer)
    await rdCreatePage.assertSaveActivateButtonVisible();
    console.log(`  Save & Activate Campaign : visible ✓`);

    // 6. "Save Campaign as Draft" button is visible (from codegen: submit-save-draft-drawer)
    await rdCreatePage.assertSaveDraftButtonVisible();
    console.log(`  Save Campaign as Draft   : visible ✓`);

    // 7. "Cancel" button is visible (from codegen: onclose-basic-drawer)
    await rdCreatePage.assertCancelButtonVisible();
    console.log(`  Cancel button            : visible ✓`);

    // 8. Clicking Cancel closes the drawer and returns to the list page
    await rdCreatePage.closeDrawer();
    await rdListPage.assertPageVisible();
    console.log(`  Cancel clicked           : drawer closed, back on list page ✓`);
  });

  // ── TC-RD-004 ────────────────────────────────────────────────────────────────
  // Clicking "Save & Activate Campaign" without filling any required fields must
  // display inline validation error messages for each required field.
  // Each assertion captures the actual UI text and compares it to the expected
  // string — failures report both values for fast triage.

  test('TC-RD-004 | should display required-field validation messages when Save & Activate Campaign is clicked without filling any fields', async () => {
    // 1. Start from a clean Redirection campaigns list page
    await rdListPage.navigate();
    console.log(`\n  Starting point           : Redirection campaigns page ✓`);

    // 2. Open the Create campaign drawer
    await rdListPage.clickCreateButton();
    await rdCreatePage.assertCreateDrawerVisible();
    console.log(`  Create campaign drawer   : opened ✓`);

    // 3. Click "Save & Activate Campaign" without filling any fields
    await rdCreatePage.clickSaveActivate();
    console.log(`  Save & Activate clicked  : no fields filled ✓`);

    // 4. Validation: "Campaign name" error message
    //    Actual text is captured from the DOM and compared to the expected string.
    const actualNameError = await rdCreatePage.assertCampaignNameValidation();
    const expectedNameError = 'Please enter campaign name';
    console.log(`  Campaign name error`);
    console.log(`    Expected : "${expectedNameError}"`);
    console.log(`    Actual   : "${actualNameError}" ✓`);

    // 5. Validation: "Campaign start date & time" error message
    //    Actual text is captured from the DOM and compared to the expected string.
    const actualStartError = await rdCreatePage.assertStartDateValidation();
    const expectedStartError = 'Please select campaign start date & time';
    console.log(`  Start date error`);
    console.log(`    Expected : "${expectedStartError}"`);
    console.log(`    Actual   : "${actualStartError}" ✓`);

    // 6. Close the drawer to leave the page in a clean state for subsequent tests
    await rdCreatePage.closeDrawer();
    await rdListPage.assertPageVisible();
    console.log(`  Drawer closed            : back on Redirection campaigns page ✓`);
  });

  // ── TC-RD-005 ────────────────────────────────────────────────────────────────
  // Clicking "Save Campaign as Draft" without filling any required fields must
  // surface a validation notification on the main Contentful page (outside the
  // Xenia iframe). The actual notification text is captured and compared to the
  // expected message string for a clear actual-vs-expected assertion.

  test('TC-RD-005 | should display a validation notification when Save Campaign as Draft is clicked without filling any fields', async () => {
    // 1. Start from a clean Redirection campaigns list page
    await rdListPage.navigate();
    console.log(`\n  Starting point           : Redirection campaigns page ✓`);

    // 2. Open the Create campaign drawer
    await rdListPage.clickCreateButton();
    await rdCreatePage.assertCreateDrawerVisible();
    console.log(`  Create campaign drawer   : opened ✓`);

    // 3. Click "Save Campaign as Draft" without filling any fields (from codegen)
    await rdCreatePage.clickSaveDraft();
    console.log(`  Save Campaign as Draft   : clicked with no fields filled ✓`);

    // 4. A Contentful-level notification appears outside the Xenia iframe.
    //    Capture the actual message text from the notification paragraph.
    const actualMessage = await rdCreatePage.assertDraftValidationNotification();
    const expectedMessage = 'Please enter campaign name';
    console.log(`  Validation notification`);
    console.log(`    Expected : "${expectedMessage}"`);
    console.log(`    Actual   : "${actualMessage}"`);
    expect(
      actualMessage,
      `Draft validation notification mismatch\n  Expected : "${expectedMessage}"\n  Actual   : "${actualMessage}"`
    ).toBe(expectedMessage);
    console.log(`    Match    : ✓`);

    // 5. Dismiss the notification (click the × inside it), then close the drawer.
    //    The drawer stays open after a failed draft save — both steps are always needed.
    await rdCreatePage.dismissNotificationIfVisible();
    console.log(`  Notification dismissed   : ✓`);

    await rdCreatePage.closeDrawer();
    await rdListPage.assertPageVisible();
    console.log(`  Drawer closed            : back on Redirection campaigns page ✓`);
  });

  // ── TC-RD-006 ────────────────────────────────────────────────────────────────
  // Clicking the Cancel button inside the Create campaign drawer must close the
  // drawer and return the user to the Redirection campaigns list page.

  test('TC-RD-006 | should close the Create campaign drawer and return to the Redirection campaigns list page when the Cancel button is clicked', async () => {
    const frame = sharedPage.frameLocator('[data-test-id="cf-widget-renderer"]');

    // 1. Start from a clean Redirection campaigns list page
    await rdListPage.navigate();
    await rdListPage.assertPageVisible();
    console.log(`\n  Starting point           : Redirection campaigns page ✓`);

    // 2. Open the Create campaign drawer
    await rdListPage.clickCreateButton();
    await rdCreatePage.assertCreateDrawerVisible();
    const drawerHeading = (
      await frame.getByRole('heading', { name: 'Create campaign' }).textContent()
    )?.trim();
    expect(drawerHeading, 'Drawer heading must be "Create campaign"').toBe('Create campaign');
    console.log(`  Create campaign drawer   : opened — heading "${drawerHeading}" ✓`);

    // 3. Cancel button is visible and its label is exactly "Cancel"
    await rdCreatePage.assertCancelButtonVisible();
    const cancelLabel = await rdCreatePage.getCancelButtonText();
    expect(cancelLabel, `Cancel button label must be "Cancel" — got "${cancelLabel}"`).toBe('Cancel');
    console.log(`  Cancel button            : visible — label "${cancelLabel}" ✓`);

    // 4. Click the Cancel button
    await rdCreatePage.closeDrawer();
    console.log(`  Cancel button clicked    : ✓`);

    // 5. Create campaign drawer is no longer visible (heading gone from DOM)
    await expect(
      frame.getByRole('heading', { name: 'Create campaign' })
    ).not.toBeVisible({ timeout: 5000 });
    console.log(`  Drawer heading           : no longer visible (drawer closed) ✓`);

    // 6. Redirection campaigns list page is visible — user navigated back
    await rdListPage.assertPageVisible();
    const listHeading = (
      await frame.getByRole('heading', { name: 'Redirection campaigns' }).textContent()
    )?.trim();
    expect(listHeading, 'List page heading must be "Redirection campaigns"').toBe('Redirection campaigns');
    console.log(`  List page heading        : "${listHeading}" ✓`);

    // 7. "+Campaigns" button is still available on the list page
    await rdListPage.assertCreateButtonVisible();
    console.log(`  "+Campaigns" button      : still visible on list page ✓`);
  });

  // ── TC-RD-007 ────────────────────────────────────────────────────────────────
  // Entering a past date in the "Campaign start date & time" field and clicking
  // "Save & Activate Campaign" must display a validation error telling the user
  // the start date must be in the future.

  test('TC-RD-007 | should display a validation message when a past date is entered for Campaign start date & time and Save & Activate is clicked', async () => {
    const frame = sharedPage.frameLocator('[data-test-id="cf-widget-renderer"]');

    // 1. Start from a clean Redirection campaigns list page
    await rdListPage.navigate();
    console.log(`\n  Starting point           : Redirection campaigns page ✓`);

    // 2. Open the Create campaign drawer
    await rdListPage.clickCreateButton();
    await rdCreatePage.assertCreateDrawerVisible();
    console.log(`  Create campaign drawer   : opened ✓`);

    // 3. Fill Campaign name (required field — avoids triggering the name error alongside the date error)
    const campaignName = 'RE_Test_Past_Date';
    await rdCreatePage.fillCampaignName(campaignName);
    const filledName = (
      await frame.getByRole('textbox', { name: 'Campaign name *' }).inputValue()
    );
    expect(filledName, `Campaign name field value must be "${campaignName}"`).toBe(campaignName);
    console.log(`  Campaign name            : filled with "${filledName}" ✓`);

    // 4. Fill Campaign start date & time with a clearly past date (from codegen pattern)
    //    Using a fixed past date so the test is deterministic on any run date.
    const pastDateTime = '2020-01-01T00:00';
    await rdCreatePage.fillStartDateTime(pastDateTime);
    const filledDate = (
      await frame.getByRole('textbox', { name: 'Campaign start date & time (' }).inputValue()
    );
    console.log(`  Start date & time        : filled with past value "${filledDate}" ✓`);

    // 5. Click "Save & Activate Campaign" to trigger validation (from codegen)
    await rdCreatePage.clickSaveActivate();
    console.log(`  Save & Activate clicked  : ✓`);

    // 6. Validation message for past start date — actual vs expected comparison
    const actualMsg   = await rdCreatePage.assertPastStartDateValidation();
    const expectedMsg = 'Campaign start date & time should be greater than current date & time';
    console.log(`  Past date validation`);
    console.log(`    Expected : "${expectedMsg}"`);
    console.log(`    Actual   : "${actualMsg}" ✓`);

    // 7. The start date field label remains visible, confirming the field with the error
    await expect(
      frame.getByText('Campaign start date & time (', { exact: false })
    ).toBeVisible({ timeout: 5000 });
    console.log(`  Start date field label   : visible ✓`);

    // 8. Close the drawer to leave a clean state
    await rdCreatePage.closeDrawer();
    await rdListPage.assertPageVisible();
    console.log(`  Drawer closed            : back on Redirection campaigns page ✓`);
  });

  // ── TC-RD-008 ────────────────────────────────────────────────────────────────
  // Filling in a valid Campaign name, a valid future start date, and selecting a
  // Channel — but leaving the Ruleset empty — and then clicking "Save & Activate
  // Campaign" must surface a validation notification.

  test('TC-RD-008 | should display a validation notification when Save & Activate is clicked with valid name, date and channel but without adding a Ruleset', async () => {
    const frame = sharedPage.frameLocator('[data-test-id="cf-widget-renderer"]');

    // 1. Start from a clean Redirection campaigns list page
    await rdListPage.navigate();
    console.log(`\n  Starting point           : Redirection campaigns page ✓`);

    // 2. Open the Create campaign drawer
    await rdListPage.clickCreateButton();
    await rdCreatePage.assertCreateDrawerVisible();
    console.log(`  Create campaign drawer   : opened ✓`);

    // 3. Fill Campaign name
    const campaignName = 'RE_Test_No_Ruleset';
    await rdCreatePage.fillCampaignName(campaignName);
    const filledName = await frame.getByRole('textbox', { name: 'Campaign name *' }).inputValue();
    expect(filledName, `Campaign name must be "${campaignName}"`).toBe(campaignName);
    console.log(`  Campaign name            : "${filledName}" ✓`);

    // 4. Fill a valid future start date (hardcoded far-future so it never becomes stale)
    const futureDate = '2030-01-01T12:00';
    await rdCreatePage.fillStartDateTime(futureDate);
    const filledDate = await frame.getByRole('textbox', { name: 'Campaign start date & time (' }).inputValue();
    console.log(`  Start date & time        : "${filledDate}" (future) ✓`);

    // 5. Select a Channel (from codegen: nth(2) dropdown → option-5)
    await rdCreatePage.selectChannel();
    console.log(`  Channel                  : selected ✓`);

    // 5b. Dismiss any lingering notification from an earlier action in this
    //     shared-page test run — FIXED (flaky): without this, a stale toast
    //     (e.g. from a previous test) can still be fading out when this test's
    //     own toast appears, and the bare locator below then matches both,
    //     tripping a strict-mode violation on toBeVisible().
    await rdCreatePage.dismissNotificationIfVisible();

    // 6. Click "Save & Activate Campaign" without adding any Ruleset (from codegen)
    await rdCreatePage.clickSaveActivate();
    console.log(`  Save & Activate clicked  : no Ruleset added ✓`);

    // 7. Validation notification appears — capture actual text then compare to expected.
    //    .last() as a second line of defence: notifications are appended to their
    //    container in DOM order, so the most recent one — the one THIS action
    //    triggered — is always the last match, even if a stale one still lingers.
    const notification = sharedPage.locator('[data-test-id="cf-ui-notification"]').last();
    await expect(notification).toBeVisible({ timeout: 10000 });
    const paragraph  = sharedPage.locator('[data-test-id="cf-ui-paragraph"]').last();
    await expect(paragraph).toBeVisible({ timeout: 5000 });
    const actualMsg   = (await paragraph.textContent())?.trim() ?? '';
    const expectedMsg = 'Add rule set for every channel';
    console.log(`  Validation notification`);
    console.log(`    Expected : "${expectedMsg}"`);
    console.log(`    Actual   : "${actualMsg}"`);
    expect(
      actualMsg,
      `No-Ruleset notification mismatch\n  Expected : "${expectedMsg}"\n  Actual   : "${actualMsg}"`
    ).toBe(expectedMsg);
    console.log(`    Match    : ✓`);

    // 8. Dismiss notification, close drawer, return to clean state
    await rdCreatePage.dismissNotificationIfVisible();
    console.log(`  Notification dismissed   : ✓`);

    if (await frame.getByRole('heading', { name: 'Create campaign' }).isVisible({ timeout: 2000 }).catch(() => false)) {
      await rdCreatePage.closeDrawer();
    }
    await rdListPage.assertPageVisible();
    console.log(`  Drawer closed            : back on Redirection campaigns page ✓`);
  });

  // ── TC-RD-009 ────────────────────────────────────────────────────────────────
  // Before clicking "+ Add ruleset" the Ruleset section must be empty (no items).
  // Clicking "Add ruleset" must open a panel showing:
  //   Heading  : "Add ruleset"
  //   Buttons  : "New ruleset", "Add ruleset", "Cancel"
  //   Fields   : "Name *", "Description", "Defining rule *", "Rule String"

  test('TC-RD-009 | should show an empty Ruleset section and open the Add ruleset panel with correct heading, fields and buttons when the Add ruleset button is clicked', async () => {
    const frame = sharedPage.frameLocator('[data-test-id="cf-widget-renderer"]');

    // 1. Start from a clean Redirection campaigns list page
    await rdListPage.navigate();
    console.log(`\n  Starting point           : Redirection campaigns page ✓`);

    // 2. Open the Create campaign drawer
    await rdListPage.clickCreateButton();
    await rdCreatePage.assertCreateDrawerVisible();
    console.log(`  Create campaign drawer   : opened ✓`);

    // 3. Fill Campaign name
    const campaignName = 'Test_RD_Ruleset';
    await rdCreatePage.fillCampaignName(campaignName);
    const filledName = await frame.getByRole('textbox', { name: 'Campaign name *' }).inputValue();
    expect(filledName, `Campaign name must be "${campaignName}"`).toBe(campaignName);
    console.log(`  Campaign name            : "${filledName}" ✓`);

    // 4. Fill a valid future start date
    const futureDate = '2030-01-01T12:00';
    await rdCreatePage.fillStartDateTime(futureDate);
    console.log(`  Start date & time        : "${futureDate}" (future) ✓`);

    // 5. Select a Channel (required before the Ruleset section becomes interactive)
    await rdCreatePage.selectChannel();
    console.log(`  Channel                  : selected ✓`);

    // 6. BEFORE clicking Add ruleset — assert the Ruleset section is EMPTY
    //    Only the "Add ruleset" link is present; no ruleset items have been added.
    await rdCreatePage.assertRulesetSectionEmpty();
    console.log(`  Ruleset section          : empty — "Add ruleset" link visible, no items ✓`);

    // 7. Click "Add ruleset" to open the Add ruleset panel
    await rdCreatePage.clickAddRuleset();
    console.log(`  "Add ruleset" clicked    : panel opening ✓`);

    // 8. Panel heading is "Add ruleset" — exact text match
    await rdCreatePage.assertAddRulesetPanelHeading();
    const panelHeading = (
      await frame.getByRole('heading', { name: 'Add ruleset' }).textContent()
    )?.trim();
    expect(panelHeading, 'Panel heading must be "Add ruleset"').toBe('Add ruleset');
    console.log(`  Panel heading            : "${panelHeading}" ✓`);

    // 9. Three action buttons are visible
    await rdCreatePage.assertAddRulesetPanelButtons();
    console.log(`  Buttons`);
    console.log(`    "New ruleset"          : visible ✓`);
    console.log(`    "Add ruleset"          : visible ✓`);
    console.log(`    "Cancel"               : visible ✓`);

    // 10. Four form fields are visible
    await rdCreatePage.assertAddRulesetPanelFields();
    console.log(`  Fields`);
    console.log(`    "Name *"               : visible ✓`);
    console.log(`    "Description"          : visible ✓`);
    console.log(`    "Defining rule *"      : visible ✓`);
    console.log(`    "Rule String"          : visible ✓`);

    // 11. Close the Add ruleset panel then close the campaign drawer — clean state
    await rdCreatePage.closeAddRulesetPanel();
    console.log(`  Add ruleset panel        : closed ✓`);
    await rdCreatePage.closeDrawer();
    await rdListPage.assertPageVisible();
    console.log(`  Drawer closed            : back on Redirection campaigns page ✓`);
  });

  // ── TC-RD-010 ────────────────────────────────────────────────────────────────
  // Selects the "Age>" template from the "Choose a template" dropdown in the
  // Add ruleset panel, verifies the form auto-fills from the template, submits
  // the panel, and asserts the ruleset appears in the Ruleset section with:
  //   • the correct name
  //   • initial status "Inactive"
  //   • "+Add rules" (custom), edit (.actions), and Delete buttons

  test('TC-RD-010 | should select a template from the dropdown, auto-fill the Add ruleset form, create the ruleset successfully and display it with Inactive status and action buttons', async () => {
    const frame = sharedPage.frameLocator('[data-test-id="cf-widget-renderer"]');

    // 1. Start from a clean Redirection campaigns list page
    await rdListPage.navigate();
    console.log(`\n  Starting point           : Redirection campaigns page ✓`);

    // 2. Open the Create campaign drawer
    await rdListPage.clickCreateButton();
    await rdCreatePage.assertCreateDrawerVisible();
    console.log(`  Create campaign drawer   : opened ✓`);

    // 3. Fill Campaign name
    const campaignName = 'Red_Test_1';
    await rdCreatePage.fillCampaignName(campaignName);
    const filledName = await frame.getByRole('textbox', { name: 'Campaign name *' }).inputValue();
    expect(filledName, `Campaign name must be "${campaignName}"`).toBe(campaignName);
    console.log(`  Campaign name            : "${filledName}" ✓`);

    // 4. Fill a valid future start date
    const futureDate = '2030-01-01T12:00';
    await rdCreatePage.fillStartDateTime(futureDate);
    console.log(`  Start date & time        : "${futureDate}" (future) ✓`);

    // 5. Select channel "GR_channel_2" by name (from codegen)
    await rdCreatePage.selectChannelByName('GR_channel_2');
    console.log(`  Channel                  : "GR_channel_2" selected ✓`);

    // 6. Click "Add ruleset" and confirm the panel heading
    await rdCreatePage.clickAddRuleset();
    await rdCreatePage.assertAddRulesetPanelHeading();
    console.log(`  Add ruleset panel        : opened ✓`);

    // 7. Open the "Choose a template" dropdown and read all available templates
    await rdCreatePage.openTemplateDropdown();
    const availableTemplates = await rdCreatePage.getAvailableTemplateNames();
    expect(availableTemplates.length, 'Template dropdown must contain at least one template').toBeGreaterThan(0);
    console.log(`  Template dropdown        : opened — ${availableTemplates.length} template(s) available ✓`);
    console.log(`  Available templates      : ${availableTemplates.join(', ')}`);

    // 8. Select the first available template (data-agnostic — any template is valid)
    const selectedTemplate = await rdCreatePage.selectFirstAvailableTemplate();
    console.log(`  Template selected        : "${selectedTemplate}" ✓`);

    // 9. Assert the form is auto-filled from the selected template
    //    Name, Defining rule, Operator, Value fields are all populated
    const autoFilledName = await rdCreatePage.assertTemplateFormAutofilled();
    expect(autoFilledName, `Name field must be auto-filled with the selected template name "${selectedTemplate}"`).toBe(selectedTemplate);
    console.log(`  Form auto-filled`);
    console.log(`    Name field             : "${autoFilledName}" (matches selected template) ✓`);
    console.log(`    Defining rule          : visible ✓`);
    console.log(`    Operator selector      : visible ✓`);
    console.log(`    Value input            : visible ✓`);

    // 10. "Add ruleset" submit button is visible
    await expect(frame.getByTestId('submit-basic-drawer')).toBeVisible({ timeout: 5000 });
    console.log(`  Submit button            : visible ✓`);

    // 11. Submit the Add ruleset panel — dialog closes and ruleset is created
    await rdCreatePage.submitAddRulesetPanel();
    console.log(`  Ruleset submitted        : panel closed ✓`);

    // 12. Ruleset name is correctly displayed in the Ruleset section table
    await rdCreatePage.assertRulesetAddedToTable(selectedTemplate);
    const rulesetNameCell = (
      await frame.getByRole('cell', { name: selectedTemplate }).textContent()
    )?.trim();
    expect(rulesetNameCell, `Ruleset name in table must be "${selectedTemplate}"`).toBe(selectedTemplate);
    console.log(`  Ruleset name in table`);
    console.log(`    Expected               : "${selectedTemplate}"`);
    console.log(`    Actual                 : "${rulesetNameCell}" ✓`);

    // 13. Ruleset initial status is "Inactive" — actual vs expected comparison
    const actualStatus = await rdCreatePage.assertRulesetInitialStatus();
    console.log(`  Ruleset initial status`);
    console.log(`    Expected               : "Inactive"`);
    console.log(`    Actual                 : "${actualStatus}" ✓`);

    // 14. Action buttons visible: "+Add rules" (custom), actions container, Delete
    await rdCreatePage.assertRulesetActionButtons();
    console.log(`  Action buttons`);
    console.log(`    "+Add rules" (custom)  : visible ✓`);
    console.log(`    Actions container      : visible ✓`);
    console.log(`    Delete button          : visible ✓`);

    // 15. Close campaign drawer — clean state for subsequent tests
    await rdCreatePage.closeDrawer();
    await rdListPage.assertPageVisible();
    console.log(`  Drawer closed            : back on Redirection campaigns page ✓`);
  });

  // ─── TC-RD-011 ───────────────────────────────────────────────────────────────

  test('TC-RD-011 | should toggle the ruleset status from Inactive to Active when the status toggle is clicked', async () => {
    const frame = sharedPage.frameLocator('[data-test-id="cf-widget-renderer"]');

    // 1. Start from a clean Redirection campaigns list page
    await rdListPage.navigate();
    console.log(`\n  Starting point           : Redirection campaigns page ✓`);

    // 2. Open the Create campaign drawer
    await rdListPage.clickCreateButton();
    await rdCreatePage.assertCreateDrawerVisible();
    console.log(`  Create campaign drawer   : opened ✓`);

    // 3. Fill Campaign name
    const campaignName = 'RE_Toggle_Test';
    await rdCreatePage.fillCampaignName(campaignName);
    const filledName = await frame.getByRole('textbox', { name: 'Campaign name *' }).inputValue();
    expect(filledName, `Campaign name must be "${campaignName}"`).toBe(campaignName);
    console.log(`  Campaign name            : "${filledName}" ✓`);

    // 4. Fill a valid future start date
    const futureDate = '2030-01-01T12:00';
    await rdCreatePage.fillStartDateTime(futureDate);
    console.log(`  Start date & time        : "${futureDate}" (future) ✓`);

    // 5. Select channel "RE_Channel_2_V1" (from codegen)
    await rdCreatePage.selectChannelByName('RE_Channel_2_V1');
    console.log(`  Channel                  : "RE_Channel_2_V1" selected ✓`);

    // 6. Click "Add ruleset" and confirm the panel heading
    await rdCreatePage.clickAddRuleset();
    await rdCreatePage.assertAddRulesetPanelHeading();
    console.log(`  Add ruleset panel        : opened ✓`);

    // 7. Open template dropdown, pick the first available template
    await rdCreatePage.openTemplateDropdown();
    const selectedTemplate = await rdCreatePage.selectFirstAvailableTemplate();
    console.log(`  Template selected        : "${selectedTemplate}" ✓`);

    // 8. Submit the Add ruleset panel — panel closes, ruleset appears in table
    await rdCreatePage.submitAddRulesetPanel();
    console.log(`  Ruleset submitted        : panel closed ✓`);

    // 9. Assert initial status is "Inactive" — actual vs expected
    const initialStatus = await rdCreatePage.assertRulesetStatusInactive();
    console.log(`  Ruleset initial status`);
    console.log(`    Expected               : "Inactive"`);
    console.log(`    Actual                 : "${initialStatus}" ✓`);

    // 10. Click the toggle to switch status from Inactive → Active
    await rdCreatePage.clickRulesetInactiveToggle();
    console.log(`  Toggle clicked           : Inactive → Active ✓`);

    // 11. Assert status is now "Active" — actual vs expected
    const activeStatus = await rdCreatePage.assertRulesetStatusActive();
    console.log(`  Ruleset status after toggle`);
    console.log(`    Expected               : "Active"`);
    console.log(`    Actual                 : "${activeStatus}" ✓`);

    // 12. Close campaign drawer — clean state for subsequent tests
    await rdCreatePage.closeDrawer();
    await rdListPage.assertPageVisible();
    console.log(`  Drawer closed            : back on Redirection campaigns page ✓`);
  });

  // ─── TC-RD-012 ───────────────────────────────────────────────────────────────

  test('TC-RD-012 | should display previously added ruleset details in the Update ruleset panel when the Edit button is clicked', async () => {
    const frame = sharedPage.frameLocator('[data-test-id="cf-widget-renderer"]');

    // 1. Start from a clean Redirection campaigns list page
    await rdListPage.navigate();
    console.log(`\n  Starting point           : Redirection campaigns page ✓`);

    // 2. Open the Create campaign drawer
    await rdListPage.clickCreateButton();
    await rdCreatePage.assertCreateDrawerVisible();
    console.log(`  Create campaign drawer   : opened ✓`);

    // 3. Fill Campaign name
    const campaignName = 'RE_Edit_Test';
    await rdCreatePage.fillCampaignName(campaignName);
    const filledName = await frame.getByRole('textbox', { name: 'Campaign name *' }).inputValue();
    expect(filledName, `Campaign name must be "${campaignName}"`).toBe(campaignName);
    console.log(`  Campaign name            : "${filledName}" ✓`);

    // 4. Fill a valid future start date
    const futureDate = '2030-01-01T12:00';
    await rdCreatePage.fillStartDateTime(futureDate);
    console.log(`  Start date & time        : "${futureDate}" (future) ✓`);

    // 5. Select channel
    await rdCreatePage.selectChannelByName('RE_Channel_2_V1');
    console.log(`  Channel                  : "RE_Channel_2_V1" selected ✓`);

    // 6. Open Add ruleset panel
    await rdCreatePage.clickAddRuleset();
    await rdCreatePage.assertAddRulesetPanelHeading();
    console.log(`  Add ruleset panel        : opened ✓`);

    // 7. Select the first available template (dynamic)
    await rdCreatePage.openTemplateDropdown();
    const selectedTemplate = await rdCreatePage.selectFirstAvailableTemplate();
    console.log(`  Template selected        : "${selectedTemplate}" ✓`);

    // 8. Submit the ruleset — panel closes, ruleset row appears in table
    await rdCreatePage.submitAddRulesetPanel();
    console.log(`  Ruleset submitted        : panel closed ✓`);

    // 9. Assert initial "Inactive" status — actual vs expected
    const initialStatus = await rdCreatePage.assertRulesetStatusInactive();
    console.log(`  Ruleset initial status`);
    console.log(`    Expected               : "Inactive"`);
    console.log(`    Actual                 : "${initialStatus}" ✓`);

    // 10. Toggle to Active (required to reveal the Edit button)
    await rdCreatePage.clickRulesetInactiveToggle();
    const activeStatus = await rdCreatePage.assertRulesetStatusActive();
    console.log(`  Status after toggle`);
    console.log(`    Expected               : "Active"`);
    console.log(`    Actual                 : "${activeStatus}" ✓`);

    // 11. Click the Edit button — opens Update ruleset panel
    await rdCreatePage.clickEditRuleset();
    console.log(`  Edit button              : clicked ✓`);

    // 12. Assert Update ruleset panel heading
    await rdCreatePage.assertUpdateRulesetPanelVisible();
    console.log(`  Update ruleset panel     : heading "Update ruleset" ✓`);

    // 13. Assert name field shows the previously saved template name — actual vs expected
    const actualName = await rdCreatePage.assertUpdateRulesetNameField(selectedTemplate);
    console.log(`  Name field`);
    console.log(`    Expected               : "${selectedTemplate}"`);
    console.log(`    Actual                 : "${actualName}" ✓`);

    // 14. Assert all rule condition fields are visible (data persisted from saved template)
    await rdCreatePage.assertUpdateRulesetPanelFields();
    console.log(`  Rule condition fields    : all visible ✓`);
    console.log(`    cf-ui-select           : visible ✓`);
    console.log(`    Autocomplete (attr)    : visible ✓`);
    console.log(`    Operator selector      : visible ✓`);
    console.log(`    Value text input       : visible ✓`);
    console.log(`    Ignore Case option     : visible ✓`);
    console.log(`    Submit button          : visible ✓`);

    // 15. Assert Rule String section label is visible
    await rdCreatePage.assertUpdateRulesetRuleStringVisible();
    console.log(`  Rule String section      : visible ✓`);

    // 16. Close Update ruleset panel then campaign drawer — clean state
    await rdCreatePage.closeUpdateRulesetPanel();
    console.log(`  Update ruleset panel     : closed ✓`);
    await rdCreatePage.closeDrawer();
    await rdListPage.assertPageVisible();
    console.log(`  Drawer closed            : back on Redirection campaigns page ✓`);
  });

  // ─── TC-RD-013 ───────────────────────────────────────────────────────────────

  test('TC-RD-013 | should display New ruleset, Update ruleset and Cancel buttons in the Update ruleset panel when the Edit button is clicked', async () => {
    const frame = sharedPage.frameLocator('[data-test-id="cf-widget-renderer"]');

    // 1. Start from a clean Redirection campaigns list page
    await rdListPage.navigate();
    console.log(`\n  Starting point           : Redirection campaigns page ✓`);

    // 2. Open the Create campaign drawer
    await rdListPage.clickCreateButton();
    await rdCreatePage.assertCreateDrawerVisible();
    console.log(`  Create campaign drawer   : opened ✓`);

    // 3. Fill campaign fields
    const campaignName = 'RE_Buttons_Test';
    await rdCreatePage.fillCampaignName(campaignName);
    const filledName = await frame.getByRole('textbox', { name: 'Campaign name *' }).inputValue();
    expect(filledName, `Campaign name must be "${campaignName}"`).toBe(campaignName);
    console.log(`  Campaign name            : "${filledName}" ✓`);

    await rdCreatePage.fillStartDateTime('2030-01-01T12:00');
    console.log(`  Start date & time        : "2030-01-01T12:00" (future) ✓`);

    await rdCreatePage.selectChannelByName('RE_Channel_2_V1');
    console.log(`  Channel                  : "RE_Channel_2_V1" selected ✓`);

    // 4. Add ruleset via first available template
    await rdCreatePage.clickAddRuleset();
    await rdCreatePage.assertAddRulesetPanelHeading();
    await rdCreatePage.openTemplateDropdown();
    const selectedTemplate = await rdCreatePage.selectFirstAvailableTemplate();
    await rdCreatePage.submitAddRulesetPanel();
    console.log(`  Ruleset added            : template "${selectedTemplate}" ✓`);

    // 5. Toggle Inactive → Active (required to reveal Edit button)
    const initialStatus = await rdCreatePage.assertRulesetStatusInactive();
    console.log(`  Initial status           : "${initialStatus}" ✓`);
    await rdCreatePage.clickRulesetInactiveToggle();
    const activeStatus = await rdCreatePage.assertRulesetStatusActive();
    console.log(`  Status after toggle      : "${activeStatus}" ✓`);

    // 6. Click Edit — opens Update ruleset panel
    await rdCreatePage.clickEditRuleset();
    await rdCreatePage.assertUpdateRulesetPanelVisible();
    console.log(`  Update ruleset panel     : heading "Update ruleset" ✓`);

    // 7. Assert all three action buttons — actual vs expected for submit label
    const submitLabel = await rdCreatePage.assertUpdateRulesetPanelButtons();
    console.log(`  Update ruleset panel buttons`);
    console.log(`    "New ruleset" button   : visible ✓`);
    console.log(`    Submit button`);
    console.log(`      Expected             : "Update ruleset"`);
    console.log(`      Actual               : "${submitLabel}" ✓`);
    console.log(`    "Cancel" button        : visible ✓`);

    // 8. Close Update ruleset panel then campaign drawer — clean state
    await rdCreatePage.closeUpdateRulesetPanel();
    console.log(`  Update ruleset panel     : closed ✓`);
    await rdCreatePage.closeDrawer();
    await rdListPage.assertPageVisible();
    console.log(`  Drawer closed            : back on Redirection campaigns page ✓`);
  });

  // ─── TC-RD-014 ───────────────────────────────────────────────────────────────

  test('TC-RD-014 | should apply ruleset edits and display updated name and value in the table and in the Edit panel after re-opening', async () => {
    const frame = sharedPage.frameLocator('[data-test-id="cf-widget-renderer"]');

    // 1. Start from a clean Redirection campaigns list page
    await rdListPage.navigate();
    console.log(`\n  Starting point           : Redirection campaigns page ✓`);

    // 2. Open the Create campaign drawer
    await rdListPage.clickCreateButton();
    await rdCreatePage.assertCreateDrawerVisible();
    console.log(`  Create campaign drawer   : opened ✓`);

    // 3. Fill Campaign name
    const campaignName = 'RE_Update_Test';
    await rdCreatePage.fillCampaignName(campaignName);
    const filledName = await frame.getByRole('textbox', { name: 'Campaign name *' }).inputValue();
    expect(filledName, `Campaign name must be "${campaignName}"`).toBe(campaignName);
    console.log(`  Campaign name            : "${filledName}" ✓`);

    // 4. Fill a valid future start date
    await rdCreatePage.fillStartDateTime('2030-01-01T12:00');
    console.log(`  Start date & time        : "2030-01-01T12:00" (future) ✓`);

    // 5. Select channel "new GR_1" (from codegen)
    await rdCreatePage.selectChannelByName('new GR_1');
    console.log(`  Channel                  : "new GR_1" selected ✓`);

    // 6. Open Add ruleset panel and select "country equal usa" template
    await rdCreatePage.clickAddRuleset();
    await rdCreatePage.assertAddRulesetPanelHeading();
    await rdCreatePage.openTemplateDropdown();
    await rdCreatePage.selectTemplate('country equal usa');
    console.log(`  Template selected        : "country equal usa" ✓`);

    // 7. Submit the Add ruleset panel — initial ruleset created
    await rdCreatePage.submitAddRulesetPanel();
    const initialRulesetName = 'country equal usa';
    await rdCreatePage.assertRulesetAddedToTable(initialRulesetName);
    console.log(`  Ruleset added            : "${initialRulesetName}" in table ✓`);

    // 8. Click Edit directly (Edit is accessible in Inactive state)
    await rdCreatePage.clickEditRuleset();
    await rdCreatePage.assertUpdateRulesetPanelVisible();
    console.log(`  Edit button clicked      : "Update ruleset" panel opened ✓`);

    // 9. Update the ruleset name
    const updatedName  = 'country equal canada';
    await rdCreatePage.fillUpdateRulesetName(updatedName);
    console.log(`  Name updated to          : "${updatedName}" ✓`);

    // 10. Update the value input to "canada"
    const updatedValue = 'canada';
    await rdCreatePage.fillUpdateRulesetValueInput(updatedValue);
    console.log(`  Value updated to         : "${updatedValue}" ✓`);

    // 11. Submit the update — panel closes
    await rdCreatePage.submitUpdateRulesetPanel();
    console.log(`  Update ruleset submitted : panel closed ✓`);

    // 12. Assert updated name is reflected in the Ruleset table — actual vs expected
    await rdCreatePage.assertRulesetAddedToTable(updatedName);
    const tableCellText = (
      await frame.getByRole('cell', { name: updatedName }).textContent()
    )?.trim() ?? '';
    expect(
      tableCellText,
      `Ruleset table cell mismatch\n  Expected : "${updatedName}"\n  Actual   : "${tableCellText}"`
    ).toBe(updatedName);
    console.log(`  Ruleset name in table`);
    console.log(`    Expected               : "${updatedName}"`);
    console.log(`    Actual                 : "${tableCellText}" ✓`);

    // 13. Assert Edit button still visible after update
    await expect(frame.getByTestId('edit')).toBeVisible({ timeout: 5000 });
    console.log(`  Edit button              : still visible after update ✓`);

    // 14. Click Edit again to verify the saved details match the update
    await rdCreatePage.clickEditRuleset();
    await rdCreatePage.assertUpdateRulesetPanelVisible();
    console.log(`  Edit clicked again       : "Update ruleset" panel re-opened ✓`);

    // 15. Assert name field shows the updated name — actual vs expected
    const actualNameAfterEdit = await rdCreatePage.assertUpdateRulesetNameField(updatedName);
    console.log(`  Name field after re-open`);
    console.log(`    Expected               : "${updatedName}"`);
    console.log(`    Actual                 : "${actualNameAfterEdit}" ✓`);

    // 16. Assert value input shows the updated value — actual vs expected
    const actualValueAfterEdit = await rdCreatePage.getUpdateRulesetValueInputValue();
    expect(
      actualValueAfterEdit,
      `Value input mismatch\n  Expected : "${updatedValue}"\n  Actual   : "${actualValueAfterEdit}"`
    ).toBe(updatedValue);
    console.log(`  Value input after re-open`);
    console.log(`    Expected               : "${updatedValue}"`);
    console.log(`    Actual                 : "${actualValueAfterEdit}" ✓`);

    // 17. Assert all other rule condition fields are visible
    await expect(frame.locator('[data-test-id="cf-autocomplete-input"]')).toBeVisible({ timeout: 5000 });
    await expect(frame.getByTestId('option-select-operator')).toBeVisible({ timeout: 5000 });
    await expect(frame.locator('[data-test-id="cf-ui-text-input"]')).toBeVisible({ timeout: 5000 });
    console.log(`  Rule condition fields    : autocomplete, operator, value input all visible ✓`);

    // 18. Assert rule string preview is visible (partial match from codegen)
    await rdCreatePage.assertRuleStringPreview('( (userData.get("');
    console.log(`  Rule String preview      : visible ✓`);

    // 19. Close Update ruleset panel then campaign drawer — clean state
    await rdCreatePage.closeUpdateRulesetPanel();
    await rdCreatePage.closeDrawer();
    await rdListPage.assertPageVisible();
    console.log(`  Drawer closed            : back on Redirection campaigns page ✓`);
  });

  // ─── TC-RD-015 ───────────────────────────────────────────────────────────────

  test('TC-RD-015 | should clear all fields in the Update ruleset panel when the New ruleset button is clicked', async () => {
    const frame = sharedPage.frameLocator('[data-test-id="cf-widget-renderer"]');

    // 1. Start from a clean Redirection campaigns list page
    await rdListPage.navigate();
    console.log(`\n  Starting point           : Redirection campaigns page ✓`);

    // 2. Open the Create campaign drawer
    await rdListPage.clickCreateButton();
    await rdCreatePage.assertCreateDrawerVisible();
    console.log(`  Create campaign drawer   : opened ✓`);

    // 3. Fill campaign fields
    const campaignName = 'RE_NewRuleset_Test';
    await rdCreatePage.fillCampaignName(campaignName);
    const filledName = await frame.getByRole('textbox', { name: 'Campaign name *' }).inputValue();
    expect(filledName, `Campaign name must be "${campaignName}"`).toBe(campaignName);
    console.log(`  Campaign name            : "${filledName}" ✓`);

    await rdCreatePage.fillStartDateTime('2030-01-01T12:00');
    console.log(`  Start date & time        : "2030-01-01T12:00" (future) ✓`);

    await rdCreatePage.selectChannelByName('new GR_1');
    console.log(`  Channel                  : "new GR_1" selected ✓`);

    // 4. Add ruleset via first available template (any template gives a pre-filled form)
    await rdCreatePage.clickAddRuleset();
    await rdCreatePage.assertAddRulesetPanelHeading();
    await rdCreatePage.openTemplateDropdown();
    const selectedTemplate = await rdCreatePage.selectFirstAvailableTemplate();
    await rdCreatePage.submitAddRulesetPanel();
    console.log(`  Ruleset added            : template "${selectedTemplate}" ✓`);

    // 5. Click Edit — opens Update ruleset panel with template data pre-filled
    await rdCreatePage.clickEditRuleset();
    await rdCreatePage.assertUpdateRulesetPanelVisible();
    console.log(`  Edit button clicked      : "Update ruleset" panel opened with data ✓`);

    // 6. Verify the Update ruleset panel is populated before clearing
    const preClickName = await rdCreatePage.assertUpdateRulesetNameField(selectedTemplate);
    console.log(`  Name before "New ruleset": "${preClickName}" (populated from template) ✓`);

    // 7. Assert "New ruleset" button is visible
    await expect(
      frame.getByRole('dialog', { name: 'Update ruleset' }).getByRole('button', { name: 'New ruleset' })
    ).toBeVisible({ timeout: 5000 });
    console.log(`  "New ruleset" button     : visible ✓`);

    // 8. Click "New ruleset" — should clear all fields
    await rdCreatePage.clickNewRulesetButtonInUpdatePanel();
    console.log(`  "New ruleset" clicked    : all fields should be cleared ✓`);

    // 9. Assert all fields are cleared — actual vs expected for each field
    const cleared = await rdCreatePage.assertFieldsClearedAfterNewRuleset();

    console.log(`  Name field after clear`);
    console.log(`    Expected               : "" (empty)`);
    console.log(`    Actual                 : "${cleared.name}" ✓`);

    console.log(`  Description field after clear`);
    console.log(`    Expected               : "" (empty)`);
    console.log(`    Actual                 : "${cleared.description}" ✓`);

    console.log(`  Defining rule section    : visible in empty state ✓`);

    console.log(`  Rule String after clear`);
    console.log(`    Expected               : "( )" (empty — no conditions)`);
    console.log(`    Actual                 : "${cleared.ruleString}" ✓`);

    // 10. Close Update ruleset panel then campaign drawer — clean state
    await rdCreatePage.closeUpdateRulesetPanel();
    await rdCreatePage.closeDrawer();
    await rdListPage.assertPageVisible();
    console.log(`  Drawer closed            : back on Redirection campaigns page ✓`);
  });

  // ─── TC-RD-016 ───────────────────────────────────────────────────────────────

  test('TC-RD-016 | should allow manual ruleset creation and display the correct details in the Ruleset table and in the Edit panel', async () => {
    const frame = sharedPage.frameLocator('[data-test-id="cf-widget-renderer"]');

    // 1. Start from a clean Redirection campaigns list page
    await rdListPage.navigate();
    console.log(`\n  Starting point           : Redirection campaigns page ✓`);

    // 2. Open the Create campaign drawer
    await rdListPage.clickCreateButton();
    await rdCreatePage.assertCreateDrawerVisible();
    console.log(`  Create campaign drawer   : opened ✓`);

    // 3. Fill campaign fields
    const campaignName = 'RE_Manual_Test';
    await rdCreatePage.fillCampaignName(campaignName);
    const filledName = await frame.getByRole('textbox', { name: 'Campaign name *' }).inputValue();
    expect(filledName, `Campaign name must be "${campaignName}"`).toBe(campaignName);
    console.log(`  Campaign name            : "${filledName}" ✓`);

    await rdCreatePage.fillStartDateTime('2030-01-01T12:00');
    console.log(`  Start date & time        : "2030-01-01T12:00" (future) ✓`);

    await rdCreatePage.selectChannelByName('new GR_1');
    console.log(`  Channel                  : "new GR_1" selected ✓`);

    // 4. Open Add ruleset panel — fill form MANUALLY (no template)
    await rdCreatePage.clickAddRuleset();
    await rdCreatePage.assertAddRulesetPanelHeading();
    console.log(`  Add ruleset panel        : opened ✓`);

    // 5. Fill ruleset name manually
    const rulesetName = 'Test Ruleset';
    await rdCreatePage.fillAddRulesetName(rulesetName);
    console.log(`  Ruleset name filled      : "${rulesetName}" ✓`);

    // 6. Select the first "name"-matching attribute that supports "startsWith"
    //    — data-agnostic (any attribute, not one pinned literal) per team
    //    direction. FIXED: was index-11 keyboard nav into the full (unfiltered)
    //    list, which silently drifted to a different, incompatible attribute as
    //    this shared QA environment's attribute inventory grew. Attribute NAMES
    //    don't reliably imply type — confirmed live that the first "name"
    //    result is actually numeric despite its label — so the picker itself
    //    checks operator compatibility per candidate (see
    //    selectFirstAvailableRuleAttribute() for full detail) rather than
    //    hanging silently for the full test timeout (the original bug class).
    const operatorValue = 'startsWith';
    const attributeLabel = await rdCreatePage.selectFirstAvailableRuleAttribute('name', operatorValue);
    console.log(`  Attribute selected       : "${attributeLabel}" (first "name" match supporting "${operatorValue}") ✓`);

    // 7. Select operator "startsWith" — the picker above already confirmed this attribute supports it
    await rdCreatePage.selectRuleConditionOperator(operatorValue);
    console.log(`  Operator selected        : "${operatorValue}" ✓`);

    // 8. Fill value input "J"
    const conditionValue = 'J';
    await rdCreatePage.fillUpdateRulesetValueInput(conditionValue);
    console.log(`  Value input filled       : "${conditionValue}" ✓`);

    // 9. Capture the generated Rule String — attribute-agnostic: rather than
    //    asserting a hardcoded internal key (which depends on which attribute
    //    was auto-picked), capture it here and assert it stays IDENTICAL after
    //    reopening the ruleset for edit (step 18 below).
    const ruleStringAfterCreate = await rdCreatePage.getRuleStringPreviewText();
    expect(
      ruleStringAfterCreate,
      'Rule String must reflect a startsWith condition on the selected attribute'
    ).toContain('.matches("(?i)^J.*")');
    console.log(`  Rule String preview      : "${ruleStringAfterCreate}" ✓`);

    // 10. Submit the Add ruleset panel — panel closes, ruleset appears in table
    await rdCreatePage.submitAddRulesetPanel();
    console.log(`  Ruleset submitted        : panel closed ✓`);

    // 11. Assert ruleset name in Ruleset table — actual vs expected
    await expect(frame.getByRole('cell', { name: rulesetName })).toBeVisible({ timeout: 10000 });
    const actualNameCell = (await frame.getByRole('cell', { name: rulesetName }).textContent())?.trim() ?? '';
    expect(
      actualNameCell,
      `Ruleset name cell mismatch\n  Expected : "${rulesetName}"\n  Actual   : "${actualNameCell}"`
    ).toBe(rulesetName);
    console.log(`  Ruleset name in table`);
    console.log(`    Expected               : "${rulesetName}"`);
    console.log(`    Actual                 : "${actualNameCell}" ✓`);

    // 12. Assert status cell "Inactive" (exact) — actual vs expected
    const expectedStatus = 'Inactive';
    await expect(
      frame.getByRole('cell', { name: expectedStatus, exact: true })
    ).toBeVisible({ timeout: 5000 });
    const actualStatusCell = (
      await frame.getByRole('cell', { name: expectedStatus, exact: true }).textContent()
    )?.trim() ?? '';
    expect(
      actualStatusCell,
      `Status cell mismatch\n  Expected : "${expectedStatus}"\n  Actual   : "${actualStatusCell}"`
    ).toBe(expectedStatus);
    console.log(`  Ruleset status in table`);
    console.log(`    Expected               : "${expectedStatus}"`);
    console.log(`    Actual                 : "${actualStatusCell}" ✓`);

    // 13. Assert toggle cell "Inactive Inactive" visible (badge + toggle — composite accessible name)
    await expect(
      frame.getByRole('cell', { name: 'Inactive Inactive' })
    ).toBeVisible({ timeout: 5000 });
    console.log(`  Toggle cell              : "Inactive Inactive" visible ✓`);

    // 14. Click Edit — open Update ruleset panel to verify saved details
    await rdCreatePage.clickEditRuleset();
    await rdCreatePage.assertUpdateRulesetPanelVisible();
    console.log(`  Edit button clicked      : "Update ruleset" panel opened ✓`);

    // 15. Assert name field matches the manually entered ruleset name — actual vs expected
    const actualEditName = await rdCreatePage.assertUpdateRulesetNameField(rulesetName);
    console.log(`  Name field in Edit panel`);
    console.log(`    Expected               : "${rulesetName}"`);
    console.log(`    Actual                 : "${actualEditName}" ✓`);

    // 15b. Assert the attribute selected when creating the condition is
    //      correctly persisted and re-displayed in the Edit panel — actual vs
    //      expected (this is the "verify on edit" check requested for the
    //      manual-attribute flow)
    const actualEditAttribute = await rdCreatePage.getUpdateRulesetAttributeFieldValue();
    expect(
      actualEditAttribute,
      `Attribute field in Edit panel mismatch\n  Expected : "${attributeLabel}"\n  Actual   : "${actualEditAttribute}"`
    ).toBe(attributeLabel);
    console.log(`  Attribute field in Edit panel`);
    console.log(`    Expected               : "${attributeLabel}"`);
    console.log(`    Actual                 : "${actualEditAttribute}" ✓`);

    // 16. Assert operator matches what was selected — actual vs expected
    const actualOperator = await rdCreatePage.getUpdateRulesetOperatorValue();
    expect(
      actualOperator,
      `Operator mismatch\n  Expected : "${operatorValue}"\n  Actual   : "${actualOperator}"`
    ).toBe(operatorValue);
    console.log(`  Operator in Edit panel`);
    console.log(`    Expected               : "${operatorValue}"`);
    console.log(`    Actual                 : "${actualOperator}" ✓`);

    // 17. Assert value input matches what was typed — actual vs expected
    const actualEditValue = await rdCreatePage.getUpdateRulesetValueInputValue();
    expect(
      actualEditValue,
      `Value input mismatch\n  Expected : "${conditionValue}"\n  Actual   : "${actualEditValue}"`
    ).toBe(conditionValue);
    console.log(`  Value input in Edit panel`);
    console.log(`    Expected               : "${conditionValue}"`);
    console.log(`    Actual                 : "${actualEditValue}" ✓`);

    // 18. Assert the Rule String in the Edit panel is identical to what was
    //     captured right after creating the condition (step 9) — actual vs
    //     expected, attribute-agnostic (no hardcoded internal key)
    const ruleStringInEditPanel = await rdCreatePage.getRuleStringPreviewText();
    expect(
      ruleStringInEditPanel,
      `Rule String in Edit panel mismatch\n  Expected : "${ruleStringAfterCreate}"\n  Actual   : "${ruleStringInEditPanel}"`
    ).toBe(ruleStringAfterCreate);
    console.log(`  Rule String in Edit panel: "${ruleStringInEditPanel}" (matches value at creation) ✓`);

    // 19. Close Update ruleset panel then campaign drawer — clean state
    await rdCreatePage.closeUpdateRulesetPanel();
    await rdCreatePage.closeDrawer();
    await rdListPage.assertPageVisible();
    console.log(`  Drawer closed            : back on Redirection campaigns page ✓`);
  });

  test('TC-RD-017 | should open the Rule panel with correct elements when user clicks "+Add rule" on a submitted ruleset', async () => {
    console.log('\n▶  STARTED  | TC-RD-017 | should open the Rule panel with correct elements when user clicks "+Add rule" on a submitted ruleset');

    // 1. Navigate to Redirection campaigns page
    await rdListPage.navigate();
    await rdListPage.assertPageVisible();
    console.log(`  Starting point           : Redirection campaigns page ✓`);

    // 2. Open Create campaign drawer
    await rdListPage.clickCreateButton();
    await rdCreatePage.assertCreateDrawerVisible();
    console.log(`  Create campaign drawer   : opened ✓`);

    // 3. Fill campaign name
    const campaignName = 'Test_RD_1';
    await rdCreatePage.fillCampaignName(campaignName);
    console.log(`  Campaign name            : "${campaignName}" ✓`);

    // 4. Fill start date & time
    await rdCreatePage.fillStartDateTime('2030-01-01T12:00');
    console.log(`  Start date & time        : "2030-01-01T12:00" (future) ✓`);

    // 5. Select channel
    await rdCreatePage.selectChannelByName('new GR_1');
    console.log(`  Channel                  : "new GR_1" selected ✓`);

    // 6. Open Add ruleset panel and assert heading
    await rdCreatePage.clickAddRuleset();
    await rdCreatePage.assertAddRulesetPanelHeading();
    console.log(`  Add ruleset panel        : opened ✓`);

    // 7. Open template dropdown and select the first available template
    await rdCreatePage.openTemplateDropdown();
    const selectedTemplate = await rdCreatePage.selectFirstAvailableTemplate();
    console.log(`  Template selected        : "${selectedTemplate}" ✓`);

    // 8. Submit the Add ruleset panel — panel closes; ruleset row appears in campaign
    await rdCreatePage.submitAddRulesetPanel();
    console.log(`  Ruleset submitted        : panel closed ✓`);

    // 9. Click the "+Add rule" button (custom) on the submitted ruleset row
    await rdCreatePage.clickCustomAddRule();
    console.log(`  "+Add rule" clicked      : Rule panel should appear ✓`);

    // 10. Assert Rule panel heading
    const expectedHeading = 'Rule';
    const actualHeading   = await rdCreatePage.assertRulePanelHeading();
    console.log(`  Rule panel heading`);
    console.log(`    Expected               : "${expectedHeading}"`);
    console.log(`    Actual                 : "${actualHeading}" ✓`);

    // 11. Assert "Add rule" button is visible inside the Rule panel
    const actualAddRuleBtnText = await rdCreatePage.assertRulePanelAddRuleButton();
    console.log(`  "Add rule" button        : visible (text: "${actualAddRuleBtnText}") ✓`);

    // 12. Assert Save/Submit button is visible inside the Rule panel
    const actualSubmitBtnText = await rdCreatePage.assertRulePanelSubmitButton();
    console.log(`  Submit button            : visible (text: "${actualSubmitBtnText}") ✓`);

    // 13. Assert Cancel/Close button is visible inside the Rule panel
    await rdCreatePage.assertRulePanelCancelButton();
    console.log(`  Cancel button            : visible ✓`);

    // 14. Assert empty-state text "No records found"
    const expectedEmpty = 'No records found';
    const actualEmpty   = await rdCreatePage.assertRulePanelEmptyState();
    console.log(`  Empty state text`);
    console.log(`    Expected               : "${expectedEmpty}"`);
    console.log(`    Actual                 : "${actualEmpty}" ✓`);

    // 15. Close Rule panel then campaign drawer — clean state
    await rdCreatePage.closeRulePanel();
    console.log(`  Rule panel closed        ✓`);
    await rdCreatePage.closeDrawer();
    await rdListPage.assertPageVisible();
    console.log(`  Drawer closed            : back on Redirection campaigns page ✓`);
  });

  test('TC-RD-018 | should open the Add rule panel with correct heading, fields (Name, Description, Defining rule, Rule String), buttons and empty initial state when +Add rule is clicked inside the Rule panel', async () => {
    console.log('\n▶  STARTED  | TC-RD-018 | should open the Add rule panel with correct heading, fields, buttons and empty initial state when +Add rule is clicked inside the Rule panel');

    // 1. Navigate to Redirection campaigns page
    await rdListPage.navigate();
    await rdListPage.assertPageVisible();
    console.log(`  Starting point           : Redirection campaigns page ✓`);

    // 2. Open Create campaign drawer
    await rdListPage.clickCreateButton();
    await rdCreatePage.assertCreateDrawerVisible();
    console.log(`  Create campaign drawer   : opened ✓`);

    // 3. Fill campaign name
    const campaignName = 'Test_RD_1';
    await rdCreatePage.fillCampaignName(campaignName);
    console.log(`  Campaign name            : "${campaignName}" ✓`);

    // 4. Fill start date & time
    await rdCreatePage.fillStartDateTime('2030-01-01T12:00');
    console.log(`  Start date & time        : "2030-01-01T12:00" (future) ✓`);

    // 5. Select channel
    await rdCreatePage.selectChannelByName('new GR_1');
    console.log(`  Channel                  : "new GR_1" selected ✓`);

    // 6. Open Add ruleset panel, select template, submit
    await rdCreatePage.clickAddRuleset();
    await rdCreatePage.assertAddRulesetPanelHeading();
    await rdCreatePage.openTemplateDropdown();
    const selectedTemplate = await rdCreatePage.selectFirstAvailableTemplate();
    console.log(`  Template selected        : "${selectedTemplate}" ✓`);
    await rdCreatePage.submitAddRulesetPanel();
    console.log(`  Ruleset submitted        : panel closed ✓`);

    // 7. Click "+Add rule" (custom) on the ruleset row → opens Rule panel
    await rdCreatePage.clickCustomAddRule();
    console.log(`  Rule panel opened        ✓`);

    // 8. Click "Add rule" inside Rule panel → opens Add rule panel
    await rdCreatePage.clickAddRuleInsideRulePanel();
    console.log(`  Add rule panel opened    ✓`);

    // 9. Assert Add rule panel heading
    const actualHeading = await rdCreatePage.assertAddRulePanelHeading();
    console.log(`  Add rule panel heading`);
    console.log(`    Expected               : "Add rule"`);
    console.log(`    Actual                 : "${actualHeading}" ✓`);

    // 10. Assert "Name *" label visible and field is initially empty
    await rdCreatePage.assertAddRulePanelNameLabel();
    const actualNameValue    = await rdCreatePage.getAddRulePanelNameFieldValue();
    const expectedNameValue  = '';
    expect(
      actualNameValue,
      `Name field should be empty initially\n  Expected : "${expectedNameValue}"\n  Actual   : "${actualNameValue}"`
    ).toBe(expectedNameValue);
    console.log(`  "Name *" label           : visible ✓`);
    console.log(`  Name field initial value`);
    console.log(`    Expected               : "" (empty)`);
    console.log(`    Actual                 : "${actualNameValue}" ✓`);

    // 11. Assert "Description" label visible and textarea is initially empty
    await rdCreatePage.assertAddRulePanelDescriptionLabel();
    const actualDescValue   = await rdCreatePage.getAddRulePanelDescriptionValue();
    const expectedDescValue = '';
    expect(
      actualDescValue,
      `Description should be empty initially\n  Expected : "${expectedDescValue}"\n  Actual   : "${actualDescValue}"`
    ).toBe(expectedDescValue);
    console.log(`  "Description" label      : visible ✓`);
    console.log(`  Description initial value`);
    console.log(`    Expected               : "" (empty)`);
    console.log(`    Actual                 : "${actualDescValue}" ✓`);

    // 12. Assert "Defining rule *" section visible (heading + All/Any radio group)
    await rdCreatePage.assertAddRulePanelDefiningRuleSection();
    console.log(`  "Defining rule *" section: visible (All/AND · Any/OR radio) ✓`);

    // 13. Assert "Rule String" label visible and shows "( )" (empty — no conditions)
    const actualRuleString   = await rdCreatePage.assertAddRulePanelRuleStringEmpty();
    const expectedRuleString = '( )';
    console.log(`  "Rule String" label      : visible ✓`);
    console.log(`  Rule String initial value`);
    console.log(`    Expected               : "${expectedRuleString}" (empty — no conditions)`);
    console.log(`    Actual                 : "${actualRuleString}" ✓`);

    // 14. Assert template dropdown shows "Choose a template" placeholder
    await rdCreatePage.assertAddRulePanelTemplateDropdown();
    console.log(`  Template dropdown        : "Choose a template" visible ✓`);

    // 15. Assert New rule, Add rule (exact), and Cancel buttons
    const { newRule: newRuleText, addRule: addRuleText } = await rdCreatePage.assertAddRulePanelButtons();
    console.log(`  "New rule" button`);
    console.log(`    Expected               : "New rule"`);
    console.log(`    Actual                 : "${newRuleText}" ✓`);
    console.log(`  "Add rule" button`);
    console.log(`    Expected               : "Add rule"`);
    console.log(`    Actual                 : "${addRuleText}" ✓`);
    console.log(`  Cancel button            : visible ✓`);

    // 16. Clean up: close Add rule panel → Rule panel → campaign drawer
    await rdCreatePage.closeAddRulePanel();
    console.log(`  Add rule panel closed    ✓`);
    await rdCreatePage.closeRulePanel();
    console.log(`  Rule panel closed        ✓`);
    await rdCreatePage.closeDrawer();
    await rdListPage.assertPageVisible();
    console.log(`  Drawer closed            : back on Redirection campaigns page ✓`);
  });

  test('TC-RD-019 | should display added rule in the Rule table with Inactive status and action buttons, and correctly show details in the Update rule panel when Edit is clicked', async () => {
    console.log('\n▶  STARTED  | TC-RD-019 | should display added rule in Rule table with Inactive status and action buttons, and show correct details in Update rule panel on Edit');

    // 1. Navigate to Redirection campaigns page
    await rdListPage.navigate();
    await rdListPage.assertPageVisible();
    console.log(`  Starting point           : Redirection campaigns page ✓`);

    // 2. Open Create campaign drawer
    await rdListPage.clickCreateButton();
    await rdCreatePage.assertCreateDrawerVisible();
    console.log(`  Create campaign drawer   : opened ✓`);

    // 3. Fill campaign details
    const campaignName = 'Test_RD_1';
    await rdCreatePage.fillCampaignName(campaignName);
    await rdCreatePage.fillStartDateTime('2030-01-01T12:00');
    await rdCreatePage.selectChannelByName('new GR_1');
    console.log(`  Campaign name            : "${campaignName}" ✓`);
    console.log(`  Start date & time        : "2030-01-01T12:00" (future) ✓`);
    console.log(`  Channel                  : "new GR_1" selected ✓`);

    // 4. Add ruleset via template, submit
    await rdCreatePage.clickAddRuleset();
    await rdCreatePage.assertAddRulesetPanelHeading();
    await rdCreatePage.openTemplateDropdown();
    const rulesetTemplate = await rdCreatePage.selectFirstAvailableTemplate();
    await rdCreatePage.submitAddRulesetPanel();
    console.log(`  Ruleset submitted        : template "${rulesetTemplate}" ✓`);

    // 5. Click "+Add rule" (custom) → opens Rule panel
    await rdCreatePage.clickCustomAddRule();
    console.log(`  Rule panel opened        ✓`);

    // 6. Click "Add rule" inside Rule panel → opens Add rule panel
    await rdCreatePage.clickAddRuleInsideRulePanel();
    console.log(`  Add rule panel opened    ✓`);

    // 7. Open template dropdown inside Add rule panel and select 'Age>20'
    const ruleTemplateName = 'Age>20';
    await rdCreatePage.openAddRulePanelTemplateDropdown();
    await rdCreatePage.selectAddRulePanelTemplate(ruleTemplateName);
    console.log(`  Rule template selected   : "${ruleTemplateName}" ✓`);

    // 8. Submit Add rule panel — rule appears in Rule table
    await rdCreatePage.submitAddRulePanel();
    const ruleRowAriaName = 'Reorder item Age>20 True';
    await rdCreatePage.assertRuleRowVisible(ruleRowAriaName);
    console.log(`  Rule added               : row "${ruleRowAriaName}" visible ✓`);

    // 9. Assert rule name cell
    const actualRuleName   = await rdCreatePage.getRuleRowNameCellText('Age>');
    const expectedRuleName = 'Age>20';
    console.log(`  Rule name cell`);
    console.log(`    Expected               : "${expectedRuleName}"`);
    console.log(`    Actual                 : "${actualRuleName}" ✓`);

    // 10. Assert "True" value cell
    const actualTrueCell = await rdCreatePage.getRuleRowNameCellText('True');
    console.log(`  Value cell               : "${actualTrueCell}" ✓`);

    // 11. Assert initial status is "Inactive"
    const expectedStatus = 'Inactive';
    const actualStatus   = await rdCreatePage.getRuleRowStatusCellText(expectedStatus);
    console.log(`  Rule initial status`);
    console.log(`    Expected               : "${expectedStatus}"`);
    console.log(`    Actual                 : "${actualStatus}" ✓`);

    // 12. Assert "+ Add Redirection URL" button visible
    const addRedirText = await rdCreatePage.assertRuleRowAddRedirectionUrlButton();
    console.log(`  "+ Add Redirection URL" button`);
    console.log(`    Expected               : "+ Add Redirection URL"`);
    console.log(`    Actual                 : "${addRedirText}" ✓`);

    // 13. Assert Edit and Delete buttons visible in the rule row
    await rdCreatePage.assertRuleRowEditButton(ruleRowAriaName);
    console.log(`  Edit button              : visible in rule row ✓`);
    await rdCreatePage.assertRuleRowDeleteButton(ruleRowAriaName);
    console.log(`  Delete button            : visible in rule row ✓`);

    // 14. Assert Rule panel Continue and Cancel buttons still visible
    await rdCreatePage.assertRulePanelSubmitButton();
    await rdCreatePage.assertRulePanelCancelButton();
    console.log(`  Rule panel buttons       : Continue + Cancel still visible ✓`);

    // 15. Click Edit button — opens Update rule panel
    await rdCreatePage.clickRuleRowEditButton(ruleRowAriaName);
    const actualUpdateHeading = await rdCreatePage.assertUpdateRulePanelHeading();
    console.log(`  Update rule panel heading`);
    console.log(`    Expected               : "Update rule"`);
    console.log(`    Actual                 : "${actualUpdateHeading}" ✓`);

    // 16. Assert name field shows the added rule name
    const actualEditName = await rdCreatePage.getUpdateRulePanelNameValue();
    console.log(`  Rule name in Update panel`);
    console.log(`    Expected               : "${ruleTemplateName}"`);
    console.log(`    Actual                 : "${actualEditName}" ✓`);
    expect(
      actualEditName,
      `Update rule name mismatch\n  Expected : "${ruleTemplateName}"\n  Actual   : "${actualEditName}"`
    ).toBe(ruleTemplateName);

    // 17. Clean up: close Update rule → Rule panel → campaign drawer
    await rdCreatePage.closeUpdateRulePanel();
    console.log(`  Update rule panel closed ✓`);
    await rdCreatePage.closeRulePanel();
    console.log(`  Rule panel closed        ✓`);
    await rdCreatePage.closeDrawer();
    await rdListPage.assertPageVisible();
    console.log(`  Drawer closed            : back on Redirection campaigns page ✓`);
  });

  test('TC-RD-020 | should allow manual rule creation and display the rule name in the Rule table after user fills all fields and clicks Add rule', async () => {
    console.log('\n▶  STARTED  | TC-RD-020 | should allow manual rule creation and display the rule name in the Rule table');

    // 1. Navigate to Redirection campaigns page
    await rdListPage.navigate();
    await rdListPage.assertPageVisible();
    console.log(`  Starting point           : Redirection campaigns page ✓`);

    // 2. Open Create campaign drawer
    await rdListPage.clickCreateButton();
    await rdCreatePage.assertCreateDrawerVisible();
    console.log(`  Create campaign drawer   : opened ✓`);

    // 3. Fill campaign details
    const campaignName = 'Test_RD_1';
    await rdCreatePage.fillCampaignName(campaignName);
    await rdCreatePage.fillStartDateTime('2030-01-01T12:00');
    await rdCreatePage.selectChannelByName('new GR_1');
    console.log(`  Campaign name            : "${campaignName}" ✓`);
    console.log(`  Start date & time        : "2030-01-01T12:00" (future) ✓`);
    console.log(`  Channel                  : "new GR_1" selected ✓`);

    // 4. Add ruleset via template, submit
    await rdCreatePage.clickAddRuleset();
    await rdCreatePage.assertAddRulesetPanelHeading();
    await rdCreatePage.openTemplateDropdown();
    const rulesetTemplate = await rdCreatePage.selectFirstAvailableTemplate();
    await rdCreatePage.submitAddRulesetPanel();
    console.log(`  Ruleset submitted        : template "${rulesetTemplate}" ✓`);

    // 5. Click "+Add rule" (custom) → Rule panel opens
    await rdCreatePage.clickCustomAddRule();
    console.log(`  Rule panel opened        ✓`);

    // 6. Click "Add rule" → Add rule panel opens
    await rdCreatePage.clickAddRuleInsideRulePanel();
    console.log(`  Add rule panel opened    ✓`);

    // 7. Open template dropdown → select "Name Starts With j" to auto-fill form
    await rdCreatePage.openAddRulePanelTemplateDropdown();
    await rdCreatePage.selectAddRulePanelTemplate('Name Starts With j');
    console.log(`  Template "Name Starts With j" selected (form auto-filled) ✓`);

    // 8. Click "New rule" to clear the auto-filled form
    await rdCreatePage.clickNewRuleButton();
    console.log(`  "New rule" clicked       : form should be cleared ✓`);

    // 9. Assert form is cleared — name, description empty; rule string shows "( )"
    const nameAfterClear = await rdCreatePage.getAddRulePanelNameFieldValue();
    const descAfterClear = await rdCreatePage.getAddRulePanelDescriptionValue();
    const expectedEmpty  = '';
    expect(nameAfterClear, `Name should be empty after New rule\n  Expected : ""\n  Actual   : "${nameAfterClear}"`).toBe(expectedEmpty);
    expect(descAfterClear, `Description should be empty after New rule\n  Expected : ""\n  Actual   : "${descAfterClear}"`).toBe(expectedEmpty);
    await rdCreatePage.assertAddRulePanelRuleStringEmpty();
    console.log(`  Form cleared by "New rule"`);
    console.log(`    Name field             : "" (empty) ✓`);
    console.log(`    Description field      : "" (empty) ✓`);
    console.log(`    Rule String            : "( )" (no conditions) ✓`);

    // 10. Fill name manually
    const ruleName = 'manual rule';
    await rdCreatePage.fillAddRulePanelName(ruleName);
    console.log(`  Rule name filled         : "${ruleName}" ✓`);

    // 11. Select attribute "User_Age [User]" by name — FIXED: was a filtered
    //     "age" search assuming list-item-2 is the numeric Age attribute, which
    //     silently drifted to "Campaign Management ID [Session]" (not numeric —
    //     no "<" operator) as this shared QA environment's attribute inventory
    //     grew (see selectRuleAttributeByName() for full detail). "User_Age
    //     [User]" is confirmed live to be numeric-comparable (its operator
    //     dropdown includes value "<").
    const attributeLabel = 'User_Age [User]';
    await rdCreatePage.selectRuleAttributeByName(attributeLabel);
    console.log(`  Attribute selected       : "${attributeLabel}" (by name, not position) ✓`);

    // 12. Select operator by value "<"
    const operatorValue = '<';
    await rdCreatePage.selectAddRulePanelOperator(operatorValue);
    console.log(`  Operator selected        : "${operatorValue}" ✓`);

    // 13. Fill value "20"
    const ruleValue = '20';
    await rdCreatePage.fillAddRulePanelValue(ruleValue);
    console.log(`  Value filled             : "${ruleValue}" ✓`);

    // 14. Submit Add rule panel
    await rdCreatePage.submitAddRulePanel();
    console.log(`  Rule submitted           : panel closed ✓`);

    // 15. Assert Edit button visible in Rule dialog (rule was added)
    await rdCreatePage.assertRuleDialogEditButtonVisible();
    console.log(`  Edit button              : visible in Rule table ✓`);

    // 16. Click Edit → Update rule panel; assert name shows the manually entered value
    await rdCreatePage.clickRuleDialogEditButton();
    const actualUpdateHeading = await rdCreatePage.assertUpdateRulePanelHeading();
    console.log(`  Update rule panel heading`);
    console.log(`    Expected               : "Update rule"`);
    console.log(`    Actual                 : "${actualUpdateHeading}" ✓`);

    const actualEditName = await rdCreatePage.getUpdateRulePanelNameValue();
    expect(
      actualEditName,
      `Update rule name mismatch\n  Expected : "${ruleName}"\n  Actual   : "${actualEditName}"`
    ).toBe(ruleName);
    console.log(`  Rule name in Update panel`);
    console.log(`    Expected               : "${ruleName}"`);
    console.log(`    Actual                 : "${actualEditName}" ✓`);

    // 17. Close Update rule panel
    await rdCreatePage.closeUpdateRulePanel();
    console.log(`  Update rule panel closed ✓`);

    // 18. Assert rule name cell "manual rule" visible in Rule table
    const actualRuleNameCell = await rdCreatePage.getRuleRowNameCellText(ruleName);
    expect(
      actualRuleNameCell,
      `Rule name cell mismatch\n  Expected : "${ruleName}"\n  Actual   : "${actualRuleNameCell}"`
    ).toBe(ruleName);
    console.log(`  Rule name cell in table`);
    console.log(`    Expected               : "${ruleName}"`);
    console.log(`    Actual                 : "${actualRuleNameCell}" ✓`);

    // 19. Cleanup: close Rule panel → campaign drawer → list page
    await rdCreatePage.closeRulePanel();
    console.log(`  Rule panel closed        ✓`);
    await rdCreatePage.closeDrawer();
    await rdListPage.assertPageVisible();
    console.log(`  Drawer closed            : back on Redirection campaigns page ✓`);
  });

  // ─── TC-RD-021 ───────────────────────────────────────────────────────────────
  // End-to-end creation flow: Campaign name/date/channel → Ruleset (from template)
  // → Rule (from template) → Redirection URL with A/B testing enabled (end date +
  // 50/50 traffic split) → Save & Activate. Verifies the campaign then appears in
  // the list with the correct name and a "Scheduled" status, and that the saved
  // Default/Redirection pathnames are reflected in the View Details modal.
  //
  // NOTE ON "Schedule campaign" (per task wording): the app's real Status
  // vocabulary (confirmed live via the Status filter menu) is Live / Scheduled /
  // Paused / Draft / Expired — there is no literal "Schedule campaign" value
  // anywhere in the UI. This test asserts the actual status text "Scheduled".
  //
  // NOTE ON success toast: no distinct success-toast text was observed for a
  // Redirection campaign save (unlike the validation-failure toasts in
  // TC-RD-005/008, which DO render visible text). Success is asserted via the
  // "Create campaign" drawer auto-closing, then confirmed by the campaign
  // appearing in the list — see assertCampaignSavedSuccessfully().

  test('TC-RD-021 | should create a full Redirection campaign with a templated ruleset/rule, an A/B tested Redirection URL (50/50 split), and display it in the list with Scheduled status', async () => {
    const frame = sharedPage.frameLocator('[data-test-id="cf-widget-renderer"]');

    // 1. Start from a clean Redirection campaigns list page
    await rdListPage.navigate();
    console.log(`\n  Starting point           : Redirection campaigns page ✓`);

    // 2. Open the Create campaign drawer
    await rdListPage.clickCreateButton();
    await rdCreatePage.assertCreateDrawerVisible();
    console.log(`  Create campaign drawer   : opened ✓`);

    // 3. Fill Campaign name with a run-unique timestamp suffix
    const campaignName = `Test_Redirect_${Date.now()}`;
    await rdCreatePage.fillCampaignName(campaignName);
    const filledName = await frame.getByRole('textbox', { name: 'Campaign name *' }).inputValue();
    expect(filledName, `Campaign name must be "${campaignName}"`).toBe(campaignName);
    console.log(`  Campaign name            : "${filledName}" ✓`);

    // 4. Fill a valid future start date
    const startDate = '2030-06-01T10:00';
    await rdCreatePage.fillStartDateTime(startDate);
    console.log(`  Start date & time        : "${startDate}" (future) ✓`);

    // 5. Select the "web" channel by name
    //    FRAGILE: the Channels dropdown also contains a separate, distinct "WEB"
    //    (uppercase) entry — "web" (lowercase) is selected here as the closest
    //    match to the task's "Web" channel. Confirm with the team which one is
    //    the intended channel if this ever needs to be more specific.
    await rdCreatePage.selectChannelByName('web');
    console.log(`  Channel                  : "web" selected ✓`);

    // 6. Add a Ruleset from the template dropdown (first available template — data-agnostic)
    await rdCreatePage.clickAddRuleset();
    await rdCreatePage.assertAddRulesetPanelHeading();
    await rdCreatePage.openTemplateDropdown();
    const rulesetTemplate = await rdCreatePage.selectFirstAvailableTemplate();
    console.log(`  Ruleset template selected: "${rulesetTemplate}" ✓`);

    // 7. Submit the Add ruleset panel — ruleset row appears in the table
    await rdCreatePage.submitAddRulesetPanel();
    await rdCreatePage.assertRulesetAddedToTable(rulesetTemplate);
    console.log(`  Ruleset added            : "${rulesetTemplate}" in table ✓`);

    // 8. Click "+ Add rules" on the ruleset row — opens the Rule panel
    await rdCreatePage.clickCustomAddRule();
    await rdCreatePage.assertRulePanelHeading();
    console.log(`  Rule panel               : opened ✓`);

    // 9. Click "+ Add rule" inside the Rule panel — opens the Add rule panel
    await rdCreatePage.clickAddRuleInsideRulePanel();
    await rdCreatePage.assertAddRulePanelHeading();
    console.log(`  Add rule panel           : opened ✓`);

    // 10. Choose a template from the Add rule panel's dropdown (first available)
    await rdCreatePage.openAddRulePanelTemplateDropdown();
    const ruleTemplate = await rdCreatePage.selectFirstAvailableTemplate();
    console.log(`  Rule template selected   : "${ruleTemplate}" ✓`);

    // 11. Submit the Add rule panel — rule row appears in the Rule table
    await rdCreatePage.submitAddRulePanel();
    await rdCreatePage.assertRuleDialogEditButtonVisible();
    console.log(`  Rule submitted           : "${ruleTemplate}" added to Rule table ✓`);

    // 12. "+ Add Redirection URL" is visible on the new rule row — capture actual text
    const addRedirectionUrlText = await rdCreatePage.assertRuleRowAddRedirectionUrlButton();
    console.log(`  "+ Add Redirection URL" button`);
    console.log(`    Expected               : "+ Add Redirection URL"`);
    console.log(`    Actual                 : "${addRedirectionUrlText}" ✓`);

    // 13. Click "+ Add Redirection URL" — opens the "Add experience" panel
    await rdCreatePage.clickAddRedirectionUrl();
    await rdCreatePage.assertAddExperiencePanelVisible();
    console.log(`  Add experience panel     : opened ✓`);

    // 14. Fill Default Pathname and Redirection Pathname
    const defaultPathname     = '/home';
    const redirectionPathname = '/page1';
    await rdCreatePage.fillDefaultPathname(defaultPathname);
    await rdCreatePage.fillRedirectionPathname(redirectionPathname);
    console.log(`  Default Pathname         : "${defaultPathname}" ✓`);
    console.log(`  Redirection Pathname     : "${redirectionPathname}" ✓`);

    // 15. Enable A/B testing — reveals the end date field and traffic split inputs
    await rdCreatePage.enableAbTesting();
    console.log(`  A/B testing              : enabled (toggle "Disabled" → "Enable") ✓`);

    // 16. Fill the A/B test end date & time
    const abTestEndDate = '2030-12-31T10:00';
    await rdCreatePage.fillAbTestEndDate(abTestEndDate);
    console.log(`  A/B test end date & time : "${abTestEndDate}" ✓`);

    // 17. Set the traffic split to 50/50 — Default Experience auto-computes from Redirect Experience
    await rdCreatePage.setAbTestTrafficSplit(50);
    const trafficValues = await rdCreatePage.getAbTestTrafficValues();
    expect(trafficValues.redirect, 'Redirect Experience traffic must be "50"').toBe('50');
    expect(trafficValues.defaultExp, 'Default Experience traffic must auto-compute to "50"').toBe('50');
    console.log(`  Traffic split`);
    console.log(`    Redirect Experience    : "${trafficValues.redirect}%" ✓`);
    console.log(`    Default Experience     : "${trafficValues.defaultExp}%" (auto-computed) ✓`);

    // 18. Submit "Add experience" — panel closes, no validation errors
    await rdCreatePage.submitAddExperience();
    console.log(`  Add experience submitted : panel closed ✓`);

    // 19. Rule row action now shows "View Redirection URL" — proof the experience was saved
    await rdCreatePage.assertViewRedirectionUrlButtonVisible();
    console.log(`  Rule row action          : "View Redirection URL" visible (experience saved) ✓`);

    // 20. Click "Continue" to return to the Create campaign drawer
    await rdCreatePage.clickContinueRulePanel();
    await rdCreatePage.assertCreateDrawerVisible();
    console.log(`  Continue clicked         : back on Create campaign drawer ✓`);

    // 21. Save & Activate the campaign
    await rdCreatePage.clickSaveActivate();
    console.log(`  Save & Activate clicked  : ✓`);

    // 22. Assert the drawer closes — the only observed signal of a successful save
    //     (see NOTE ON success toast above)
    await rdCreatePage.assertCampaignSavedSuccessfully();
    console.log(`  Campaign saved           : "Create campaign" drawer closed ✓`);
    await rdListPage.assertPageVisible();
    console.log(`  Back on list page        : "Redirection campaigns" heading visible ✓`);

    // 23. Search for the new campaign by name (widening the Date filter to "All
    //     days" — the default "Today" filter hides this future-dated campaign)
    await rdListPage.searchByName(campaignName);
    console.log(`  Searched by name         : "${campaignName}" (Date filter: All days) ✓`);

    // 24. Assert the campaign row is visible with the correct name — actual vs expected
    await rdListPage.assertCampaignRowVisible(campaignName);
    console.log(`  Campaign in list`);
    console.log(`    Expected               : "${campaignName}"`);
    console.log(`    Actual                 : visible ✓`);

    // 25. Assert the Status cell shows "Scheduled" — actual vs expected
    //     (this is the real UI value for the task's "Schedule campaign" — see NOTE above)
    const actualStatus   = await rdListPage.getCampaignStatusCellText(campaignName);
    const expectedStatus = 'Scheduled';
    expect(
      actualStatus,
      `Campaign status mismatch\n  Expected : "${expectedStatus}"\n  Actual   : "${actualStatus}"`
    ).toBe(expectedStatus);
    console.log(`  Campaign status`);
    console.log(`    Expected               : "${expectedStatus}"`);
    console.log(`    Actual                 : "${actualStatus}" ✓`);

    // 26. Open View Details and assert the heading and saved pathnames
    await rdListPage.clickViewDetails(campaignName);
    const detailsHeading = await rdListPage.assertViewDetailsHeading(campaignName, expectedStatus);
    console.log(`  View Details heading`);
    console.log(`    Expected               : "${campaignName} ${expectedStatus}"`);
    console.log(`    Actual                 : "${detailsHeading}" ✓`);

    await rdListPage.assertViewDetailsPathnames(defaultPathname, redirectionPathname);
    console.log(`  View Details pathnames`);
    console.log(`    Control (Default)      : "${defaultPathname}" ✓`);
    console.log(`    Variant (Redirection)  : "${redirectionPathname}" ✓`);

    // 27. Close the modal — clean state for subsequent tests
    await rdListPage.closeViewDetailsModal();
    console.log(`  View Details modal       : closed ✓`);
  });

  // ─── TC-RD-022 ───────────────────────────────────────────────────────────────
  // Converted from a Playwright codegen recording. The recorded flow: fill name +
  // start date, select channel, add a Ruleset from a template, toggle it
  // Inactive → Active, open the Rule panel then the Add rule panel and close both
  // WITHOUT adding a rule, then click "Save & Activate Campaign" — verified live
  // (the codegen only asserted the notification's visibility, not its text) that
  // this surfaces the page-level notification "Add rule for every rule set".
  //
  // CODEGEN DEVIATIONS (see chat notes for full detail):
  //  - Dropped a no-op line clicking a wrapper div matching the button-container
  //    text — not a real element interaction, an artifact of the recording.
  //  - The recording never actually picked a Channels option (it clicked the
  //    dropdown open via a fragile nth(1) index, then moved straight to "Add
  //    ruleset") — reused the already-fixed, robust selectChannelByName('web')
  //    instead, since a channel must be selected for the Ruleset section to work.
  //  - Replaced the recorded near-term start date (2026-08-27, which goes stale
  //    within days of this recording) with this file's standard far-future
  //    "2030-01-01T12:00".
  //  - The "Close this consent banner" step is NOT reproduced: it only appears on
  //    a genuinely cookie-less first login (how codegen recorded it), never when
  //    reusing auth/user.json via storageState as this whole suite does.

  test('TC-RD-022 | should display "Add rule for every rule set" validation notification when Save & Activate is clicked with an Active ruleset that has no rules', async () => {
    const frame = sharedPage.frameLocator('[data-test-id="cf-widget-renderer"]');

    // 1. Start from a clean Redirection campaigns list page
    await rdListPage.navigate();
    console.log(`\n  Starting point           : Redirection campaigns page ✓`);

    // 2. Open the Create campaign drawer
    await rdListPage.clickCreateButton();
    await rdCreatePage.assertCreateDrawerVisible();
    console.log(`  Create campaign drawer   : opened ✓`);

    // 3. Fill Campaign name
    const campaignName = 'RE_Active_NoRule_Test';
    await rdCreatePage.fillCampaignName(campaignName);
    const filledName = await frame.getByRole('textbox', { name: 'Campaign name *' }).inputValue();
    expect(filledName, `Campaign name must be "${campaignName}"`).toBe(campaignName);
    console.log(`  Campaign name            : "${filledName}" ✓`);

    // 4. Fill a valid future start date
    const futureDate = '2030-01-01T12:00';
    await rdCreatePage.fillStartDateTime(futureDate);
    console.log(`  Start date & time        : "${futureDate}" (future) ✓`);

    // 5. Select the "web" channel by name
    await rdCreatePage.selectChannelByName('web');
    console.log(`  Channel                  : "web" selected ✓`);

    // 6. Add a Ruleset from the "Age>20" template
    await rdCreatePage.clickAddRuleset();
    await rdCreatePage.assertAddRulesetPanelHeading();
    await rdCreatePage.openTemplateDropdown();
    const templateName = 'Age>20';
    await rdCreatePage.selectTemplate(templateName);
    console.log(`  Ruleset template selected: "${templateName}" ✓`);

    // 7. Submit the Add ruleset panel — ruleset row appears in the table
    await rdCreatePage.submitAddRulesetPanel();
    await rdCreatePage.assertRulesetAddedToTable(templateName);
    console.log(`  Ruleset added            : "${templateName}" in table ✓`);

    // 8. Toggle the ruleset from Inactive → Active — actual vs expected
    await rdCreatePage.clickRulesetInactiveToggle();
    const activeStatus = await rdCreatePage.assertRulesetStatusActive();
    console.log(`  Ruleset status`);
    console.log(`    Expected               : "Active"`);
    console.log(`    Actual                 : "${activeStatus}" ✓`);

    // 9. Click "+ Add rules" on the ruleset row — opens the Rule panel
    await rdCreatePage.clickCustomAddRule();
    await rdCreatePage.assertRulePanelHeading();
    console.log(`  Rule panel               : opened ✓`);

    // 10. Click "+ Add rule" inside the Rule panel — opens the Add rule panel
    await rdCreatePage.clickAddRuleInsideRulePanel();
    await rdCreatePage.assertAddRulePanelHeading();
    console.log(`  Add rule panel           : opened ✓`);

    // 11. Close the Add rule panel WITHOUT filling anything — no rule is added
    //     (mirrors the codegen recording, which cancelled out of this panel)
    await rdCreatePage.closeAddRulePanel();
    console.log(`  Add rule panel closed    : no rule added ✓`);

    // 12. Close the Rule panel — back on the Create campaign drawer
    await rdCreatePage.closeRulePanel();
    await rdCreatePage.assertCreateDrawerVisible();
    console.log(`  Rule panel closed        : back on Create campaign drawer ✓`);

    // 13. Click "Save & Activate Campaign" — the ruleset is Active but has zero rules
    await rdCreatePage.clickSaveActivate();
    console.log(`  Save & Activate clicked  : Active ruleset has no rules ✓`);

    // 14. A page-level Contentful notification appears — capture actual text then
    //     compare to the expected message (confirmed live via the browser; the
    //     source codegen recording only asserted visibility, not the text itself)
    const actualMsg   = await rdCreatePage.assertDraftValidationNotification();
    const expectedMsg = 'Add rule for every rule set';
    console.log(`  Validation notification`);
    console.log(`    Expected               : "${expectedMsg}"`);
    console.log(`    Actual                 : "${actualMsg}"`);
    expect(
      actualMsg,
      `Active-ruleset-no-rule notification mismatch\n  Expected : "${expectedMsg}"\n  Actual   : "${actualMsg}"`
    ).toBe(expectedMsg);
    console.log(`    Match    : ✓`);

    // 15. Dismiss the notification, close the drawer, return to a clean state
    await rdCreatePage.dismissNotificationIfVisible();
    console.log(`  Notification dismissed   : ✓`);

    if (await frame.getByRole('heading', { name: 'Create campaign' }).isVisible({ timeout: 2000 }).catch(() => false)) {
      await rdCreatePage.closeDrawer();
    }
    await rdListPage.assertPageVisible();
    console.log(`  Drawer closed            : back on Redirection campaigns page ✓`);
  });
});
