# P13N Campaign — Test Automation Plan

> **For Claude Code:** This file describes *what* to test. Before writing any code,
> read the existing framework and match its patterns exactly. Do not invent a new
> structure or inline selectors.

---

## 0. How to use this file

1. **Read first, then write.** Open and study these before generating anything:
   - `pages/CampaignListPage.ts` — list view, status, row actions
   - `pages/CopyPage.ts` — copy/duplicate function
   - `pages/LoginPage.ts` and `auth/` — auth/session pattern
   - `pages/EligibilityCreatePage.ts` (or any `*CreatePage.ts`) — the create-flow POM pattern to mirror
   - `tests/personalization/` — where these tests belong
   - `config/config.ts` and `playwright.config.ts` — base URL, env, `channel: chrome`, `HEADLESS`
2. **Follow the POM pattern.** All selectors and actions live in page objects under `pages/`.
   Tests call page-object methods only — no raw locators in `.spec.ts` files.
3. **Reuse before creating.** Use `CampaignListPage` and `CopyPage` as-is. Only create a
   new `PersonalizationCreatePage.ts` if no create-page for p13n exists — and model it on
   the existing `*CreatePage.ts` classes.
4. **Selectors:** prefer `getByRole` / `data-testid`. Never brittle CSS.
5. **Output:** save specs to `tests/personalization/`. Suggested files:
   - `p13n-creation.spec.ts`
   - `p13n-actions.spec.ts`
   - `p13n-copy.spec.ts`
6. **Environment:** QA only — `app.contentful.com/qa`. Never run against production.

---

## 1. Domain terminology & verified behaviors

Assert against these known behaviors (do not re-derive them):

- **CID** is *user-entered*, **cmgmtId** is *auto-generated* — distinct fields.
- Empty CID displays **"No value"** on the Preview screen.
- **Add Ruleset panel** fields: Name, Description, Defining rule, auto-generated **Rule String**.
- Adding rules has two distinct options: **add an existing ruleset as a rule** vs **create a new rule** (functionally different).
- **Caching** column on rules defaults to **False**.
- **"Without content"** option disables all content controls + the A/B testing toggle, and the
  save button label changes: **"Add experience" → "Save without content"**.
- Campaign list statuses: **Scheduled, Live, Paused, Draft, Expired**.
- Creation is a **three-phase flow**: basic details → URL params / ruleset / experience → Preview & Publish.

Other terms in use: ruleset, defining rule, rule string, A/B testing toggle, traffic split,
Primary/Default experience %, control content, variant, Add existing entries picker, WEB channel,
PST date/time fields.

---

## 2. Test data

Use a unique, identifiable prefix so cleanup is safe:

| Field | Value |
|---|---|
| CID | `QA_P13N_<timestamp>` (unique per run) |
| Name | `P13N Automation - <timestamp>` |
| Channel | WEB |
| Ruleset name | `QA_RS_<timestamp>` |

- **cmgmtId is auto-generated** — never hardcode it. Assert it *exists / is non-empty* and,
  for copy, that it *differs* from the original.
- Prefer a fixture/helper for generating this data rather than repeating it in each spec.

---

## 3. Execution order (dependencies)

Later groups need a campaign created by earlier ones. Run in this order:

```
Creation  →  Copy  →  Actions (edit → pause → resume → stop → delete)
```

Delete runs **last** — it doubles as cleanup. The copy created in Group 3 must also be
deleted at the end.

---

## 4. Group 1 — Creation flow (three-phase)

### Phase 1 — Basic details
- **Steps:** open create flow → enter CID `QA_P13N_<ts>` → enter Name → select WEB channel → proceed.
- **Assert:** CID field holds the entered value (not auto-generated); a distinct auto-generated
  cmgmtId is present; advance to Phase 2 succeeds.

### Phase 2 — URL params / ruleset / experience
- **Steps:** add a URL parameter → open Add Ruleset → fill Name, Description, Defining rule →
  confirm Rule String auto-generates → add experience with **"With content"**.
- **Assert:** ruleset appears in the list; **Caching = False** by default; Rule String is populated;
  experience is added.

#### Phase 2 variant — "Without content" (separate test)
- **Steps:** in Add experience, select **"Without content"**.
- **Assert:** all content controls + A/B testing toggle become disabled; save button label reads
  **"Save without content"** (not "Add experience").

### Phase 3 — Preview & Publish
- **Steps:** open Preview → verify summary → Publish.
- **Assert:** CID shows the entered value on Preview (a separate empty-CID test should show
  **"No value"**); after publish, the campaign appears in the list with status **Live** or
  **Scheduled**.

---

## 5. Group 2 — Actions

Operate on the campaign from Group 1. Each action is its own test; **assert the resulting
status**, not just that the click succeeded.

| Action | Steps | Assert |
|---|---|---|
| **Edit** | Open campaign → change Name → save | Updated name persists in the list |
| **Pause** | Pause a Live campaign | Status → **Paused** |
| **Resume** | Resume a Paused campaign | Status → **Live** |
| **Stop** | Stop the campaign | Status changes as expected; further edits blocked if applicable |
| **Delete** | Delete → confirm dialog | Confirmation dialog shown; row removed from list |

Run in the order **edit → pause → resume → stop → delete** so state transitions stay valid.

---

## 6. Group 3 — Copy function

- **Steps:** select the source campaign → invoke Copy (via `CopyPage`) → confirm.
- **Assert:**
  - a duplicate appears in the list;
  - the copy has its **own auto-generated cmgmtId**, different from the original;
  - CID behaves per expected copy rules (confirm whether it copies, blanks, or shows "No value");
  - ruleset / experience configuration carries over as expected.
- **Cleanup:** delete the copied campaign at the end of this group.

---

## 7. Reliability notes (Contentful UI)

- The Contentful editor loads fields, modals, and panels **dynamically** — wait for the target
  element to be visible/enabled before acting; avoid fixed sleeps, use web-first assertions.
- Some editing surfaces render inside **iframes** — resolve the frame in the page object.
- Keep assertions on **status text** and **field values**, which are stable, rather than on
  layout or styling.

---

## 8. Definition of done

- [ ] Three spec files created under `tests/personalization/`.
- [ ] All selectors/actions live in page objects; specs contain no raw locators.
- [ ] Each test asserts a concrete outcome (status / value), not just an action.
- [ ] Tests run green via `npx playwright test tests/personalization/` in the QA env.
- [ ] No leftover test data (created + copied campaigns deleted).
