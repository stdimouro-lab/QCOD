# QCOD Import Workflows

All imports live in `web/src/components/ImportCenter.jsx`. Every one shows
a preview before applying — there is no path that writes on file selection alone.

## AssetWorx ENEX Import (with Location Resolution)
- Accepts: `.xlsx, .xls, .csv`
- Expected headers: `Name, Serial Number, Description, ENEX Location, CMR, Last Inventoried, Last Observed Time, Disposal Status`
- Validation: asset-number classification (valid/scanner-misread/blank),
  location resolution via `resolveEnexLocation()`, duplicate asset-number
  and duplicate serial-number detection within the batch
- Modes: **Replace Current Snapshot** (default) or **Merge With Existing Assets**
- On apply: writes `qcod-assets`, generates QC/Research records via
  `generateQcRecords()`/`generateResearchRecords()`, writes one
  `qcod-import-history` entry, dispatches `qcod-data-changed`
- Affected pages: Master Asset List (comparison), QC Center, Research Center, Data Status
- Affected reports: ENEX Import Summary, Unresolved ENEX Locations, Asset Inventory, Asset Issues, Duplicate Assets, Missing Serial Numbers
- Recommended SQL transaction: stage all rows, validate, then insert/update
  `inventory_records` + insert `qc_records`/`research_records` +
  `import_history` in one transaction; on any fatal validation error,
  commit nothing.

## AssetWorx Inventory (legacy/simple profile)
- Accepts: `.xlsx, .xls, .csv`
- Expected headers: `Name, Serial Number, Description, Location Name, CMR, Last Inventoried, Last Observed Time, Disposal Status`
- **This is a distinct, simpler schema from the ENEX profile above** — it
  has no `ENEX Location` column and does not attempt location resolution.
  Treat these as two separate import profiles during migration, not one.
- Validation: asset-number classification only
- On apply: writes `qcod-assets` (append), writes `qcod-import-status`

## Master Asset List
- Accepts: `.xlsx, .xls, .csv`
- Expected headers: `Asset Number, Description, Serial Number, Manufacturer, Model, Building, Room, Department`
- Validation: blank/invalid-asset-number rows excluded and counted
- Mode: replace only (confirmation shown before applying)
- On apply: writes `qcod-master-asset-list` + `qcod-master-asset-list-import-status`
- Affected pages: Master Asset List comparison view
- Affected reports: (comparison is inline on the page; not yet a
  standalone exportable report beyond the page's own Excel/PDF buttons)

## Daily QC Log (manual)
- Accepts: `.xlsx, .xls, .csv`
- Expected headers: `Date, Facility, Building, Floor, Section, Department Area, Tag Location, Equipment Description, EE Tag Number, Serial Number, QC Status, Notes`
- On apply: appends raw rows (CSV field shape, not normalized) directly
  into `qcod-qc-records` — the same key auto-generated records use, with
  a different field shape. See Field Mapping Reference.

## Research Items (manual)
- Accepts: `.xlsx, .xls, .csv`
- Expected headers: `Date Found, Facility, Building, Floor, Section, Asset Number, Serial Number, Description, Issue Type, Status, Notes`
- Same dual-shape situation as QC — appends into `qcod-research-records`.

## Section Progress
- Accepts: `.xlsx, .xls, .csv`
- Matches rows to existing sections by Building + Floor + Section name
  (case-insensitive, punctuation-tolerant); **never creates a new section**
- On apply: updates `qcod-section-progress`, appends `qcod-section-history` entries

## Facility / Building / Floor / Section / Room Configuration
- Accepts: `.xlsx, .xls, .csv`
- Required headers (Room Configuration, the most complex):
  `Facility ID, Building ID, Floor ID, Section ID, Room ID, Room Number, Room Name, Room Type, Architectural Zone, Status, Last Updated, Notes`
- Validation: every parent reference checked against existing records;
  duplicate detection scoped to facility+building+floor+normalized room
  number; blank `Section ID` is valid (marked "Section Pending," not an error)
- Mode: **merge only** — adds new records, updates matches by ID, never
  deletes a record absent from the file. No replace-mode with confirmation
  exists yet for any configuration import.
- On apply: writes the corresponding `localStorage` key, dispatches `qcod-data-changed`

## Backup Restore
- Accepts: `.json` (a file previously produced by "Export All Local Data")
- Validation: `validateBackupShape()` checks every expected array field is
  actually an array before writing anything; malformed files are rejected
  outright
- On apply: an automatic snapshot of current state is taken first (so a
  bad restore can itself be undone by re-importing that snapshot), then
  every dataset in the backup is written, then `qcod-data-changed` fires

## Recommended SQL transaction pattern for all imports
1. Create an `import_batches` row.
2. Parse and stage every row with its original values and a source row number.
3. Validate every staged row; classify create/update/skip/reject.
4. If any fatal (non-warning) validation error exists for a required
   field, mark the batch rejected and commit nothing to target tables.
5. Otherwise, in one transaction: write valid rows to target tables,
   write rejected rows to a rejected-rows table (preserving original
   values and reason), update the `import_batches` row to `committed`.
6. Produce the same summary counts QCOD currently shows in its preview
   (total/valid/blank/duplicate/rejected/warning/new/updated).
