# Copy Campaign Feature — Test Case Document

| | |
|---|---|
| **Application** | Xenia app (embedded in Contentful CMS — `https://be.contentful.com`) |
| **Feature** | Copy Campaign (Gradual Rollout, Eligibility, Personalization, Redirection) |
| **Automation spec** | `tests/copy.spec.ts` (Page object: `pages/CopyPage.ts`) |
| **Total test cases** | 61 (GR: 16, EL: 11, PE: 9, RD: 13, MK: 12) |
| **Last updated** | 2026-06-11 |

## Common Preconditions (apply to all test cases)

1. A valid Contentful account exists with admin/add-campaign permission in the Xenia space (auth session saved in `auth/user.json` by `global-setup.ts`).
2. User is logged in, has switched to the Xenia space (master environment), and opened the Xenia app — Dashboard link is visible inside the app iframe.
3. At least one campaign exists in the relevant campaign list (tests skip gracefully when a required source campaign status is unavailable).

## Expected Copy Behaviour (from source code)

When **Copy Campaign** is clicked, the **Create campaign** drawer opens with:

| Field | Expected state after copy |
|---|---|
| Drawer heading | "Create campaign" (never "Update campaign") |
| Campaign name | Pre-filled with the original campaign's name |
| Start date / End date | Cleared (empty) — user must set new dates |
| Campaign ID | **GR**: pre-filled with control variant ID · **PE**: field not exposed · **RD/EL**: empty — user must enter a new ID |
| Status of saved copy | Draft (Save as Draft) or Scheduled (Save & Activate with future start date) |
| Original campaign | Unchanged — the copy is fully independent |

---

# 1. Gradual Rollout (TC-CP-GR-001 … 016)

### TC-CP-GR-001 — Copy button visible & enabled across all statuses *(Positive)*

**Steps:**
1. Navigate to the Gradual Rollout campaign list.
2. Set the date filter to "All days".
3. Filter the list by status **Scheduled** and click Search.
4. Verify the results count is greater than 0 (otherwise note status as skipped).
5. Locate the **Copy Campaign** button on the first result row.
6. Repeat steps 1–5 for statuses **Paused**, **Draft**, **Expired**, and **Live**.

**Expected result:** For every status that has at least one campaign, the Copy Campaign button is visible and enabled on the row.

---

### TC-CP-GR-002 — Copy opens "Create campaign" drawer pre-filled from the original *(Positive, 7 scenarios)*

**Steps:**
1. Navigate to the Gradual Rollout list, set date filter "All days", apply all filters.
2. Click **Copy Campaign** on the first campaign row.

**Expected results (verified as SC-1 … SC-7):**
- **SC-1:** The drawer heading is **"Create campaign"** — not "Update campaign".
- **SC-2:** The Campaign name field is pre-filled with the original campaign's name.
- **SC-3:** The start date field is empty (cleared by the copy handler).
- **SC-4:** The end date is not set (end-date checkbox unchecked).
- **SC-5:** The Campaign ID field is pre-filled with the control variant ID.
- **SC-6:** **Save & Activate Campaign**, **Save Campaign as Draft**, and **Cancel** buttons are visible.
- **SC-7:** Clicking **Cancel** closes the drawer and returns to the Gradual Rollout list.

---

### TC-CP-GR-003 — Copy → Save as Draft creates a new Draft campaign *(Positive, 3 scenarios)*

**Steps:**
1. Navigate to the GR list ("All days", all filters); note the first row's campaign name (= source campaign).
2. Click **Copy Campaign**; verify the Create campaign drawer opens.
3. Replace the pre-filled name with a unique name (e.g. `GR_Copy_Draft_<timestamp>`).
4. Set a future start date (current date + 5 days).
5. Clear the pre-filled Campaign ID and enter a new unique ID (e.g. `CPGR_D_<timestamp>`); wait for the "Validating…" check to finish.
6. Click **Save Campaign as Draft**.
7. Navigate back to the GR list and search for the copied campaign name.
8. Search for the original source campaign name.

**Expected results:**
- **SC-1:** The save succeeds and the drawer closes.
- **SC-2:** The copied campaign appears in the list with status **Draft**.
- **SC-3:** The original source campaign is still present in the list, unchanged.

---

### TC-CP-GR-004 — Copy → Save & Activate creates a new Scheduled campaign *(Positive, 2 scenarios)*

**Steps:**
1. Navigate to the GR list ("All days", all filters).
2. Click **Copy Campaign**; verify the Create campaign drawer opens.
3. Enter a unique name, a future start date (+7 days), and a new unique Campaign ID.
4. Click **Save & Activate Campaign**.
5. Navigate back to the GR list and search for the copied campaign name.

**Expected results:**
- **SC-1:** The save succeeds and the drawer closes.
- **SC-2:** The copied campaign appears in the list with status **Scheduled** (future start date).

---

### TC-CP-GR-005 — Save & Activate without Campaign Start date *(Negative)*

**Steps:**
1. Navigate to the GR list and click **Copy Campaign**; verify the Create campaign drawer opens.
2. Fill a unique name and a new unique Campaign ID; do **not** add the Campaign Start date.
3. Click **Save & Activate Campaign**.

**Expected result:** The system displays the inline validation message **"Please select campaign start date & time (PST)"**; the save is blocked. Close the drawer. *(Verified PASSED on 2026-06-10.)*

---

### TC-CP-GR-006 — Past start date *(Negative)*

**Steps:**
1. Navigate to the GR list and click **Copy Campaign**.
2. Fill a unique name; set the start date to **yesterday**; fill a new Campaign ID.
3. Click **Save & Activate Campaign**.

**Expected result:** Validation error **"Campaign start date…should be greater than current date"** is shown; the save is blocked.

---

### TC-CP-GR-007 — End date before start date *(Negative — SKIPPED)*

Not executable in the GR copy drawer: the GR RSuite drawer does not surface this validation as an inline message. The rule is covered by `gradual-rollout.spec.ts`; the equivalent copy-drawer check is TC-CP-PE-007.

---

### TC-CP-GR-008 — Invalid Campaign ID characters *(Negative)*

**Steps:**
1. Navigate to the GR list and click **Copy Campaign**.
2. Clear the Campaign ID and enter an ID with invalid characters (e.g. `inv@lid_<timestamp>`).
3. Click into another field to trigger inline format validation.

**Expected result:** Format error **"Campaign ID can only contain…"** is shown; invalid characters are rejected.

---

### TC-CP-GR-009 — Duplicate Campaign ID *(Negative, with setup)*

**Setup:** Copy any GR campaign, fill name + future start date + a unique Campaign ID (`CPDUP<timestamp>`), and **Save as Draft** — the ID is now registered.

**Steps (SC-1):**
1. Navigate to the GR list and click **Copy Campaign** again.
2. Enter the **same Campaign ID** registered in setup.
3. Blur the ID field (click the name field) to trigger the async server-side uniqueness check.

**Expected result:** Inline error **"This Campaign ID already…"** is shown — reuse of an existing Campaign ID is rejected.

---

### TC-CP-GR-010 — Campaign ID reuse rules depend on source status *(3 scenarios)*

**Setup:** Read the Campaign ID of an existing **Scheduled** campaign and an existing **Expired** campaign via the View Details modal. (Scenarios skip if no such campaign exists, or if the Expired ID has an invalid format.)

**Steps & expected results:**
- **SC-1 (Negative):** In a copy form, enter the **Scheduled** campaign's ID and blur → duplicate error is shown. *IDs of Live / Scheduled / Paused campaigns are still in use and cannot be reused.*
- **SC-2 (Positive):** In a copy form, enter the **Expired** campaign's ID and blur → **no** duplicate error appears; fill name + future start date and **Save as Draft** → save succeeds. *Expired IDs are released and may be reused once.*
- **SC-3 (Negative):** In a new copy form, enter the **same Expired ID** a second time and blur → duplicate error is shown. *The ID is now owned by the Draft created in SC-2 — expired IDs can be reused only ONCE.*

---

### TC-CP-GR-011 — Cleared campaign name *(Negative)*

**Steps:**
1. Navigate to the GR list and click **Copy Campaign**.
2. Fill a valid future start date and a new Campaign ID.
3. **Clear** the pre-filled campaign name and blur the field.
4. Click **Save & Activate Campaign**.

**Expected result:** Error **"Please enter campaign name"** is shown; the save is blocked.

---

### TC-CP-GR-012 — Cleared Campaign ID *(Negative)*

**Steps:**
1. Navigate to the GR list and click **Copy Campaign**.
2. Fill a unique name and a valid future start date.
3. **Clear** the pre-filled Campaign ID and blur the field.
4. Click **Save & Activate Campaign**.

**Expected result:** Error **"Please enter campaign ID"** is shown; the save is blocked.

---

### TC-CP-GR-013 — Save as Draft without Campaign Start date but with a unique Campaign ID succeeds *(Positive, 2 scenarios)*

**Steps:**
1. Navigate to the GR list and click **Copy Campaign**; verify the Create campaign drawer opens.
2. Fill a unique name and a new unique Campaign ID; do **not** add the Campaign Start date.
3. Click **Save Campaign as Draft**.
4. Navigate back to the list and search for the copied name.

**Expected results:**
- **SC-1:** The system **allows** the save — no start date validation is raised and the drawer closes (Draft campaigns do not require a start date, but a unique Campaign ID is still required).
- **SC-2:** The copied campaign appears in the list with status **Draft**. *(Verified PASSED on 2026-06-10.)*

---

### TC-CP-GR-014 — Copying a campaign that already has an end date clears all dates *(Positive, 2 scenarios)*

**Steps:**
1. *(Setup)* Create a source campaign that has **both** dates: copy any GR campaign, fill a unique name + unique Campaign ID, set start date **+3 days** and end date **+10 days** (check the end-date checkbox), click **Save & Activate** → a Scheduled campaign with an end date now exists.
2. Search the GR list for the source campaign and confirm its row shows the end date (not N/A).
3. Click **Copy Campaign** on that end-date campaign.
4. Inspect the date fields in the Create campaign drawer, then Cancel.

**Expected results:**
- **SC-1:** The source campaign with start + end dates is created successfully (status Scheduled).
- **SC-2:** In the copy drawer, the start date field is **empty** and the end date is **not set** (end-date checkbox unchecked) — all dates are clean even though the source campaign had an end date. *(Verified PASSED on 2026-06-10.)*

---

### TC-CP-GR-015 — Copy allows adding new channels and adding/editing variants without changing the original campaign *(Positive, 3 scenarios)*

**Steps:**
1. *(Setup)* Note the first row's campaign name (source) and snapshot its channels and variant traffic via the Edit Campaign drawer; close the drawer.
2. Search for the source campaign and click **Copy Campaign**.
3. In the copy drawer: fill a unique name + unique Campaign ID + future start date.
4. **Add a new channel** from the Channels dropdown.
5. **Add a new variant** (Add new variants) and **edit** the variant traffic values.
6. Click **Save Campaign as Draft**.
7. Search the list for the copied name, then re-open the **original** campaign's Edit drawer and compare its channels/traffic with the snapshot.

**Expected results:**
- **SC-1:** The drawer accepts the new channel and the added/edited variants; Save as Draft succeeds.
- **SC-2:** The modified copy appears in the list as a new **Draft** campaign.
- **SC-3:** The original campaign's channels and variant traffic are **unchanged** — copy modifications do not affect the original. *(Verified PASSED on 2026-06-10.)*

---

### TC-CP-GR-016 — Closing or cancelling the copy drawer does not create a new campaign *(Positive, 2 scenarios)*

**Steps:**
1. Click the **Copy** icon on a campaign; the Create campaign drawer opens.
2. Type a unique campaign name into the drawer (so a created campaign would be findable).
3. **SC-1:** Click the **Cancel** button. / **SC-2:** Click the **X close** button in the drawer header.
4. Verify the drawer closes and the Gradual Rollout list is shown.
5. Search the list for the unique name typed in step 2.

**Expected results:**
- **SC-1:** Cancel closes the drawer; searching the typed name returns **"No results."** — no campaign was created.
- **SC-2:** The X close button behaves the same — drawer closed, no campaign created. *(Verified PASSED on 2026-06-10.)*

---

# 2. Eligibility (TC-CP-EL-001 … 011)

### TC-CP-EL-001 — Copy button visible & enabled across statuses *(Positive)*

**Steps:**
1. Navigate to the Eligibility list, set date filter "All days", click Search.
2. For each status (**Scheduled, Paused, Draft, Expired**): verify a campaign with that status is visible in the results (skip the status otherwise) and locate the Copy Campaign button.

**Expected result:** The Copy Campaign button is visible and enabled for every available status.

---

### TC-CP-EL-002 — Copy opens "Create campaign" drawer pre-filled *(Positive, 5 scenarios)*

**Steps:** Navigate to the Eligibility list ("All days" → Search) and click **Copy Campaign** on the first row.

**Expected results:**
- **SC-1:** Drawer heading is **"Create campaign"**, not "Update campaign".
- **SC-2:** Campaign name is pre-filled from the original.
- **SC-3:** Start date is empty (cleared by the copy handler).
- **SC-4:** Save & Activate, Save as Draft, and Cancel buttons are visible.
- **SC-5:** Clicking **Cancel** returns to the Eligibility campaign list.

---

### TC-CP-EL-003 — Copy → Save as Draft *(Positive, 3 scenarios)*

**Steps:**
1. Navigate to the Eligibility list; note the first row's campaign name (source).
2. Click **Copy Campaign**; fill a unique name (`EL_Copy_Draft_<timestamp>`), a future start date (+5 days), and a new Campaign ID (`CPEL_D_<timestamp>`).
3. Click **Save Campaign as Draft**.
4. Search the list for the copied name, then for the source name.

**Expected results:**
- **SC-1:** Save as Draft succeeds; the drawer closes.
- **SC-2:** The copied campaign appears in the Eligibility list with status **Draft**.
- **SC-3:** The original campaign is still in the list, unaffected.

---

### TC-CP-EL-004 — Save & Activate without start date *(Negative)*

**Steps:** Copy an Eligibility campaign; fill name + Campaign ID; leave start date empty; click **Save & Activate**.

**Expected result:** **"Please select campaign start…"** validation error; save blocked.

---

### TC-CP-EL-005 — Past start date *(Negative)*

**Steps:** Copy an Eligibility campaign; fill name; set start date to yesterday; blur to trigger validation.

**Expected result:** **"Campaign start date…should be greater than current date"** error is shown.

---

### TC-CP-EL-006 — Invalid Campaign ID format *(Negative)*

**Steps:** Copy an Eligibility campaign; enter Campaign ID `bad@id#here`; blur.

**Expected result:** **"Campaign ID can only contain…"** format error is shown.

---

### TC-CP-EL-007 — Duplicate Campaign ID (Scheduled source) *(Negative, with setup)*

**Setup:** Open the **View Details** modal of an existing **Scheduled** Eligibility campaign and read its Campaign ID (skip if none exists).

**Steps (SC-1):** Copy any Eligibility campaign; enter the Scheduled campaign's ID; blur via the name field.

**Expected result:** **"This Campaign ID already…"** inline error — active Eligibility campaign IDs cannot be reused.

---

### TC-CP-EL-008 — Copy of a Scheduled campaign → Save & Activate *(Positive, 2 scenarios)*

**Precondition:** A **Scheduled** Eligibility campaign exists (its active ruleset is inherited by the copy — required for Save & Activate). Skips otherwise.

**Steps:**
1. Copy the Eligibility campaign; fill unique name, future start date (+7 days), and new Campaign ID.
2. Click **Save & Activate Campaign**.
3. Search the list for the copied name.

**Expected results:**
- **SC-1:** Save & Activate succeeds; drawer closes.
- **SC-2:** The copied campaign appears with status **Scheduled**.

---

### TC-CP-EL-009 — End date before start date *(Negative)*

**Steps:**
1. Copy an Eligibility campaign; fill a unique name.
2. Set start date to **+10 days**; enable the end-date checkbox and set end date to **+5 days** (before start).
3. Fill a new Campaign ID and click **Save & Activate**.

**Expected result:** The end-date validation fires — either **"Campaign end date…should be greater than campaign start date"** is shown, or the form clears the invalid end date and shows **"Please select campaign end date"**. The save is blocked either way.

---

### TC-CP-EL-010 — Cleared campaign name *(Negative)*

**Steps:** Copy an Eligibility campaign; fill valid start date + Campaign ID; **clear** the pre-filled name; blur; click **Save & Activate**.

**Expected result:** **"Please enter campaign name"** error; save blocked.

---

### TC-CP-EL-011 — Empty Campaign ID *(Negative)*

**Steps:** Copy an Eligibility campaign; fill a unique name + valid start date; **clear** the Campaign ID field; blur; click **Save & Activate**.

**Expected result:** **"Please enter campaign ID"** error; save blocked.

---

# 3. Personalization (TC-CP-PE-001 … 009)

> **Note:** The Personalization copy form does **not** expose a Campaign ID field (the copy handler sets `campaignId: null`; the ID is managed internally). Campaign ID format/duplicate/reuse cases are therefore excluded for PE and covered by the dedicated Personalization spec. The CONTENT_PERSONALIZATION variant opens the Contentful entry editor instead of the drawer and is covered by field-page specs.

### TC-CP-PE-001 — Copy button visible & enabled *(Positive)*

**Steps:** Navigate to Personalization campaigns ("All days" → Search) with the default "All statuses" view.

**Expected result:** The Copy Campaign button on the first row is visible and enabled.
*(Per-status looping is intentionally not done here — status-specific visibility is covered by TC-CP-GR-001.)*

---

### TC-CP-PE-002 — Copy opens "Create campaign" drawer with correct state *(Positive, 6 scenarios)*

**Steps:** Navigate to the Personalization list and click **Copy Campaign** on the first row.

**Expected results:**
- **SC-1:** Drawer heading is **"Create campaign"**, not "Update campaign".
- **SC-2:** Campaign name is pre-filled from the original.
- **SC-3:** Start date is empty.
- **SC-4:** Campaign ID is empty / not exposed (PE copy sets `campaignId: null`).
- **SC-5:** At least one Save-type button and the Cancel button are visible.
- **SC-6:** Clicking **Cancel** returns to the Personalization campaigns list.

---

### TC-CP-PE-003 — Copy → Save as Draft *(Positive, 3 scenarios)*

**Steps:**
1. Click **Copy Campaign**; read the pre-filled name (= source) before overwriting it.
2. Fill a unique name (`PE_Copy_Draft_<timestamp>`) and a future start date (+5 days). *(No Campaign ID — field not exposed.)*
3. Click **Save Campaign as Draft**.
4. Search the list for the copied name, then for the source name.

**Expected results:**
- **SC-1:** Save as Draft succeeds; drawer closes.
- **SC-2:** Copied campaign appears in the list with status **Draft**.
- **SC-3:** The original campaign is still in the list, unchanged.

---

### TC-CP-PE-004 — Second copy → independent Draft *(Positive, 2 scenarios)*

**Steps:** Repeat the copy → fill unique name + future start date (+7 days) → **Save as Draft** flow with a different name.

**Expected results:**
- **SC-1:** Save as Draft succeeds (Save & Activate is not used — it requires a Campaign ID, which the PE form does not expose).
- **SC-2:** The second copied campaign appears independently in the list with status **Draft**.

---

### TC-CP-PE-005 — Save without start date *(Negative)*

**Steps:** Copy a Personalization campaign; fill a unique name; leave start date empty; click **Save & Activate**.

**Expected result:** **"Please select campaign start…"** error; save blocked.

---

### TC-CP-PE-006 — Past start date *(Negative)*

**Steps:** Copy a Personalization campaign; fill name; set start date to yesterday; click **Save & Activate**.

**Expected result:** **"Campaign start date…should be greater than current date"** error is shown.

---

### TC-CP-PE-007 — End date before start date *(Negative)*

**Steps:**
1. Copy a Personalization campaign; fill a unique name.
2. Set start date to **+10 days** and end date to **+5 days**. *(Skips if the PE copy form does not expose an end date field.)*
3. Click **Save & Activate**.

**Expected result:** **"Campaign end date…should be greater than campaign start date"** error; save blocked.

---

### TC-CP-PE-008 — Cleared campaign name *(Negative)*

**Steps:** Copy a Personalization campaign; fill a valid start date; **clear** the pre-filled name; blur; click **Save & Activate**.

**Expected result:** **"Please enter campaign name"** error; save blocked.

---

### TC-CP-PE-009 — Save as Draft without start date succeeds *(Positive, 2 scenarios)*

**Steps:** Copy a Personalization campaign; fill only a unique name (no start date); click **Save as Draft**; then search the list for the name.

**Expected results:**
- **SC-1:** Save as Draft succeeds without a start date.
- **SC-2:** The copied campaign appears in the list with status **Draft**.

---

# 4. Redirection (TC-CP-RD-001 … 013)

> **Note:** Redirection copy (`RedirectionV2 handleCopyCampaign`) does **not** pre-fill the Campaign ID — the field is empty and the user must enter a new unique ID. Some RD form variants (V1) do not expose the field at all; the affected tests detect this and skip.

### TC-CP-RD-001 — Copy button visible & enabled *(Positive)*

**Steps:** Navigate to Redirection campaigns ("All days" → Search), default "All statuses" view.

**Expected result:** The Copy Campaign button on the first row is visible and enabled.

---

### TC-CP-RD-002 — Copy opens "Create campaign" drawer with correct state *(Positive, 6 scenarios)*

**Steps:** Navigate to the Redirection list and click **Copy Campaign** on the first row.

**Expected results:**
- **SC-1:** Drawer heading is **"Create campaign"**, not "Update campaign".
- **SC-2:** Campaign name is pre-filled from the original.
- **SC-3:** Start date is empty.
- **SC-4:** Campaign ID field is **empty** — RD copy does not pre-fill it.
- **SC-5:** Save & Activate, Save as Draft, and Cancel buttons are visible.
- **SC-6:** Clicking **Cancel** returns to the Redirection campaigns list.

---

### TC-CP-RD-003 — Copy → Save as Draft *(Positive, 3 scenarios)*

**Steps:**
1. Click **Copy Campaign**; capture the pre-filled name (source) before overwriting.
2. Fill a unique name (`RD_Copy_Draft_<timestamp>`), a future start date (+5 days), and a new Campaign ID (`CPRD_D_<timestamp>`). *(Skips if the ID field is absent in this form variant.)*
3. Click **Save Campaign as Draft**.
4. Search the list for the copied name, then for the source name.

**Expected results:**
- **SC-1:** Save as Draft succeeds; drawer closes.
- **SC-2:** Copied campaign appears in the Redirection list with status **Draft**.
- **SC-3:** The original campaign is still in the list, unchanged.

---

### TC-CP-RD-004 — Copy → Save & Activate creates a Scheduled campaign *(Positive, 2 scenarios)*

**Steps:** Copy a Redirection campaign; fill unique name, future start date (+7 days), and new Campaign ID; click **Save & Activate**; search the list for the name.

**Expected results:**
- **SC-1:** Save & Activate succeeds; drawer closes.
- **SC-2:** The copied campaign appears with status **Scheduled**.

---

### TC-CP-RD-005 — Save without start date *(Negative)*

**Steps:** Copy a Redirection campaign; fill name + new Campaign ID; leave start date empty; click **Save & Activate**.

**Expected result:** **"Please select campaign start…"** error; save blocked.

---

### TC-CP-RD-006 — Past start date *(Negative)*

**Steps:** Copy a Redirection campaign; fill name + new Campaign ID; set start date to yesterday; click **Save & Activate**.

**Expected result:** **"Campaign start date…should be greater than current date"** error is shown.

---

### TC-CP-RD-007 — End date before start date *(Negative)*

**Steps:** Copy a Redirection campaign; fill name; set start date **+10 days** and end date **+5 days**.

**Expected result:** **"Campaign end date…should be greater than campaign start date"** error is shown.

---

### TC-CP-RD-008 — Invalid Campaign ID format *(Negative)*

**Steps:** Copy a Redirection campaign; enter Campaign ID `bad@id#here`; blur. *(Skips if the ID field is absent.)*

**Expected result:** **"Campaign ID can only contain…"** format error is shown.

---

### TC-CP-RD-009 — Duplicate Campaign ID *(Negative, with setup)*

**Setup:** Copy a Redirection campaign, fill name + future start date + a unique Campaign ID (`CPRDDUP<timestamp>`), and **Save as Draft** to register the ID. *(Skips if the ID field is absent.)*

**Steps (SC-1):** Copy another Redirection campaign; enter the **same Campaign ID**; blur via the name field.

**Expected result:** **"This Campaign ID already…"** inline error is shown.

---

### TC-CP-RD-010 — Campaign ID reuse rules depend on source status *(3 scenarios, with setup)*

**Setup:** Probe that the RD copy form exposes a Campaign ID field; read the Campaign IDs of an existing **Scheduled** and an existing **Expired** Redirection campaign via View Details. (Scenarios skip when prerequisites are missing.)

**Steps & expected results:**
- **SC-1 (Negative):** Enter the **Scheduled** campaign's ID in a copy form → duplicate error. *Active (Live/Scheduled/Paused) Redirection IDs cannot be reused.*
- **SC-2 (Positive):** Enter the **Expired** campaign's ID → no duplicate error; fill start date and **Save as Draft** → succeeds. *Expired IDs are released for one reuse.*
- **SC-3 (Negative):** Enter the **same Expired ID** again in a new copy form → duplicate error. *The ID is now registered by the SC-2 Draft — only ONE reuse is allowed.*

---

### TC-CP-RD-011 — Cleared campaign name *(Negative)*

**Steps:** Copy a Redirection campaign; fill valid start date + new Campaign ID; **clear** the pre-filled name; blur; click **Save & Activate**.

**Expected result:** **"Please enter campaign name"** error; save blocked.

---

### TC-CP-RD-012 — Empty Campaign ID *(Negative)*

**Steps:** Copy a Redirection campaign *(skips if the ID field is absent)*; fill a unique name + valid start date; leave the Campaign ID empty (its default state in RD copy); click into and out of the ID field; click **Save & Activate**.

**Expected result:** **"Please enter campaign ID"** error; save blocked.

---

### TC-CP-RD-013 — Save as Draft without start date succeeds *(Positive, 2 scenarios)*

**Steps:** Copy a Redirection campaign; fill only a unique name and a new Campaign ID (no start date); click **Save as Draft**; search the list for the name.

**Expected results:**
- **SC-1:** Save as Draft succeeds without a start date.
- **SC-2:** The copied campaign appears in the list with status **Draft**.

---

# 5. Marketing (TC-CP-MK-001 … 012)

> **Marketing copy is a 3-step wizard**, not a single drawer (source: `MarketingCampaigns/index.jsx handleCopyCampaign` + backend `AdvanceAppLevelServiceImpl`):
> **Step 1 "Create new campaign"** (name, auto-generated disabled Campaign Management ID `MAR_<timestamp>`, CID, dates, Region, Description; "Setup Campaign Rules & Content" is disabled until a start date is set) → **Step 2 "Setup Campaign Rules & Content"** (URL params + inherited ruleset; Save as Draft available) → **Step 3 "Preview"** (read-only summary; Publish / Save as Draft).
> The backend never allows cmgmtId reuse (`existsByCmgmtId` has no status filter) — hence the auto-generated, disabled ID field. CID is optional; CID format/duplicate negatives are owned by the AdvancedGeneral validation and excluded here.

### TC-CP-MK-001 — Copy button visible & enabled *(Positive)*

**Steps:** Navigate to Marketing campaigns ("All days" → Search), default "All statuses" view.

**Expected result:** The Copy Campaign button on the first row is visible and enabled. *(Verified PASSED on 2026-06-10.)*

---

### TC-CP-MK-002 — Copy opens the "Create new campaign" wizard with correct state *(Positive, 8 scenarios)*

**Steps:** Click **Copy Campaign** on a Marketing campaign; inspect Step 1 of the wizard; then Cancel.

**Expected results:**
- **SC-1:** Wizard heading is **"Create new campaign"** with breadcrumb `> Campaigns > <source name>`.
- **SC-2:** Campaign name is pre-filled from the original.
- **SC-3:** Campaign Management ID is auto-generated (`MAR_<timestamp>`) and the field is **disabled**.
- **SC-4:** CID field is **empty** (`cid: null` — user must enter a new CID).
- **SC-5:** Start date is empty.
- **SC-6:** End date is not set (checkbox unchecked).
- **SC-7:** "Setup Campaign Rules & Content" is visible but **disabled**; Cancel is visible.
- **SC-8:** Cancel returns to the Marketing campaigns list. *(All verified PASSED on 2026-06-10.)*

---

### TC-CP-MK-003 — Wizard cannot proceed without a Campaign Start date *(Negative)*

**Steps:** Open the copy wizard; observe the Setup button; fill a future start date; observe again.

**Expected result:** "Setup Campaign Rules & Content" stays **disabled** while the start date is empty and becomes **enabled** once a valid future start date is set. *(Verified PASSED on 2026-06-10.)*

---

### TC-CP-MK-004 — Each copy generates a fresh unique Campaign Management ID *(Positive)*

**Steps:** Open the copy wizard twice on the same campaign, capturing the Campaign Management ID each time.

**Expected result:** Both IDs match `MAR_<timestamp>` and differ from each other — the original's cmgmtId is never reused (backend forbids cmgmtId reuse outright). *(Verified PASSED on 2026-06-10.)*

---

### TC-CP-MK-005 — Past start date rejected *(Negative)*

**Steps:** Open the copy wizard; set the start date to yesterday; blur.

**Expected result:** The past date is rejected — inline "start date…greater than current date" error or the Setup button stays gated. *(Verified PASSED on 2026-06-10.)*

---

### TC-CP-MK-006 — Cleared campaign name blocks the wizard *(Negative)*

**Steps:** Open the copy wizard; fill a valid start date; clear the pre-filled name; blur.

**Expected result:** Empty name is rejected — "Please enter campaign name" error or the Setup button stays gated. *(Verified PASSED on 2026-06-10.)*

---

### TC-CP-MK-007 — End date before start date rejected *(Negative, with control pass)*

**Steps:**
1. *(Control)* Copy the campaign, fill a valid start date only, click Setup → confirm the wizard reaches Step 2 (skips if this source is blocked for unrelated data reasons); Cancel.
2. Copy again; set start **+10 days** and end **+5 days**; click Setup.

**Expected result:** The wizard must **not** advance to Step 2 with end-before-start. *(Verified PASSED on 2026-06-10. Note: the block is **silent** — no inline error message and the button is not visibly disabled; the click simply does nothing. Recommend devs add a visible validation message.)*

---

### TC-CP-MK-008 — Copy → Save as Draft from Step 2; rules patched to the new cmgmtId *(Positive, 3 scenarios)*

**Steps:**
1. Copy a Marketing campaign; capture the source name and the new auto cmgmtId; fill a unique name + future start date.
2. Click "Setup Campaign Rules & Content" → Step 2 opens.
3. Verify the URL parameter field shows `cmgmtId=<NEW MAR_ id>` (evidence of `patchRuleForCopy` — rules decoupled from the original).
4. Click **Save as Draft**; then search the list for the copy and for the source.

**Expected results:**
- **SC-1:** Step 2 URL parameters carry the NEW cmgmtId; Save as Draft succeeds and the wizard closes.
- **SC-2:** The copied campaign appears in the Marketing list with status **Draft**.
- **SC-3:** The original source campaign is still in the list unchanged. *(All verified PASSED on 2026-06-10.)*

---

### TC-CP-MK-009 — Preview reflects the copy contract; cancel from Preview creates nothing *(Positive, 2 scenarios)*

**Steps:** Copy a campaign; fill unique name + future start date; walk Step 2 → "Preview & Publish" → Step 3; inspect the preview; click Cancel; search for the unique name.

**Expected results:**
- **SC-1:** Preview shows `Campaign Management ID : <new MAR_ id>`, `CID : No value`, and `Campaign end date & time (PST): N/A`.
- **SC-2:** Cancel from Preview closes the wizard; searching the typed name returns "No results." — nothing is created until saved. *(Verified PASSED on 2026-06-10.)*

---

### TC-CP-MK-010 — Cancel / X close at Step 1 creates nothing *(Positive, 2 scenarios)*

**Steps:** Open the copy wizard; type a unique name; close via the **Cancel** button (SC-1) or the **X** header close (SC-2); search for the name.

**Expected result:** The wizard closes and the search returns "No results." — no campaign created. *(Verified PASSED on 2026-06-10.)*

---

### TC-CP-MK-011 — Copy → Publish from Preview creates a Scheduled campaign *(Positive, 2 scenarios)*

**Steps:** Copy a campaign; fill unique name + future start date (+7 days); Step 2 → "Preview & Publish" → Step 3; click **Publish**; search the list for the name.

**Expected results:**
- **SC-1:** Publish closes the wizard.
- **SC-2:** The published copy appears in the Marketing list with status **Scheduled** (future start date). *(Verified PASSED on 2026-06-10.)*

---

### TC-CP-MK-012 — Copy → update CID + A/B traffic split → save *(Positive)*

**Steps:**
1. Copy a known-advanceable Marketing source ("Mar_caching_1"); capture the source name and the new auto cmgmtId.
2. Step 1: update name, enter a new **CID**, set a future start date (+7 days); advance to Step 2.
3. Step 2: open the ruleset editor (pencil) and confirm the copied rule references **both** the new cmgmtId and the typed CID (auto-injection in copy mode).
4. Drill View rules → View contents → **Add experience**: enable A/B testing (if not already), set the **traffic split** Primary 60% (Default auto-computes to 40%, read-only), and set the **A/B test end date** (+10 days — required to commit; must be greater than the campaign start date).
5. Commit the experience (Add experience) and continue back to Step 2.
6. Preview → confirm `CID : <new value>` → **Save as Draft**; then search the list for the copy and for the source.

**Expected results:**
- The new CID is auto-injected into the copied ruleset alongside the new cmgmtId.
- The traffic split updates (Primary 60% / Default auto 40%); the A/B test end date is accepted.
- Preview shows the updated CID; Save as Draft succeeds; the copy appears as **Draft**; the original campaign is unchanged. *(Verified PASSED on 2026-06-11.)*

> **A/B test rule (confirmed):** the A/B test end date is **required** to save an A/B experience and must be **greater than the campaign start date** (and **less than the campaign end date** when one is set). The copy handler clears the inherited A/B end date, so it must be re-entered when editing the split.

### Deferred Marketing scenarios (blocked by the gift-ID requirement)

Two scenarios are intentionally **not yet automated** because they depend on setting a **campaign end date**, which makes every program-type row require a completed **gift ID** (Cycle & Gift Product Id). Until each row is completed or removed, the wizard shows *"Please remove or complete uncompleted gift ID rows"* and will not advance past Step 1:

- **MK — Copy → update end date → save:** requires completing/removing the program-type gift ID rows.
- **MK — CID uniqueness (duplicate rejected / reuse after expiry):** the backend (`existCID`) only treats a CID as "in use" while its campaign is non-expired (`endDateTime >= now`), so registering an active-CID owner campaign requires a future end date — the same gift-ID blocker.

These will be added once the gift-ID completion sub-flow is automated.

---

# Coverage Summary

| Module | Positive | Negative | Skipped/Conditional | Total |
|---|---|---|---|---|
| Gradual Rollout | GR-001/002/003/004/010-SC2/013/014/015/016 | GR-005/006/008/009/010-SC1,SC3/011/012 | GR-007 (covered elsewhere) | 16 |
| Eligibility | EL-001/002/003/008 | EL-004/005/006/007/009/010/011 | EL-007/008 skip without a Scheduled source | 11 |
| Personalization | PE-001/002/003/004/009 | PE-005/006/007/008 | PE-007 skips if no end-date field; Campaign ID cases excluded by design | 9 |
| Redirection | RD-001/002/003/004/010-SC2/013 | RD-005/006/007/008/009/010-SC1,SC3/011/012 | ID-dependent cases skip when the form variant has no Campaign ID field | 13 |
| Marketing | MK-001/002/004/008/009/010/011/012 | MK-003/005/006/007 | MK-007/012 skip if the source cannot advance (gift-ID rows); end-date + CID-uniqueness deferred (gift-ID flow) | 12 |

**How to run:**
```bash
npx playwright test tests/copy.spec.ts --headed     # full copy suite
npx playwright test -g "TC-CP-GR-003"               # a single test case
npx playwright test -g "Eligibility — Copy"         # one module
```
