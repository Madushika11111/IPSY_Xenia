import { Page, BrowserContext, Locator, expect } from '@playwright/test';
import { selectOrgInChooserIfPresent } from '../utils/helpers';

export class SpacePage {
  constructor(private page: Page, private context: BrowserContext) {}

  private selectors = {
    accountTrigger:  '[data-test-id="cf-ui-navbar-account-trigger"]',
    spaceNavTrigger: '[data-test-id="cf-ui-space-nav-space-trigger"]',
    sidepanelHeader: '[data-test-id="sidepanel-header"]',
  };

  // Set by selectSpace() to the sidepanel list item it just expanded, so
  // selectEnvironment() can scope its env-link search to that space only —
  // see the comment there for why an unscoped page-wide search is unsafe.
  private activeSpaceListItem: Locator | null = null;

  async navigateToEntries(spaceId: string) {
    await this.page.goto(
      `https://app.contentful.com/spaces/${spaceId}/views/entries`,
      { waitUntil: 'domcontentloaded' }
    );

    // This account belongs to multiple Contentful organizations. Confirmed live:
    // even a JUST-saved storageState, replayed into a brand new browser context,
    // can be redirected client-side to the "Welcome back — Choose an
    // organization" chooser instead of the requested space — the org choice
    // isn't captured by cookies/localStorage the way storageState() expects, so
    // it isn't reliably carried over between browser contexts/sessions. That
    // redirect can also fire a few seconds AFTER domcontentloaded, so a single
    // blind check right here races it and can miss the chooser entirely.
    // Poll: on each pass, self-heal through the chooser if it's currently
    // showing (this also clicks "Show N more" internally when the target org
    // isn't in the first page of rows), then check whether the space itself
    // has loaded — retrying the whole thing until it has. Picking an org also
    // triggers a full app reload that's measurably slower than a normal cached
    // navigation, which the generous overall timeout accounts for.
    const spaceTrigger = this.page.locator(this.selectors.spaceNavTrigger);
    await expect(async () => {
      await selectOrgInChooserIfPresent(this.page);
      await expect(spaceTrigger).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 45000 });
  }

  async openSpaceSidepanel() {
    await this.page.locator(this.selectors.spaceNavTrigger).click();
    await expect(this.page.locator(this.selectors.sidepanelHeader)).toBeVisible();
    // sidepanelHeader is a toggle: a second click closes the org submenu it just
    // opened, so click once and give the submenu a generous single wait to render
    // rather than retrying the click (retrying would thrash it open/closed).
    await this.page.locator(this.selectors.sidepanelHeader).click();
    await expect(this.page.getByRole('menuitem').first()).toBeVisible({ timeout: 15000 });
  }

  async selectSpace(xeniaSpaceId: string, spaceName: string) {
    const orgMenuItem = this.page.locator(`[data-test-id="sidepanel-menu-item-${xeniaSpaceId}"]`);
    const spaceButton = this.page.getByRole('button', { name: spaceName });
    const closePanelButton = this.page.getByRole('button', { name: 'Close Panel', exact: true });

    // The org switcher menu can be transient — it can render then close or
    // detach again (its own idle-collapse, or a re-render) before it's
    // actually clicked, or partway through this method. Confirmed live: two
    // separate retry loops (one to wait for the org menu item, a second to
    // click it and the space button) left a gap — the menu could vanish again
    // in between them, or during the second loop's own retries, leaving that
    // loop stuck re-clicking an element that no longer exists with no way to
    // recover. Every attempt below instead reopens the side panel from
    // scratch whenever the target org isn't currently visible, so the whole
    // org-select → space-button sequence always gets a clean shot at a
    // freshly-opened menu instead of chasing state that already vanished.
    await expect(async () => {
      if (!(await orgMenuItem.isVisible().catch(() => false))) {
        if (await closePanelButton.isVisible().catch(() => false)) {
          await closePanelButton.click({ timeout: 5000 }).catch(() => {});
        }
        await this.openSpaceSidepanel();
      }
      await orgMenuItem.click({ timeout: 8000 });
      await expect(spaceButton).toBeVisible({ timeout: 10000 });
      // The space list can re-render a *second* time shortly after the button
      // first appears (a trailing fetch, e.g. environments prefetch),
      // detaching it mid-click ("element was detached from the DOM,
      // retrying") — let any such trailing activity settle first.
      await this.page.waitForLoadState('networkidle').catch(() => {});
      await spaceButton.click({ timeout: 8000 });
    }).toPass({ timeout: 60000 });

    // The previous org's space (with its own identically-named "master"/"qa" links)
    // can still be present in the DOM during the org-switch transition — confirmed
    // live: an unscoped page-wide link lookup in selectEnvironment() intermittently
    // clicked the stale org's link instead of this one. Scope to this space's own
    // <li> (button + its expanded env-list region) so that can't happen.
    this.activeSpaceListItem = this.page.locator('li').filter({ has: spaceButton });

    // The click above only toggles the accordion open — its env-link list (its own
    // API-backed fetch) can still be rendering when this method returns, so wait for
    // at least one link here rather than leaving that wait to the next method.
    await expect(this.activeSpaceListItem.getByRole('link').first()).toBeVisible({ timeout: 20000 });
  }

  async selectEnvironment(env: string) {
    const scope = this.activeSpaceListItem ?? this.page;
    const envLink = scope.getByRole('link', { name: env });

    await expect(envLink).toBeVisible({ timeout: 15000 });
    await expect(async () => {
      await envLink.click({ timeout: 5000 });
    }).toPass({ timeout: 15000 });
    // networkidle ensures all JS has finished executing after the environment switch navigation
    await this.page.waitForLoadState('networkidle');
    // Confirm the space nav trigger is re-mounted before the caller looks for 'Apps'
    await expect(this.page.locator(this.selectors.spaceNavTrigger)).toBeVisible({ timeout: 20000 });
  }

  async openAppsMenu(appName: string) {
    // After environment switch the nav bar re-renders — give it up to 30 s in headless mode
    await expect(this.page.getByRole('button', { name: 'Apps' })).toBeVisible({ timeout: 30000 });

    const appsButton = this.page.getByRole('button', { name: 'Apps' });
    const menuItem = this.page.getByRole('menuitem', { name: appName });

    // Apps is a toggle: clicking it again while open closes the menu it just
    // opened, so click once and give the (long) installed-apps list a single
    // generous wait to render rather than retrying the click.
    await appsButton.click();
    await expect(menuItem).toBeVisible({ timeout: 20000 });
    await menuItem.click();
  }

  async assertAppLoaded() {
    await expect(this.page.locator(this.selectors.spaceNavTrigger)).toBeVisible({ timeout: 20000 });
  }
}
