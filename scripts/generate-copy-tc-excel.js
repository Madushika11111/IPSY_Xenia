// Generates docs/Copy-Feature-Test-Cases.xlsx from the Copy Campaign test case data
// (mirrors docs/Copy-Feature-Test-Cases.md / tests/copy.spec.ts).
// Run: node scripts/generate-copy-tc-excel.js

const ExcelJS = require('exceljs');
const path = require('path');

const COMMON_PRECONDITION =
  'User is logged in to Contentful with admin/add-campaign permission, switched to the Xenia space (master environment), and the Xenia app is open (Dashboard visible).';

// [module, tcId, title, type, precondition (extra), steps, expectedResult]
const rows = [
  // ───────────────────────────── GRADUAL ROLLOUT ─────────────────────────────
  ['Gradual Rollout', 'TC-CP-GR-001', 'Copy Campaign button visible & enabled for all statuses', 'Positive',
   'At least one GR campaign exists per status (statuses with no campaigns are noted and skipped).',
   `1. Navigate to the Gradual Rollout campaign list.
2. Set date filter to "All days".
3. Filter by status "Scheduled" and click Search.
4. Verify results count > 0 (otherwise skip this status).
5. Locate the Copy Campaign button on the first result row.
6. Repeat steps 1-5 for statuses: Paused, Draft, Expired, Live.`,
   'For every status with at least one campaign, the Copy Campaign button is visible and enabled on the row.'],

  ['Gradual Rollout', 'TC-CP-GR-002', 'Copy opens "Create campaign" drawer pre-filled from the original (SC-1..SC-7)', 'Positive',
   '',
   `1. Navigate to the GR list, set date filter "All days", apply all filters.
2. Click Copy Campaign on the first campaign row.
3. Verify drawer heading (SC-1).
4. Verify campaign name field (SC-2).
5. Verify start date field (SC-3).
6. Verify end date state (SC-4).
7. Verify Campaign ID field (SC-5).
8. Verify action buttons (SC-6).
9. Click Cancel (SC-7).`,
   `SC-1: Drawer heading is "Create campaign" — NOT "Update campaign".
SC-2: Campaign name is pre-filled with the original campaign's name.
SC-3: Start date field is empty (cleared by copy handler).
SC-4: End date is not set (end-date checkbox unchecked).
SC-5: Campaign ID is pre-filled with the control variant ID.
SC-6: "Save & Activate Campaign", "Save Campaign as Draft" and Cancel buttons are visible.
SC-7: Cancel closes the drawer and returns to the Gradual Rollout list.`],

  ['Gradual Rollout', 'TC-CP-GR-003', 'Copy → Save as Draft creates a new Draft campaign (SC-1..SC-3)', 'Positive',
   '',
   `1. Navigate to the GR list ("All days", all filters); note the first row's campaign name (source).
2. Click Copy Campaign; verify the Create campaign drawer opens.
3. Replace the pre-filled name with a unique name (GR_Copy_Draft_<timestamp>).
4. Set a future start date (current date + 5 days).
5. Clear the pre-filled Campaign ID and enter a new unique ID (CPGR_D_<timestamp>); wait for "Validating..." to finish.
6. Click "Save Campaign as Draft".
7. Navigate back to the GR list and search for the copied campaign name.
8. Search for the original source campaign name.`,
   `SC-1: Save succeeds and the drawer closes.
SC-2: The copied campaign appears in the list with status "Draft".
SC-3: The original source campaign is still present in the list, unchanged.`],

  ['Gradual Rollout', 'TC-CP-GR-004', 'Copy → Save & Activate creates a new Scheduled campaign (SC-1..SC-2)', 'Positive',
   '',
   `1. Navigate to the GR list ("All days", all filters).
2. Click Copy Campaign; verify the Create campaign drawer opens.
3. Enter a unique name, a future start date (+7 days), and a new unique Campaign ID.
4. Click "Save & Activate Campaign".
5. Navigate back to the GR list and search for the copied campaign name.`,
   `SC-1: Save succeeds and the drawer closes.
SC-2: The copied campaign appears in the list with status "Scheduled" (future start date).`],

  ['Gradual Rollout', 'TC-CP-GR-005', 'Save & Activate without Campaign Start date shows inline validation message', 'Negative',
   '',
   `1. Navigate to the GR list and click Copy Campaign on a campaign.
2. Verify the "Create campaign" drawer opens.
3. Fill a unique campaign name and a new unique Campaign ID; do NOT add the Campaign Start date.
4. Click the "Save & Activate Campaign" button.
5. Close the drawer.`,
   'The system displays the inline validation message "Please select campaign start date & time (PST)" under the start date field; the save is blocked. (Verified PASSED on 2026-06-10.)'],

  ['Gradual Rollout', 'TC-CP-GR-006', 'Past start date shows validation error', 'Negative',
   '',
   `1. Navigate to the GR list and click Copy Campaign.
2. Fill a unique name; set the start date to YESTERDAY; fill a new Campaign ID.
3. Click "Save & Activate Campaign".
4. Close the drawer.`,
   'Validation error "Campaign start date...should be greater than current date" is shown; the save is blocked.'],

  ['Gradual Rollout', 'TC-CP-GR-007', 'End date before start date (NOT EXECUTABLE in GR copy drawer)', 'Negative — Skipped',
   '',
   'Skipped: the GR RSuite copy drawer does not surface this validation as an inline message.',
   'Covered by gradual-rollout.spec.ts; the equivalent copy-drawer check is TC-CP-PE-007.'],

  ['Gradual Rollout', 'TC-CP-GR-008', 'Invalid Campaign ID characters show format validation error', 'Negative',
   '',
   `1. Navigate to the GR list and click Copy Campaign.
2. Clear the Campaign ID and enter an ID with invalid characters (e.g. inv@lid_<timestamp>).
3. Click into another field to trigger inline format validation.
4. Close the drawer.`,
   'Format error "Campaign ID can only contain..." is shown; invalid characters are rejected.'],

  ['Gradual Rollout', 'TC-CP-GR-009', 'Duplicate Campaign ID shows duplicate error (SC-1)', 'Negative',
   'Setup: copy any GR campaign, fill name + future start date + unique Campaign ID (CPDUP<timestamp>), Save as Draft — the ID is now registered.',
   `1. Navigate to the GR list and click Copy Campaign.
2. Enter the SAME Campaign ID registered in setup.
3. Blur the ID field (click the name field) to trigger the async server-side uniqueness check.
4. Close the drawer.`,
   'Inline error "This Campaign ID already..." is shown — reuse of an existing Campaign ID is rejected.'],

  ['Gradual Rollout', 'TC-CP-GR-010', 'Campaign ID reuse rules depend on source campaign status (SC-1..SC-3)', 'Positive + Negative',
   'Setup: read the Campaign ID of an existing Scheduled and an existing Expired GR campaign via View Details. Scenarios skip if not found or if the Expired ID has invalid format.',
   `SC-1: In a copy form, enter the SCHEDULED campaign's ID and blur.
SC-2: In a copy form, enter the EXPIRED campaign's ID and blur; then fill name + future start date and Save as Draft.
SC-3: In a new copy form, enter the SAME Expired ID a second time and blur.`,
   `SC-1: Duplicate error shown — IDs of Live/Scheduled/Paused campaigns are still in use and cannot be reused.
SC-2: No duplicate error; Save as Draft succeeds — Expired IDs are released and may be reused once.
SC-3: Duplicate error shown — the ID is now owned by the Draft created in SC-2; Expired IDs can be reused only ONCE.`],

  ['Gradual Rollout', 'TC-CP-GR-011', 'Cleared campaign name shows required name error', 'Negative',
   '',
   `1. Navigate to the GR list and click Copy Campaign.
2. Fill a valid future start date and a new Campaign ID.
3. CLEAR the pre-filled campaign name and blur the field.
4. Click "Save & Activate Campaign".
5. Close the drawer.`,
   'Error "Please enter campaign name" is shown; the save is blocked.'],

  ['Gradual Rollout', 'TC-CP-GR-012', 'Cleared Campaign ID shows required Campaign ID error', 'Negative',
   '',
   `1. Navigate to the GR list and click Copy Campaign.
2. Fill a unique name and a valid future start date.
3. CLEAR the pre-filled Campaign ID and blur the field.
4. Click "Save & Activate Campaign".
5. Close the drawer.`,
   'Error "Please enter campaign ID" is shown; the save is blocked.'],

  ['Gradual Rollout', 'TC-CP-GR-013', 'Save as Draft without Campaign Start date but with a unique Campaign ID succeeds (SC-1..SC-2)', 'Positive',
   '',
   `1. Navigate to the GR list and click Copy Campaign on a campaign.
2. Verify the "Create campaign" drawer opens.
3. Fill a unique campaign name and a new unique Campaign ID; do NOT add the Campaign Start date.
4. Click the "Save Campaign as Draft" button.
5. Navigate back to the GR list and search for the copied campaign name.`,
   `SC-1: The system ALLOWS the save — no start date validation is raised, the save succeeds and the drawer closes (Draft campaigns do not require a start date, but a unique Campaign ID is still required).
SC-2: The copied campaign appears in the list with status "Draft". (Verified PASSED on 2026-06-10.)`],

  ['Gradual Rollout', 'TC-CP-GR-014', 'Copying a campaign that already has an end date clears all dates (SC-1..SC-2)', 'Positive',
   'Setup (SC-1) creates the source campaign with both dates so the scenario does not depend on existing data.',
   `1. (Setup) Copy any GR campaign; fill unique name + unique Campaign ID; set start date +3 days AND end date +10 days (check the end-date checkbox); click "Save & Activate" — a Scheduled campaign with an end date now exists.
2. Search the GR list for the source campaign; confirm its row shows the end date (not N/A).
3. Click Copy Campaign on that end-date campaign.
4. Inspect the date fields in the Create campaign drawer; Cancel.`,
   `SC-1: The source campaign with start + end dates is created successfully (status Scheduled).
SC-2: In the copy drawer the start date field is EMPTY and the end date is NOT set (end-date checkbox unchecked) — all dates are clean even though the source campaign had an end date. (Verified PASSED on 2026-06-10.)`],

  ['Gradual Rollout', 'TC-CP-GR-015', 'Copy allows adding new channels and adding/editing variants without changing the original campaign (SC-1..SC-3)', 'Positive',
   'Setup snapshots the source campaign\'s channels and variant traffic via its Edit drawer before copying.',
   `1. (Setup) Note the source campaign name and snapshot its channels + variant traffic via the Edit Campaign drawer; close it.
2. Search for the source campaign and click Copy Campaign.
3. In the copy drawer: fill unique name + unique Campaign ID + future start date.
4. ADD a new channel from the Channels dropdown.
5. ADD a new variant ("Add new variants") and EDIT the variant traffic values.
6. Click "Save Campaign as Draft".
7. Search the list for the copied name; then re-open the ORIGINAL campaign's Edit drawer and compare channels/traffic with the snapshot.`,
   `SC-1: The drawer accepts the new channel and the added/edited variants; Save as Draft succeeds.
SC-2: The modified copy appears in the list as a new "Draft" campaign.
SC-3: The original campaign's channels and variant traffic are UNCHANGED — copy modifications do not affect the original. (Verified PASSED on 2026-06-10.)`],

  ['Gradual Rollout', 'TC-CP-GR-016', 'Closing or cancelling the copy drawer does not create a new campaign (SC-1..SC-2)', 'Positive',
   '',
   `1. Click the Copy icon on a campaign; the Create campaign drawer opens.
2. Type a unique campaign name into the drawer (so a created campaign would be findable).
3. SC-1: Click the Cancel button. / SC-2: Click the X close button in the drawer header.
4. Verify the drawer closes and the Gradual Rollout list is shown.
5. Search the list for the unique name typed in step 2.`,
   `SC-1: Cancel closes the drawer; searching the typed name returns "No results." — no campaign was created.
SC-2: The X close button behaves the same — drawer closed, no campaign created. (Verified PASSED on 2026-06-10.)`],

  // ───────────────────────────── ELIGIBILITY ─────────────────────────────
  ['Eligibility', 'TC-CP-EL-001', 'Copy Campaign button visible & enabled across statuses', 'Positive',
   '',
   `1. Navigate to the Eligibility list, set date filter "All days", click Search.
2. For each status (Scheduled, Paused, Draft, Expired): verify a campaign with that status is visible in the results (skip the status otherwise).
3. Locate the Copy Campaign button on the first row.`,
   'The Copy Campaign button is visible and enabled for every available status.'],

  ['Eligibility', 'TC-CP-EL-002', 'Copy opens "Create campaign" drawer pre-filled (SC-1..SC-5)', 'Positive',
   '',
   `1. Navigate to the Eligibility list ("All days" → Search).
2. Click Copy Campaign on the first row.
3. Verify drawer heading, name, start date, action buttons.
4. Click Cancel.`,
   `SC-1: Drawer heading is "Create campaign", not "Update campaign".
SC-2: Campaign name is pre-filled from the original.
SC-3: Start date is empty (cleared by the copy handler).
SC-4: Save & Activate, Save as Draft, and Cancel buttons are visible.
SC-5: Cancel returns to the Eligibility campaign list.`],

  ['Eligibility', 'TC-CP-EL-003', 'Copy → Save as Draft creates a new Draft campaign (SC-1..SC-3)', 'Positive',
   '',
   `1. Navigate to the Eligibility list; note the first row's campaign name (source).
2. Click Copy Campaign; fill a unique name (EL_Copy_Draft_<timestamp>), a future start date (+5 days), and a new Campaign ID (CPEL_D_<timestamp>).
3. Click "Save Campaign as Draft".
4. Search the list for the copied name, then for the source name.`,
   `SC-1: Save as Draft succeeds; the drawer closes.
SC-2: The copied campaign appears in the Eligibility list with status "Draft".
SC-3: The original campaign is still in the list, unaffected.`],

  ['Eligibility', 'TC-CP-EL-004', 'Save & Activate without start date shows validation error', 'Negative',
   '',
   `1. Copy an Eligibility campaign.
2. Fill name + Campaign ID; leave start date EMPTY.
3. Click "Save & Activate".
4. Close the drawer.`,
   '"Please select campaign start..." validation error is shown; save blocked.'],

  ['Eligibility', 'TC-CP-EL-005', 'Past start date shows validation error', 'Negative',
   '',
   `1. Copy an Eligibility campaign.
2. Fill name; set start date to YESTERDAY.
3. Blur to trigger validation.
4. Close the drawer.`,
   '"Campaign start date...should be greater than current date" error is shown.'],

  ['Eligibility', 'TC-CP-EL-006', 'Invalid Campaign ID format shows format error', 'Negative',
   '',
   `1. Copy an Eligibility campaign.
2. Enter Campaign ID "bad@id#here" and blur.
3. Close the drawer.`,
   '"Campaign ID can only contain..." format error is shown.'],

  ['Eligibility', 'TC-CP-EL-007', 'Duplicate Campaign ID (Scheduled source) shows duplicate error (SC-1)', 'Negative',
   'Setup: open the View Details modal of an existing Scheduled Eligibility campaign and read its Campaign ID (skips if none exists).',
   `1. Copy any Eligibility campaign.
2. Enter the Scheduled campaign's ID.
3. Blur via the name field.
4. Close the drawer.`,
   '"This Campaign ID already..." inline error — active Eligibility campaign IDs cannot be reused.'],

  ['Eligibility', 'TC-CP-EL-008', 'Copy of a Scheduled campaign → Save & Activate creates Scheduled campaign (SC-1..SC-2)', 'Positive',
   'A Scheduled Eligibility campaign exists (its active ruleset is inherited by the copy — required for Save & Activate). Skips otherwise.',
   `1. Copy the Eligibility campaign; fill unique name, future start date (+7 days), and new Campaign ID.
2. Click "Save & Activate Campaign".
3. Search the list for the copied name.`,
   `SC-1: Save & Activate succeeds; drawer closes.
SC-2: The copied campaign appears with status "Scheduled".`],

  ['Eligibility', 'TC-CP-EL-009', 'End date before start date shows validation error', 'Negative',
   '',
   `1. Copy an Eligibility campaign; fill a unique name.
2. Set start date to +10 days; enable the end-date checkbox and set end date to +5 days (before start).
3. Fill a new Campaign ID and click "Save & Activate".
4. Close the drawer.`,
   'The end-date validation fires — either "Campaign end date...should be greater than campaign start date" is shown, or the form clears the invalid end date and shows "Please select campaign end date". Save is blocked either way.'],

  ['Eligibility', 'TC-CP-EL-010', 'Cleared campaign name shows required name error', 'Negative',
   '',
   `1. Copy an Eligibility campaign.
2. Fill valid start date + Campaign ID.
3. CLEAR the pre-filled name; blur.
4. Click "Save & Activate".
5. Close the drawer.`,
   '"Please enter campaign name" error is shown; save blocked.'],

  ['Eligibility', 'TC-CP-EL-011', 'Empty Campaign ID shows required Campaign ID error', 'Negative',
   '',
   `1. Copy an Eligibility campaign.
2. Fill a unique name + valid start date.
3. CLEAR the Campaign ID field; blur.
4. Click "Save & Activate".
5. Close the drawer.`,
   '"Please enter campaign ID" error is shown; save blocked.'],

  // ───────────────────────────── PERSONALIZATION ─────────────────────────────
  ['Personalization', 'TC-CP-PE-001', 'Copy Campaign button visible & enabled', 'Positive',
   'PE copy form does not expose a Campaign ID field — ID cases are excluded by design for this module.',
   `1. Navigate to Personalization campaigns ("All days" → Search), default "All statuses" view.
2. Locate the Copy Campaign button on the first row.`,
   'The Copy Campaign button is visible and enabled. (Per-status looping is covered by TC-CP-GR-001.)'],

  ['Personalization', 'TC-CP-PE-002', 'Copy opens "Create campaign" drawer with correct state (SC-1..SC-6)', 'Positive',
   '',
   `1. Navigate to the Personalization list.
2. Click Copy Campaign on the first row.
3. Verify drawer heading, name, start date, Campaign ID state, buttons.
4. Click Cancel.`,
   `SC-1: Drawer heading is "Create campaign", not "Update campaign".
SC-2: Campaign name is pre-filled from the original.
SC-3: Start date is empty.
SC-4: Campaign ID is empty / not exposed (PE copy sets campaignId: null).
SC-5: At least one Save-type button and the Cancel button are visible.
SC-6: Cancel returns to the Personalization campaigns list.`],

  ['Personalization', 'TC-CP-PE-003', 'Copy → Save as Draft creates a new Draft campaign (SC-1..SC-3)', 'Positive',
   '',
   `1. Click Copy Campaign; read the pre-filled name (= source) before overwriting it.
2. Fill a unique name (PE_Copy_Draft_<timestamp>) and a future start date (+5 days). (No Campaign ID — field not exposed.)
3. Click "Save Campaign as Draft".
4. Search the list for the copied name, then for the source name.`,
   `SC-1: Save as Draft succeeds; drawer closes.
SC-2: Copied campaign appears in the list with status "Draft".
SC-3: The original campaign is still in the list, unchanged.`],

  ['Personalization', 'TC-CP-PE-004', 'Second copy → independent Draft campaign (SC-1..SC-2)', 'Positive',
   '',
   `1. Click Copy Campaign on a Personalization campaign.
2. Fill a different unique name and a future start date (+7 days).
3. Click "Save Campaign as Draft".
4. Search the list for the new name.`,
   `SC-1: Save as Draft succeeds (Save & Activate is not used — it requires a Campaign ID, which the PE form does not expose).
SC-2: The second copied campaign appears independently in the list with status "Draft".`],

  ['Personalization', 'TC-CP-PE-005', 'Save without start date shows validation error', 'Negative',
   '',
   `1. Copy a Personalization campaign.
2. Fill a unique name; leave start date EMPTY.
3. Click "Save & Activate".
4. Close the drawer.`,
   '"Please select campaign start..." error is shown; save blocked.'],

  ['Personalization', 'TC-CP-PE-006', 'Past start date shows validation error', 'Negative',
   '',
   `1. Copy a Personalization campaign.
2. Fill name; set start date to YESTERDAY.
3. Click "Save & Activate".
4. Close the drawer.`,
   '"Campaign start date...should be greater than current date" error is shown.'],

  ['Personalization', 'TC-CP-PE-007', 'End date before start date shows validation error', 'Negative',
   'Skips if the PE copy form does not expose an end date field.',
   `1. Copy a Personalization campaign; fill a unique name.
2. Set start date to +10 days and end date to +5 days.
3. Click "Save & Activate".
4. Close the drawer.`,
   '"Campaign end date...should be greater than campaign start date" error is shown; save blocked.'],

  ['Personalization', 'TC-CP-PE-008', 'Cleared campaign name shows required name error', 'Negative',
   '',
   `1. Copy a Personalization campaign.
2. Fill a valid start date.
3. CLEAR the pre-filled name; blur.
4. Click "Save & Activate".
5. Close the drawer.`,
   '"Please enter campaign name" error is shown; save blocked.'],

  ['Personalization', 'TC-CP-PE-009', 'Save as Draft without start date succeeds (SC-1..SC-2)', 'Positive',
   '',
   `1. Copy a Personalization campaign.
2. Fill only a unique name (no start date).
3. Click "Save as Draft".
4. Search the list for the name.`,
   `SC-1: Save as Draft succeeds without a start date.
SC-2: The copied campaign appears in the list with status "Draft".`],

  // ───────────────────────────── REDIRECTION ─────────────────────────────
  ['Redirection', 'TC-CP-RD-001', 'Copy Campaign button visible & enabled', 'Positive',
   'RD copy does not pre-fill Campaign ID; some RD form variants (V1) do not expose the field at all — affected tests detect this and skip.',
   `1. Navigate to Redirection campaigns ("All days" → Search), default "All statuses" view.
2. Locate the Copy Campaign button on the first row.`,
   'The Copy Campaign button is visible and enabled.'],

  ['Redirection', 'TC-CP-RD-002', 'Copy opens "Create campaign" drawer with correct state (SC-1..SC-6)', 'Positive',
   '',
   `1. Navigate to the Redirection list.
2. Click Copy Campaign on the first row.
3. Verify drawer heading, name, start date, Campaign ID state, buttons.
4. Click Cancel.`,
   `SC-1: Drawer heading is "Create campaign", not "Update campaign".
SC-2: Campaign name is pre-filled from the original.
SC-3: Start date is empty.
SC-4: Campaign ID field is EMPTY — RD copy does not pre-fill it.
SC-5: Save & Activate, Save as Draft, and Cancel buttons are visible.
SC-6: Cancel returns to the Redirection campaigns list.`],

  ['Redirection', 'TC-CP-RD-003', 'Copy → Save as Draft creates a new Draft campaign (SC-1..SC-3)', 'Positive',
   'Skips if the Campaign ID field is absent in this form variant.',
   `1. Click Copy Campaign; capture the pre-filled name (source) before overwriting.
2. Fill a unique name (RD_Copy_Draft_<timestamp>), a future start date (+5 days), and a new Campaign ID (CPRD_D_<timestamp>).
3. Click "Save Campaign as Draft".
4. Search the list for the copied name, then for the source name.`,
   `SC-1: Save as Draft succeeds; drawer closes.
SC-2: Copied campaign appears in the Redirection list with status "Draft".
SC-3: The original campaign is still in the list, unchanged.`],

  ['Redirection', 'TC-CP-RD-004', 'Copy → Save & Activate creates a Scheduled campaign (SC-1..SC-2)', 'Positive',
   'Skips if the Campaign ID field is absent in this form variant.',
   `1. Copy a Redirection campaign.
2. Fill unique name, future start date (+7 days), and new Campaign ID.
3. Click "Save & Activate".
4. Search the list for the name.`,
   `SC-1: Save & Activate succeeds; drawer closes.
SC-2: The copied campaign appears with status "Scheduled".`],

  ['Redirection', 'TC-CP-RD-005', 'Save without start date shows validation error', 'Negative',
   '',
   `1. Copy a Redirection campaign.
2. Fill name + new Campaign ID; leave start date EMPTY.
3. Click "Save & Activate".
4. Close the drawer.`,
   '"Please select campaign start..." error is shown; save blocked.'],

  ['Redirection', 'TC-CP-RD-006', 'Past start date shows validation error', 'Negative',
   '',
   `1. Copy a Redirection campaign.
2. Fill name + new Campaign ID; set start date to YESTERDAY.
3. Click "Save & Activate".
4. Close the drawer.`,
   '"Campaign start date...should be greater than current date" error is shown.'],

  ['Redirection', 'TC-CP-RD-007', 'End date before start date shows validation error', 'Negative',
   '',
   `1. Copy a Redirection campaign; fill name.
2. Set start date to +10 days and end date to +5 days.
3. Close the drawer after verifying.`,
   '"Campaign end date...should be greater than campaign start date" error is shown.'],

  ['Redirection', 'TC-CP-RD-008', 'Invalid Campaign ID format shows format error', 'Negative',
   'Skips if the Campaign ID field is absent.',
   `1. Copy a Redirection campaign.
2. Enter Campaign ID "bad@id#here" and blur.
3. Close the drawer.`,
   '"Campaign ID can only contain..." format error is shown.'],

  ['Redirection', 'TC-CP-RD-009', 'Duplicate Campaign ID shows duplicate error (SC-1)', 'Negative',
   'Setup: copy a Redirection campaign, fill name + future start date + unique Campaign ID (CPRDDUP<timestamp>), Save as Draft to register the ID. Skips if the ID field is absent.',
   `1. Copy another Redirection campaign.
2. Enter the SAME Campaign ID registered in setup.
3. Blur via the name field.
4. Close the drawer.`,
   '"This Campaign ID already..." inline error is shown.'],

  ['Redirection', 'TC-CP-RD-010', 'Campaign ID reuse rules depend on source status (SC-1..SC-3)', 'Positive + Negative',
   'Setup: probe that the RD copy form exposes a Campaign ID field; read the Campaign IDs of an existing Scheduled and an existing Expired Redirection campaign via View Details. Scenarios skip when prerequisites are missing.',
   `SC-1: Enter the SCHEDULED campaign's ID in a copy form and blur.
SC-2: Enter the EXPIRED campaign's ID; blur; fill start date and Save as Draft.
SC-3: Enter the SAME Expired ID again in a new copy form and blur.`,
   `SC-1: Duplicate error — active (Live/Scheduled/Paused) Redirection IDs cannot be reused.
SC-2: No duplicate error; Save as Draft succeeds — Expired IDs are released for one reuse.
SC-3: Duplicate error — the ID is now registered by the SC-2 Draft; only ONE reuse is allowed.`],

  ['Redirection', 'TC-CP-RD-011', 'Cleared campaign name shows required name error', 'Negative',
   '',
   `1. Copy a Redirection campaign.
2. Fill valid start date + new Campaign ID.
3. CLEAR the pre-filled name; blur.
4. Click "Save & Activate".
5. Close the drawer.`,
   '"Please enter campaign name" error is shown; save blocked.'],

  ['Redirection', 'TC-CP-RD-012', 'Empty Campaign ID shows required Campaign ID error', 'Negative',
   'Skips if the Campaign ID field is absent in this form variant.',
   `1. Copy a Redirection campaign.
2. Fill a unique name + valid start date; leave the Campaign ID empty (its default state in RD copy).
3. Click into and out of the ID field.
4. Click "Save & Activate".
5. Close the drawer.`,
   '"Please enter campaign ID" error is shown; save blocked.'],

  ['Redirection', 'TC-CP-RD-013', 'Save as Draft without start date succeeds (SC-1..SC-2)', 'Positive',
   '',
   `1. Copy a Redirection campaign.
2. Fill only a unique name and a new Campaign ID (no start date).
3. Click "Save as Draft".
4. Search the list for the name.`,
   `SC-1: Save as Draft succeeds without a start date.
SC-2: The copied campaign appears in the list with status "Draft".`],

  // ───────────────────────────── MARKETING ─────────────────────────────
  ['Marketing', 'TC-CP-MK-001', 'Copy Campaign button visible & enabled', 'Positive',
   'Marketing copy is a 3-step wizard: Step 1 "Create new campaign" → Step 2 "Setup Campaign Rules & Content" → Step 3 "Preview".',
   `1. Navigate to Marketing campaigns ("All days" → Search), default "All statuses" view.
2. Locate the Copy Campaign button on the first row.`,
   'The Copy Campaign button is visible and enabled. (Verified PASSED on 2026-06-10.)'],

  ['Marketing', 'TC-CP-MK-002', 'Copy opens the "Create new campaign" wizard with correct pre-filled state (SC-1..SC-8)', 'Positive',
   '',
   `1. Click Copy Campaign on a Marketing campaign (wizard fetches the full campaign before opening — allow extra time).
2. Inspect Step 1 of the wizard.
3. Click Cancel.`,
   `SC-1: Wizard heading is "Create new campaign" with breadcrumb "> Campaigns > <source name>".
SC-2: Campaign name is pre-filled from the original.
SC-3: Campaign Management ID is auto-generated (MAR_<timestamp>) and the field is DISABLED.
SC-4: CID field is EMPTY (cid: null — user must enter a new CID).
SC-5: Start date is empty.
SC-6: End date is not set (checkbox unchecked).
SC-7: "Setup Campaign Rules & Content" is visible but DISABLED; Cancel is visible.
SC-8: Cancel returns to the Marketing campaigns list. (All verified PASSED on 2026-06-10.)`],

  ['Marketing', 'TC-CP-MK-003', 'Wizard cannot proceed without a Campaign Start date', 'Negative',
   '',
   `1. Open the copy wizard.
2. Observe the "Setup Campaign Rules & Content" button with the start date empty.
3. Fill a valid future start date and observe again.
4. Close the wizard.`,
   '"Setup Campaign Rules & Content" stays DISABLED while the start date is empty and becomes ENABLED once a valid future start date is set. (Verified PASSED on 2026-06-10.)'],

  ['Marketing', 'TC-CP-MK-004', 'Each copy generates a fresh unique Campaign Management ID', 'Positive',
   'Backend never allows cmgmtId reuse (existsByCmgmtId has no status filter) — hence the auto-generated disabled field.',
   `1. Open the copy wizard on a campaign; capture the Campaign Management ID; close.
2. Open the copy wizard again on the same campaign; capture the ID; close.`,
   'Both IDs match MAR_<timestamp> and DIFFER from each other — the original cmgmtId is never reused. (Verified PASSED on 2026-06-10.)'],

  ['Marketing', 'TC-CP-MK-005', 'Past start date rejected', 'Negative',
   '',
   `1. Open the copy wizard.
2. Set the start date to YESTERDAY; blur.
3. Close the wizard.`,
   'The past date is rejected — inline "start date...greater than current date" error or the Setup button stays gated. (Verified PASSED on 2026-06-10.)'],

  ['Marketing', 'TC-CP-MK-006', 'Cleared campaign name blocks the wizard', 'Negative',
   '',
   `1. Open the copy wizard.
2. Fill a valid start date; CLEAR the pre-filled name; blur.
3. Close the wizard.`,
   'Empty name is rejected — "Please enter campaign name" error or the Setup button stays gated. (Verified PASSED on 2026-06-10.)'],

  ['Marketing', 'TC-CP-MK-007', 'End date before start date rejected — wizard must not advance to Step 2', 'Negative',
   'Includes a control pass proving the same source CAN advance with valid dates (skips if the source is blocked for unrelated data reasons).',
   `1. (Control) Copy the campaign, fill a valid start date only, click "Setup Campaign Rules & Content" — confirm Step 2 opens; Cancel.
2. Copy again; set start date +10 days AND end date +5 days (end before start); click Setup.`,
   `The wizard must NOT advance to Step 2 with end-before-start. (Verified PASSED on 2026-06-10.)
NOTE: the block is SILENT — no inline error message and the button is not visibly disabled; the click simply does nothing. Recommend devs add a visible validation message.`],

  ['Marketing', 'TC-CP-MK-008', 'Copy → Save as Draft from Step 2; rules patched to the NEW cmgmtId (SC-1..SC-3)', 'Positive',
   '',
   `1. Copy a Marketing campaign; capture the source name and the new auto cmgmtId; fill a unique name + future start date.
2. Click "Setup Campaign Rules & Content" — Step 2 opens.
3. Verify the URL parameter field shows "cmgmtId=<NEW MAR_ id>" (patchRuleForCopy evidence — rules decoupled from the original).
4. Click "Save as Draft"; then search the list for the copy and for the source.`,
   `SC-1: Step 2 URL parameters carry the NEW cmgmtId; Save as Draft succeeds and the wizard closes.
SC-2: The copied campaign appears in the Marketing list with status "Draft".
SC-3: The original source campaign is still in the list unchanged. (All verified PASSED on 2026-06-10.)`],

  ['Marketing', 'TC-CP-MK-009', 'Preview reflects the copy contract; cancel from Preview creates nothing (SC-1..SC-2)', 'Positive',
   '',
   `1. Copy a campaign; fill unique name + future start date.
2. Step 2 → "Preview & Publish" → Step 3 "Preview".
3. Inspect the preview summary.
4. Click Cancel; search the list for the unique name.`,
   `SC-1: Preview shows "Campaign Management ID : <new MAR_ id>", "CID : No value", and "Campaign end date & time (PST): N/A".
SC-2: Cancel from Preview closes the wizard; searching the typed name returns "No results." — nothing is created until saved. (Verified PASSED on 2026-06-10.)`],

  ['Marketing', 'TC-CP-MK-010', 'Cancel / X close at Step 1 creates nothing (SC-1..SC-2)', 'Positive',
   '',
   `1. Open the copy wizard; type a unique campaign name.
2. SC-1: Close via the Cancel button. / SC-2: Close via the X header close.
3. Search the list for the unique name.`,
   'The wizard closes and the search returns "No results." — no campaign is created. (Verified PASSED on 2026-06-10.)'],

  ['Marketing', 'TC-CP-MK-011', 'Copy → Publish from Preview creates a Scheduled campaign (SC-1..SC-2)', 'Positive',
   '',
   `1. Copy a campaign; fill unique name + future start date (+7 days).
2. Step 2 → "Preview & Publish" → Step 3 "Preview".
3. Click "Publish"; then search the list for the name.`,
   `SC-1: Publish closes the wizard.
SC-2: The published copy appears in the Marketing list with status "Scheduled" (future start date). (Verified PASSED on 2026-06-10.)`],

  ['Marketing', 'TC-CP-MK-012', 'Copy → update CID + A/B traffic split → save', 'Positive',
   'Copies a known-advanceable source ("Mar_caching_1"). End date is NOT set here (adding one requires completing program-type gift ID rows — deferred). A/B test end date is REQUIRED to commit the experience and must be > campaign start date (and < campaign end date when one is set).',
   `1. Copy "Mar_caching_1"; capture source name + new auto cmgmtId.
2. Step 1: update name, enter a new CID, set future start date (+7 days); advance to Step 2.
3. Step 2: open the ruleset editor (pencil) — confirm the copied rule references BOTH the new cmgmtId and the typed CID (auto-injection).
4. Drill View rules → View contents → Add experience: enable A/B testing, set traffic split Primary 60% (Default auto-computes to 40%, read-only), set A/B test end date +10 days.
5. Commit the experience; continue back to Step 2.
6. Preview → confirm CID updated → Save as Draft; search the list for the copy and the source.`,
   `The new CID is auto-injected into the copied ruleset alongside the new cmgmtId.
Traffic split updates (Primary 60% / Default auto 40%); the A/B test end date is accepted.
Preview shows the updated CID; Save as Draft succeeds; the copy appears as Draft; the original campaign is unchanged. (Verified PASSED on 2026-06-11.)`],

  ['Marketing', 'TC-CP-MK (deferred)', 'End-date update + CID uniqueness — blocked by the gift-ID requirement', 'Deferred',
   'Not yet automated. Setting a campaign end date makes every program-type row require a completed gift ID (Cycle & Gift Product Id); until completed/removed the wizard shows "Please remove or complete uncompleted gift ID rows" and will not advance past Step 1.',
   `Pending the gift-ID completion sub-flow:
1. Copy → update end date → complete/remove gift ID rows → save.
2. CID uniqueness: a CID in use by an active (non-expired) campaign is rejected; a CID from an expired campaign is accepted (backend existCID requires endDateTime >= now, so the owner needs a future end date — same gift-ID blocker).`,
   'To be added once the gift-ID completion flow is automated.'],
];

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'QA';
  const ws = wb.addWorksheet('Copy Feature Test Cases', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.columns = [
    { header: 'Module',          key: 'module',  width: 16 },
    { header: 'TC ID',           key: 'tcid',    width: 15 },
    { header: 'Title / Scenario', key: 'title',  width: 42 },
    { header: 'Type',            key: 'type',    width: 18 },
    { header: 'Preconditions',   key: 'precond', width: 45 },
    { header: 'Test Steps',      key: 'steps',   width: 70 },
    { header: 'Expected Result', key: 'expected', width: 70 },
  ];

  // Header styling
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.alignment = { vertical: 'middle', horizontal: 'center' };
  header.height = 22;
  header.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } };
    c.border = { bottom: { style: 'thin' } };
  });

  const moduleColors = {
    'Gradual Rollout': 'FFE7EEF8',
    'Eligibility':     'FFE9F5E9',
    'Personalization': 'FFFDF3E3',
    'Redirection':     'FFF6E9F3',
    'Marketing':       'FFE8F4F8',
  };

  for (const [module, tcid, title, type, precondExtra, steps, expected] of rows) {
    const precond = precondExtra
      ? `${COMMON_PRECONDITION}\n${precondExtra}`
      : COMMON_PRECONDITION;
    const row = ws.addRow({ module, tcid, title, type, precond, steps, expected });
    row.alignment = { vertical: 'top', wrapText: true };
    row.getCell('tcid').font = { bold: true };
    if (/Skipped|Deferred/.test(type)) {
      row.getCell('type').font = { italic: true, color: { argb: 'FF808080' } };
    } else if (/Negative/.test(type)) {
      row.getCell('type').font = { color: { argb: 'FFC00000' } };
    } else {
      row.getCell('type').font = { color: { argb: 'FF2E7D32' } };
    }
    const fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: moduleColors[module] } };
    row.getCell('module').fill = fill;
    row.eachCell(c => {
      c.border = {
        top: { style: 'hair' }, bottom: { style: 'hair' },
        left: { style: 'hair' }, right: { style: 'hair' },
      };
    });
  }

  ws.autoFilter = 'A1:G1';

  const out = path.join(__dirname, '..', 'docs', 'Copy-Feature-Test-Cases.xlsx');
  await wb.xlsx.writeFile(out);
  console.log(`Written: ${out} (${rows.length} test cases)`);
}

main().catch(e => { console.error(e); process.exit(1); });
