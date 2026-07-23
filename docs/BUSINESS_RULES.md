# QCOD Business Rules

Every rule below is implemented and tested in the current codebase — none
are aspirational. Test file references let you verify each rule directly.

## Asset-number rules

A valid asset number begins `613 EE` followed by digits, in any spacing or
case: `613 EE53567`, `613 EE 53567`, `613EE53567`, `613 ee53567` all
normalize to the same match. A number beginning `613 E` where the second
`E` is missing (`613 E9999`) is a known RFID scanner misread — it is
**excluded from import entirely**: not counted as a valid asset, never
converted into a Research record, and reported separately in every import
summary as a "scanner misread" count.

Source: `web/src/lib/fileImport.js`'s `classifyAssetNumber()`.
Tests: `assetClassification.test.js`.

The original scanned value is always preserved for audit — normalization
is comparison-only and never rewrites what's actually stored.

## Hierarchy rules

`Facility → Building → Floor → Section → Room`. Every room currently
carries `facilityId`/`buildingId`/`floorId` (required) and `sectionId`
(optional — blank means the room's section is not yet verified, displayed
as "Section Pending," never "Unassigned" or a false 0%).

A room, floor, or section is never permitted to reference a parent that
belongs to a different branch of the hierarchy (e.g. a room's floor must
actually belong to that room's building) — both the import validation
(`previewRoomRows()` in `fileImport.js`) and the completeness audit
(`getHierarchyCompleteness()` in `data.js`) enforce this.

Duplicate-room detection is scoped to `facilityId + buildingId + floorId +
normalized room number` — the same room number in a different building is
explicitly allowed, never flagged.

Tests: `roomConfigImport.test.js`, `configValidation.test.js`.

## Location resolution rules (ENEX/AssetWorx)

An AssetWorx location code such as `SPGD111-500` is parsed into department
prefix, zone letter, room digits, and building — **the floor is never
embedded in the code and is never guessed**. Resolution order:

1. An exact, human-approved alias for that exact normalized code.
2. An approved parser rule (narrows a department+zone combination to one
   floor, previously approved by a human).
3. A search for a *unique* official room matching building+zone+room-number.
4. If more than one room could match, resolution stops at
   `multiple_matches` — never auto-selected, never defaults to the lowest
   floor.
5. If no room matches, `no_match`.

Only outcome 1 or 2 (or a "unique room" match that a human then
approves) ever assigns a room automatically during import — everything
else is surfaced, not resolved silently.

Source: `web/src/lib/enexLocationParser.js`. Tests: `enexLocationParser.test.js`.

## QC rules

QC records are created in two ways: (a) manually imported via the "Daily
QC Log" CSV import, or (b) automatically generated during an AssetWorx/ENEX
import for specific conditions (newly imported asset, room assignment
changed, serial number changed, room has no confirmed section, asset in a
Return Needed or No Access area).

**QC sampling is implemented, not just documented** — `web/src/lib/qcSampling.js`
provides configurable, deterministic sampling (default 10%, adjustable
1-100%, not hard-locked to a 10-20% range in code even though that's the
project's stated target usage). The same import ID + settings always
produces the same sample (seeded, not `Math.random`). Sampling can scope to
the whole import, a facility, building, floor, section, or day, and can
include or exclude assets that already have open Research issues.
**This sampling logic is not yet wired into any UI control** — it exists
and is tested (`v9QcSamplingDataQuality.test.js`) but there's no page to
configure/run it interactively yet.

QC statuses: `pending, selected, passed, failed, needs_correction,
recheck_required, closed`. "Closed" is the only terminal status for
duplicate-prevention purposes — a new import updates an existing
non-closed record for the same asset+QC type rather than creating a
duplicate.

QC status is read from either `record['QC Status']` (CSV-imported shape)
or `record.status` (auto-generated shape) — see `web/src/lib/recordStatus.js`.

## Research rules

A Research record is created automatically during ENEX import when one of
these explicit conditions is met: missing serial number, missing location,
invalid location format, unmatched location, multiple room matches, marked
Not Found in DB / New Asset Found / Offline Sync, duplicate asset number,
duplicate serial number, missing description, or mapped room belonging to
the wrong building. **A `613 E` scanner misread never reaches this logic —
it's excluded upstream, before any Research condition is even evaluated.**

Statuses: `open, in_review, waiting_for_information, resolved, closed,
reopened`. If a previously resolved/closed issue reappears in a later
import, a NEW record is created with status `reopened` — the old
resolved/closed record is never overwritten, preserving history. Active
(non-closed/resolved) statuses dedupe against re-import; the same
asset+issue-type combination updates the existing record rather than
duplicating it.

A function to send a failed QC record to Research
(`sendFailedQcToResearch()`) exists and is tested but **is not currently
wired into the QC Center UI** — there's no button that calls it yet.

Source: `web/src/lib/enexImport.js`, `web/src/lib/researchQcWorkflow.js`.
Tests: `enexImport.test.js`, `v9ResearchQcWorkflow.test.js`.

## Import rules

Every import type shows a preview (counts of valid/blank/duplicate/
rejected/warning rows, plus per-row detail) before anything is written —
there is no "apply immediately" path anywhere in the app. Configuration
imports (Facility/Building/Floor/Section/Room) validate every parent
reference against real existing records; a row with a broken hierarchy is
skipped, never guessed into place. Room Configuration import currently
supports **merge only** (adds new rooms, updates matching rooms by Room
ID, never deletes a room absent from the file) — an explicit
replace-with-confirmation mode does not exist yet.

Every import writes an entry to `qcod-import-history` (filename, mode,
row counts) and dispatches the global `qcod-data-changed` event, which
`App.jsx` subscribes to — every open tab re-reads fresh data automatically,
no reload required.

## Reporting rules

All 34 current report definitions live in `ReportCenter.jsx`'s single
`REPORTS` array + `buildReport()` switch — each returns a uniform
`{ columns, rows, summaryLines, emptyMessage }` shape consumed by both
`exportReportToExcel()` and `exportReportToPdf()`. Excel never truncates
(the full filtered dataset is always written). PDF truncates at 2,000 rows
with a visible warning directing the user to Excel (`assessReportSize()`
in `exportPdf.js`).
