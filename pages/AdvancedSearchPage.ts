import { FrameLocator, Page, expect } from '@playwright/test';

export class AdvancedSearchPage {
  private readonly frame: FrameLocator;

  constructor(page: Page) {
    this.frame = page.frameLocator('[data-test-id="cf-widget-renderer"]');
  }

  async assertPageVisible() {
    await expect(
      this.frame.getByRole('heading', { name: 'Search & filter campaigns' })
    ).toBeVisible({ timeout: 10000 });
    await expect(
      this.frame.getByRole('link', { name: 'Advanced search' })
    ).toBeVisible();
  }
}
