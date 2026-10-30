import { Page, expect } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}

  private selectors = {
    emailInput:    '[data-test-id="email-input"]',
    passwordInput: '[data-test-id="password-input"]',
    loginButton:   '[data-test-id="login-button"]',
    alertText:     '[data-test-id="alert-text"]',
  };

  async navigate() {
    await this.page.goto('https://be.contentful.com/login');
    await this.page.locator(this.selectors.emailInput).waitFor({ state: 'visible' });
  }

  async enterEmail(email: string) {
    await this.page.locator(this.selectors.emailInput).fill(email);
  }

  async enterPassword(password: string) {
    await this.page.locator(this.selectors.passwordInput).fill(password);
  }

  async clickSubmit() {
    await this.page.locator(this.selectors.loginButton).click();
  }

  async focusEmailInput() {
    await this.page.locator(this.selectors.emailInput).click();
  }

  async focusPasswordInput() {
    await this.page.locator(this.selectors.passwordInput).click();
  }

  async login(email: string, password: string) {
    await this.enterEmail(email);
    await this.enterPassword(password);
    await this.clickSubmit();
  }

  // ─── Assertions ───────────────────────────────────────────────────────────────

  async assertPageElements() {
    await expect(this.page.getByText('Email')).toBeVisible();
    await expect(this.page.getByText('Password', { exact: true })).toBeVisible();
    await expect(this.page.locator(this.selectors.loginButton)).toBeVisible();
  }

  async assertHeadings() {
    await expect(this.page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(this.page.getByRole('heading', { name: 'Log in to your Contentful account' })).toBeVisible();
  }

  async assertAlternativeLoginOptions() {
    await expect(this.page.getByRole('button', { name: /Log in via SSO/i })).toBeVisible();
    await expect(this.page.getByRole('button', { name: /Google/i })).toBeVisible();
    await expect(this.page.getByRole('button', { name: /GitHub/i })).toBeVisible();
  }

  async assertHelpLinks() {
    await expect(this.page.getByRole('link', { name: 'Reset password' })).toBeVisible();
    await expect(this.page.getByRole('link', { name: 'Resend confirmation' })).toBeVisible();
    await expect(this.page.getByRole('link', { name: 'Unlock account' })).toBeVisible();
  }

  async assertPasswordMasked() {
    const type = await this.page.locator(this.selectors.passwordInput).getAttribute('type');
    expect(type).toBe('password');
  }

  async assertLoginError() {
    await expect(this.page.locator(this.selectors.alertText)).toBeVisible({ timeout: 10000 });
  }

  async assertErrorText(text: string) {
    await expect(this.page.getByText(text)).toBeVisible({ timeout: 10000 });
  }

  async assertRemainsOnLoginPage() {
    await expect(this.page).toHaveURL(/\/login/);
  }

  async waitForDashboard() {
    await this.page.waitForURL(/app\.contentful\.com\/spaces/, { timeout: 20000 });
  }

  async assertLoginSuccess() {
    await expect(this.page).toHaveURL(/app\.contentful\.com\/spaces/);
  }
}
