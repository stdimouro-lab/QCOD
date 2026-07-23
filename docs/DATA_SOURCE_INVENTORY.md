# QCOD Data Source Inventory

Every dataset QCOD actually reads or writes, as implemented today. All keys
and filenames below are copied directly from `web/src/lib/data.js` and
`data/*.json` — nothing here is invented.

## Bundled JSON defaults (`data/*.json`)

These are the first-run defaults. Once the app runs, the corresponding
`localStorage` key (below) takes over as the live source of truth.

| File | Purpose | Record ID | Migration target |
|---|---|---|---|
| `data/facilities.json` | Facility directory | `id` | `facilities` |
| `data/buildings.json` | Campus building directory (81 buildings, 1 configured) | `id` | `buildings` |
| `data/floors.json` | Building 500 floors (Basement + 1-6) | `id` | `floors` |
| `data/sections.json` | Building 500 sections (28, Floors 1-2 only) | `id` | `sections` |
| `data/rooms.json` | Building 500 room directory (1,026 real rooms extracted from architectural PDFs) | `id` | `rooms` |
| `data/assets.json` | Scanned/imported inventory (empty at handoff — no real data bundled) | `assetNumber` | `inventory_records` |
| `data/statuses.json` | Status label/color definitions (not a per-record dataset — shared config) | n/a | `application_settings` or hardcoded enum |
| `data/project.json` | App name, version, facility label, phase | n/a | `application_settings` |
| `data/import-status.json` | Legacy general import-status defaults | n/a | superseded by `qcod-import-history` |

Two additional files exist but are **not currently read by the application**
(confirmed by search — no live import): `data/directory.json`,
`data/floor-maps.json`. These are earlier-round artifacts; flag for removal
or archival during migration rather than migrating them.

## localStorage datasets (live data, `qcod-` prefix)

| Key | Purpose | Record ID | Writers | Readers |
|---|---|---|---|---|
| `qcod-facilities` | Live facility list | `id` | Configuration import | Everywhere via `getFacilities()` |
| `qcod-buildings` | Live building list | `id` | Configuration import | Everywhere via `getBuildings()` |
| `qcod-floors` | Live floor list | `id` | Configuration import | Everywhere via `getFloors()` |
| `qcod-rooms` | Live room list | `id` | Room Configuration import | Rooms page, reports, Data Status |
| `qcod-assets` | Scanned/imported inventory | `assetNumber` | AssetWorx/ENEX import | Master Asset List comparison, reports |
| `qcod-section-progress` | Live section list (historically named for its original purpose — sections, not just "progress") | `id` | Section/Configuration import | Sections page, reports, room progress rollup |
| `qcod-qc-preview` | Last QC CSV import preview (not yet applied) | n/a (array) | Imports page preview step | Imports page only |
| `qcod-research-preview` | Last Research CSV import preview | n/a (array) | Imports page preview step | Imports page only |
| `qcod-qc-records` | **Applied** QC records — two shapes share this key: manually-imported CSV rows (`'QC Status'` etc.) and auto-generated records from ENEX import (`status` etc.) | `id` (auto) / none (CSV rows) | Daily QC Log import, `generateQcRecords()` | QC Center, Data Status, reports |
| `qcod-research-records` | **Applied** Research records — same dual-shape situation as QC | `id` (auto) / none (CSV rows) | Research Items import, `generateResearchRecords()`, `sendFailedQcToResearch()` (built, not yet UI-wired) | Research Center, Data Status, reports |
| `qcod-location-mappings` | Free-text asset `Location Name` → section suggestions | `locationNameNormalized` | Asset-mapping helper functions (`approveLocationMapping`) | Building/floor/section asset-progress rollups |
| `qcod-mapping-history` | Change log for the above | n/a (array) | `applyAssetMappings()` | "Location Reference History" report |
| `qcod-section-history` | Section status/completion change log | n/a (array) | Section import (`appendSectionHistory`) | SectionHistory component, "Section History" report |
| `qcod-section-boundaries` | Local operational config for room-to-section rules on Building 500 (loaded via file picker, not bundled) | n/a (array) | `loadSectionBoundariesFromFile()` | Currently unused by any active UI — see Known Inconsistencies |
| `qcod-room-source-metadata` | Metadata about which architectural PDF a room came from | n/a (array) | Not currently written by any UI (function exists, unused) | Not currently read |
| `qcod-location-aliases` | Exact ENEX-location-code → room overrides, human-approved | `id` | Location resolution approval functions | `resolveEnexLocation()` during ENEX import |
| `qcod-location-parser-rules` | Department+zone → floor rules, human-approved | `id` | Location resolution approval functions | `resolveEnexLocation()` during ENEX import |
| `qcod-location-review-history` | Decision log for alias/rule approvals | n/a (array) | Built (`appendLocationReviewHistory`), no UI currently calls it | Not currently read by any UI |
| `qcod-import-history` | Every import run — filename, mode, row counts | `id` | AssetWorx/ENEX import apply step | Import History report, Data Status |
| `qcod-import-status` | Last-import timestamps per type | n/a (object) | Every import type | Data Status, Project Information |
| `qcod-audit-log` | Append-only action log (imports undone, backups created/restored, aliases approved/reassigned/disabled) | `id` | `recordAuditEntry()`, called internally by `data.js` itself whenever a user triggers a backup, restore, or alias action | Not currently surfaced in any UI (data is written by real user actions, no viewer page exists) |
| `qcod-import-backups` | Pre-import snapshots (assets/QC/Research) for undo, bounded to last 10 | `importId` | `savePreImportSnapshot()` | `undoImport()` (function exists, no UI button currently) |
| `qcod-research-history` | Field-change history for Research records | n/a (array) | Built (`appendResearchHistory`), no UI currently calls it | Not currently read |
| `qcod-qc-history` | Field-change history for QC records | n/a (array) | Built (`appendQcHistory`), no UI currently calls it | Not currently read |
| `qcod-master-asset-list` | The VA's official reference asset list | `assetNumber` | Master Asset List import | Master Asset List comparison |
| `qcod-master-asset-list-import-status` | When/how many records last imported | n/a (object) | Master Asset List import | Master Asset List page, Data Status |

## Known inconsistencies (real, not hypothetical)

- `qcod-qc-records` and `qcod-research-records` hold **two different field
  shapes in the same key** (see table above) — this was a real bug found
  and partially fixed this round via `web/src/lib/recordStatus.js`'s
  shape-agnostic accessors. The underlying dual-shape storage itself was
  NOT unified; the migration should pick one shape.
- `qcod-audit-log`, `qcod-import-backups` (undo), `qcod-research-history`,
  `qcod-qc-history`, `qcod-location-review-history`, and
  `qcod-room-source-metadata` are all **written or writable but have no
  corresponding UI page to view them** — the backend logic exists and is
  tested, the frontend page does not. Flag these as "logic built, UI
  pending" rather than assuming a page exists to reference during
  migration.
- `data/directory.json` and `data/floor-maps.json` are unread dead files.
