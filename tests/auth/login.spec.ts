import { test } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { SpacePage } from '../../pages/SpacePage';
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

// ─── TC-001 to TC-005 | Login Page UI ─────────────────────────────────────────

test.describe('Login Page UI', () => {
  let loginPage!: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.navigate();
  });

  test('TC-001 | should render all login form elements', async () => {
    await loginPage.assertPageElements();
  });

  test('TC-002 | should display correct page headings', async () => {
    await loginPage.assertHeadings();
  });

  test('TC-003 | should display alternative login options (SSO, Google, GitHub)', async () => {
    await loginPage.assertAlternativeLoginOptions();
  });

  test('TC-004 | should display help links (Reset password, Resend confirmation, Unlock account)', async () => {
    await loginPage.assertHelpLinks();
  });

  test('TC-005 | should mask the password input field', async () => {
    await loginPage.assertPasswordMasked();
  });
});

// ─── TC-006 | Login Functional – Positive ─────────────────────────────────────

test.describe('Login Functional – Positive', () => {
  let loginPage!: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.navigate();
  });

  test('TC-006 | should login successfully with valid credentials and redirect to dashboard', async () => {
    await loginPage.login(config.credentials.email, config.credentials.password);
    await loginPage.waitForDashboard();
    await loginPage.assertLoginSuccess();
  });
});

// ─── TC-007 to TC-019 | Login Functional – Negative ──────────────────────────

test.describe('Login Functional – Negative', () => {
  let loginPage!: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.navigate();
  });

  test('TC-007 | should show error when submitting empty form', async () => {
    await loginPage.clickSubmit();
    await loginPage.assertLoginError();
  });

  test('TC-008 | should show error for valid email with empty password', async () => {
    await loginPage.enterEmail(config.credentials.email);
    await loginPage.clickSubmit();
    await loginPage.assertErrorText('Invalid email or password');
  });

  test('TC-009 | should show error for empty email with valid password', async () => {
    await loginPage.enterPassword(config.credentials.password);
    await loginPage.clickSubmit();
    await loginPage.assertLoginError();
  });

  test('TC-010 | should show error for incorrect password', async () => {
    await loginPage.login(config.credentials.email, 'Xenia*123');
    await loginPage.assertLoginError();
  });

  test('TC-011 | should show error for invalid email domain', async () => {
    await loginPage.login('janani@incubatelabs.co', config.credentials.password);
    await loginPage.assertLoginError();
  });

  test('TC-012 | should show error for unregistered email', async () => {
    await loginPage.login('notauser@incubatelabs.com', config.credentials.password);
    await loginPage.assertLoginError();
  });

  test('TC-013 | should block login for email without @ symbol', async () => {
    await loginPage.login('jananiincubatelabs.com', config.credentials.password);
    await loginPage.assertRemainsOnLoginPage();
  });

  test('TC-014 | should block login for email with spaces', async () => {
    await loginPage.login('janani @incubatelabs.com', config.credentials.password);
    await loginPage.assertRemainsOnLoginPage();
  });

  test('TC-015 | should block login for SQL injection in email field', async () => {
    await loginPage.login("' OR '1'='1", config.credentials.password);
    await loginPage.assertRemainsOnLoginPage();
  });

  test('TC-016 | should remain on login page after failed login attempt', async () => {
    await loginPage.login('wrong@email.com', 'wrongpassword');
    await loginPage.assertRemainsOnLoginPage();
  });

  test('TC-017 | should show error when email is clicked but left empty and correct password is entered', async () => {
    await loginPage.focusEmailInput();
    await loginPage.enterPassword(config.credentials.password);
    await loginPage.clickSubmit();
    await loginPage.assertLoginError();
  });

  test('TC-018 | should show error after re-submit when email field is focused but not filled', async () => {
    await loginPage.enterPassword(config.credentials.password);
    await loginPage.clickSubmit();
    await loginPage.assertLoginError();
    await loginPage.focusEmailInput();
    await loginPage.enterPassword(config.credentials.password);
    await loginPage.clickSubmit();
    await loginPage.assertLoginError();
  });

  test('TC-019 | should show error when password is clicked but left empty with valid email', async () => {
    await loginPage.enterEmail(config.credentials.email);
    await loginPage.focusPasswordInput();
    await loginPage.clickSubmit();
    await loginPage.assertLoginError();
  });
});

// ─── TC-020 | Xenia App Navigation ────────────────────────────────────────────

test.describe('Xenia App Navigation', () => {
  test.use({ storageState: 'auth/user.json' });

  test('TC-020 | should navigate to Xenia app and confirm app is loaded', async ({ page }) => {
    const spacePage = new SpacePage(page, page.context());

    await spacePage.navigateToEntries(config.spaceId);
    await spacePage.openSpaceSidepanel();
    await spacePage.selectSpace(config.xeniaSpaceId, config.xeniaSpaceName);
    await spacePage.selectEnvironment('master');
    await spacePage.openAppsMenu(config.xeniaAppName);
    await spacePage.assertAppLoaded();
  });
});
