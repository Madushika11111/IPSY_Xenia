# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                        # Run all tests (headed by default)
npm run test:headed             # Same as above (explicit --headed flag)
npm run test:debug              # Interactive debug mode with Playwright inspector
npm run test:report             # Open HTML report from last run
npm run test:login              # Run tests/auth/login.spec.ts only
npm run test:dashboard          # Run tests/dashboard/dashboard.spec.ts only
npm run test:tables             # Run tests/tables/tables.spec.ts only
npm run test:copy               # Run all 5 copy specs (GR, EL, PE, RD, MK) headed
npm run test:copy:headless      # Same, headless (HEADLESS=true)
npm run test:gradual-rollout    # Run all specs in tests/gradual-rollout/
npm run test:eligibility        # Run all specs in tests/eligibility/
npm run test:channel            # Run all specs in tests/channel/
npm run test:personalization    # Run all specs in tests/personalization/
npm run test:marketing          # Run all specs in tests/marketing/
npm run test:redirection        # Run tests/redirection/redirection.spec.ts only (headed)
npm run test:redirection:headless # Same, headless (HEADLESS=true)
npm run test:login:report       # Run login tests then open HTML report
npm run test:dashboard:report   # Run dashboard tests then open HTML report
npm run test:tables:report      # Run tables tests then open HTML report
npm run test:copy:report        # Run copy tests then open HTML report
npm run codegen                 # Record new tests against the login page
```

**Run a single test file or folder:**
```bash
npx playwright test tests/auth/login.spec.ts --headed
npx playwright test tests/gradual-rollout --headed   # whole campaign-type folder
```

**Run a specific test by name or TC number:**
```bash
npx playwright test -g "TC-006"
npx playwright test -g "should login successfully with valid credentials"
```

**Run headless (CI mode):**
```bash
cross-env HEADLESS=true playwright test
```

## Architecture

Playwright E2E test suite for **Contentful CMS** (`https://be.contentful.com`) and the **Xenia app** embedded inside it, written in TypeScript using the Page Object Model.

**Layers:**

- `tests/` — Test specs, organized in one subfolder per feature/campaign type. Each spec imports page objects (`../../pages/...`) and `config` (`../../config/config`), orchestrates steps:
  - `auth/login.spec.ts` — TC-001–TC-020: login UI, positive/negative auth, navigation to Xenia
  - `dashboard/dashboard.spec.ts` — TC-021–TC-035: Dashboard status cards, campaign counts, navigation
  - `tables/tables.spec.ts` — TC-TBL-001+: Tables configuration CRUD lifecycle
  - `gradual-rollout/gradual-rollout.spec.ts` — GR create/edit/lifecycle flows (TC-GR-001+)
  - `gradual-rollout/copy.spec.ts` — Copy Campaign for GR (TC-CP-GR-001+)
  - `eligibility/eligibility.spec.ts` — EL campaign flows (TC-EL-001+)
  - `eligibility/copy.spec.ts` — Copy Campaign for EL (TC-CP-EL-001+)
  - `personalization/copy.spec.ts` — Copy Campaign for PE (TC-CP-PE-001+)
  - `channel/channel.spec.ts` — Channel-related campaign flows (TC-CH-001+)
  - `redirection/redirection.spec.ts` — Redirection campaign type tests (TC-RD-001+)
  - `redirection/copy.spec.ts` — Copy Campaign for RD (TC-CP-RD-001+)
  - `marketing/copy.spec.ts` — Copy Campaign for MK 3-step wizard (TC-CP-MK-001+)

  The former monolithic `copy.spec.ts` was split into the 5 per-campaign-type `copy.spec.ts` files above; each has its own imports, date/timing helpers, and `beforeAll`/`afterAll`. `playwright.config.ts` `testDir: './tests'` recurses into subfolders automatically.

- `pages/` — Page objects. All Xenia-app page objects use `FrameLocator` because the app renders inside `[data-test-id="cf-widget-renderer"]`:
  - `LoginPage.ts` — login form interactions and assertions
  - `SpacePage.ts` — Contentful space-switching UI (sidepanel, environment selector, Apps menu). Accepts both `Page` and `BrowserContext`.
  - `DashboardPage.ts` — Dashboard status cards (Live/Scheduled/Paused/Draft/Expired), campaign type counts, navigation
  - `CampaignListPage.ts` — Generic campaign list assertions (filters, results count, total count)
  - `GradualRolloutListPage.ts` — GR-specific list page: search, filter, CRUD action buttons, View Details modal, status transitions (Pause/Resume/Stop/Delete), Edit drawer
  - `GradualRolloutCreatePage.ts` — GR create/update drawer (variant traffic splits, channel selector, date inputs)
  - `EligibilityListPage.ts` / `EligibilityCreatePage.ts` — EL equivalents
  - `AdvancedSearchPage.ts` — Advanced Search page assertions (reached via "View all campaigns")
  - `TablesPage.ts` — Tables/list page assertions
  - `RedirectionListPage.ts` — Redirection campaign list page; sidebar link assertion, navigation, page heading assertion
  - `CopyPage.ts` — Shared "Create campaign" drawer used by all Copy Campaign flows; includes field-state assertions, fill helpers, validation error assertions, and save/dismiss helpers

- `config/config.ts` — Contentful URLs, hardcoded space/app IDs (`spaceId`, `xeniaSpaceId`, `xeniaSpaceName`, `xeniaAppName`), credentials from `.env`.
- `utils/helpers.ts` — `takeScreenshot()` (saves to `reports/screenshots/`) and `getEnvVar()` (throws on missing env var).
- `global-setup.ts` — Runs once before the full suite: logs in, saves session to `auth/user.json`. Reuses an existing file if it is less than 8 hours old; re-logs in and overwrites otherwise.

**Authentication pattern:**
- `global-setup.ts` creates `auth/user.json` (8-hour cache). If the file is stale or missing, setup re-runs the login flow automatically.
- Tests that need auth use `test.use({ storageState: 'auth/user.json' })` (single-test pattern, e.g. TC-020) or `browser.newContext({ storageState: 'auth/user.json' })` in `beforeAll` (shared-page pattern used by dashboard, copy, gradual-rollout, etc.).
- Login-negative tests do **not** use saved auth — they open a fresh page via the normal `page` fixture.

**Shared-page pattern:** All multi-test spec groups share one browser context and page created in `beforeAll`, navigate to the Xenia app once, then run all tests against that same page. This avoids repeated space-switch navigation (which is slow) but means tests in a group are order-dependent.

**Data flow:** `global-setup.ts` → `auth/user.json` → `SpacePage` (space switch) → `DashboardPage` / list pages (iframe assertions)

## Environment Setup

Requires a `.env` file at the project root:
```
CONTENTFUL_EMAIL=your@email.com
CONTENTFUL_PASSWORD=yourpassword
```

## Test Configuration

`playwright.config.ts` key settings:
- `headless`: controlled by `HEADLESS=true` env var; defaults to **headed** (`false`)
- Headed mode: `--start-maximized` + `slowMo: 500` (500 ms between actions for human visibility)
- Headless mode: explicit `1920×1080` viewport (no `--start-maximized`), `slowMo: 0`
- Browser: Chrome Desktop only (`channel: 'chrome'`), `fullyParallel: false`
- Timeout: 120s per test, 5s for assertions
- Retries: 1 on failure
- Screenshots: `only-on-failure`; video and trace: `off`
- Reporters: list (console), HTML (`reports/html/`), JSON (`reports/results.json`), JUnit (`reports/results.xml`)
