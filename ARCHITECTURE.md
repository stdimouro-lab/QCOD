# QCOD Architecture

## Application entry point

`web/src/main.jsx` mounts `web/src/App.jsx` into `#root` (see `web/index.html`).
`App.jsx` owns the top-level navigation state (`tab`, `selectedFacilityId`,
`selectedBuildingId`) and renders one component per active tab. It does not
use a router library — navigation is a plain `useState` string compared
against tab IDs.

## Navigation organization (V10)

```
Overview   -> Dashboard                          (tab: overview)
Project    -> Buildings, Floors, Sections, Rooms  (tabs: buildings, floors, sections, rooms)
Assets     -> Master Asset List, Imports          (tabs: master-assets, imports)
Operations -> QC, Research, Outstanding Work      (tabs: qc, research, outstanding)
Reports    -> Reports                             (tab: reports)
Admin      -> Configuration                       (tab: configuration)
```

`NAV_GROUPS` in `App.jsx` is the single source of truth for this structure;
`TABS` is a flattened lookup derived from it, and `groupForTab()` finds
which group a given tab belongs to (used to render the secondary "sub-tab"
row and to highlight the active top-level group).

V9 and earlier had a "Review Queues" group (Room Assignment, Location
Mapping, Asset Mapping/Master Asset List, Data Quality) — removed in V10
because Room Assignment and Location Mapping duplicated AssetWorx's own
job of assigning locations. See `REMOVED_FILES.txt`.

## Main components (`web/src/components/`)

| Component | Tab | Purpose |
|---|---|---|
| `StatCards.jsx`, `ProjectInfo.jsx`, `DataStatus.jsx` | Overview | Dashboard summary cards, collapsible detail panels |
| `BuildingCards.jsx`, `FloorProgress.jsx`, `SectionTable.jsx`, `RoomTable.jsx` | Project | Hierarchy browsing + progress |
| `MasterAssetList.jsx` | Assets | VA reference list import + comparison against scanned inventory |
| `ImportCenter.jsx` | Assets | AssetWorx/ENEX import, configuration imports, backup/restore |
| `QcCenter.jsx`, `ResearchCenter.jsx` | Operations | Work queues |
| `ReportCenter.jsx` | Reports | All Excel/PDF report generation |
| `ConfigurationCenter.jsx` | Admin | Read-only browsing of facility/building/floor/section/room configuration |
| `BuildingSelector.jsx`, `FacilitySelector.jsx` | (shared) | Scoping controls shown contextually |
| `SectionHistory.jsx`, `EmptyState.jsx` | (shared) | Small reusable pieces |

## Data-access layer (`web/src/lib/data.js`)

This is the single module every component imports from for reading or
writing application data. Its core pattern:

1. **Bundled JSON** (`data/*.json`) is imported statically at build time and
   used as the fallback/default state.
2. **`loadLocalData(key, fallback)`** checks `localStorage` first; if the
   key exists, that value wins. If not, the bundled default is returned.
3. Every entity has a `getX()` function (`getFacilities()`, `getRooms()`,
   `getAssets()`, etc.) that wraps this pattern — components never read
   `localStorage` or the bundled JSON directly.
4. **`saveLocalData(key, value)`** writes to `localStorage` and dispatches a
   `qcod-data-changed` `CustomEvent`. `App.jsx` (and any component that
   needs to react to a change made elsewhere) subscribes via
   `onDataChanged(handler)`. This is how, e.g., an import applied in
   `ImportCenter` causes `MasterAssetList`'s comparison to recompute.

## localStorage keys (all prefixed `qcod-`)

| Key | Holds |
|---|---|
| `qcod-facilities`, `qcod-buildings`, `qcod-floors`, `qcod-rooms` | Project hierarchy |
| `qcod-section-progress` | Sections (historically named for its original purpose) |
| `qcod-assets` | QCOD's own scanned/imported inventory (from AssetWorx/ENEX import) |
| `qcod-master-asset-list`, `qcod-master-asset-list-import-status` | The VA's official reference list + when it was last imported |
| `qcod-qc-records`, `qcod-qc-preview`, `qcod-qc-history` | QC work queue, import preview, immutable history |
| `qcod-research-records`, `qcod-research-preview`, `qcod-research-history` | Research work queue, import preview, immutable history |
| `qcod-location-mappings`, `qcod-mapping-history` | Asset Location-Name -> section suggestions (free-text based) + history |
| `qcod-location-aliases`, `qcod-location-parser-rules`, `qcod-location-review-history` | ENEX location-code resolution: exact aliases, department/zone parser rules, and the decision log for both |
| `qcod-section-boundaries`, `qcod-room-source-metadata` | Local operational config for Building 500 room extraction |
| `qcod-import-history`, `qcod-import-status`, `qcod-import-backups` | Import traceability + pre-import snapshots for undo |
| `qcod-audit-log` | Append-only audit trail of meaningful actions |
| `qcod-section-history` | Section status/completion change history |

## JSON datasets (`data/*.json`)

`facilities.json`, `buildings.json`, `floors.json`, `sections.json`,
`rooms.json`, `assets.json`, `statuses.json`, `project.json`,
`import-status.json`. These are the bundled defaults a fresh install starts
from — real operational data lives only in `localStorage` once the app is
used (see README's "Current architecture" section on why).

## Data-change event flow

```
Component action (e.g. "Apply Import")
  -> data.js saveLocalData(key, value)
    -> localStorage.setItem(...)
    -> window.dispatchEvent(new CustomEvent('qcod-data-changed'))
      -> App.jsx's onDataChanged handler fires -> setDataVersion(v => v+1)
        -> React re-renders -> every getX() call reads the fresh value
```

## Import pipeline

1. `ImportCenter.jsx` reads the uploaded file client-side (`fileImport.js`
   / `readWorkbookFile`).
2. Rows are normalized and validated (`normalizeAssetRows`,
   `previewSectionRows`, `previewFacilityRows`, etc., or the ENEX-specific
   `enexImport.js` pipeline for AssetWorx/ENEX files).
3. A **preview** is always shown before anything is written — counts of
   created/updated/skipped/excluded, plus per-row detail for problems.
4. On explicit "Apply", `data.js` writes to `localStorage`, appends to
   `qcod-import-history`, and (for ENEX imports) generates QC/Research
   records via `enexImport.js`'s `generateQcRecords`/`generateResearchRecords`
   — these dedupe against existing active records rather than creating
   duplicates on every re-import.

## Export pipeline

`web/src/lib/exportExcel.js` (`buildReportWorkbook` — pure — then
`exportReportToExcel` adds the file-save step) and
`web/src/lib/exportPdf.js` (`assessReportSize` decides whether to truncate
and warns the user, `exportReportToPdf` renders via jsPDF + autoTable).
Every report in `ReportCenter.jsx` builds a `{ columns, rows, summaryLines }`
shape and hands it to one or both exporters.

## Master Asset List comparison logic

`web/src/lib/masterAssetList.js`:
- `normalizeMasterAssetRows(rows)` — turns raw worksheet rows into the
  master asset record shape, never inventing a value for a blank cell.
- `compareToScannedInventory(masterAssets, scannedAssets, qcRecords, researchRecords)`
  — pure function, read-only, returns one comparison row per master asset:
  found-in-scan, serial match (`true`/`false`/`null` when nothing to
  compare), active QC status, active Research status.
- `summarizeComparison(rows)` — aggregate counts for the summary cards.

## ENNX normalization

`web/src/lib/enexLocationParser.js` parses AssetWorx location codes like
`SPGD111-500` into `{ departmentPrefix, zoneLetter, roomDigits, buildingId }`
— the floor is never embedded in the code and is never guessed.
`resolveEnexLocation()` tries, in order: an exact approved alias, an
approved parser rule (narrows to one floor for a department+zone
combination), then a search for a *unique* official room matching
building+zone+room-number. If more than one room could match, resolution
stops at `multiple_matches` and the location is left for a human decision
(the alias/rule-approval functions in `data.js`) rather than resolved
automatically.

## Asset-number normalization

`web/src/lib/fileImport.js`'s `classifyAssetNumber()` is the single source
of truth: `613 EE#####` (any spacing/case) is `valid`; `613 E####` (missing
the second E) is `scan_error` and is excluded from import entirely — it
never becomes a Research record, per the VA's known scanner-misread pattern.

## Location-alias handling

Two related-but-distinct systems exist:
- `qcod-location-mappings` — free-text asset `Location Name` -> section
  suggestions (used by the asset-mapping helper functions in `data.js`,
  still used for building/floor/section progress rollups).
- `qcod-location-aliases` / `qcod-location-parser-rules` — structured ENEX
  location-code -> room resolution (see above).

These were intentionally kept separate rather than merged (documented as
an open question in an earlier changelog) — flag this for the receiving
team if a unified system is wanted later.

## QC and Research boundaries

QC (`web/src/lib/qcSampling.js`, `researchQcWorkflow.js`) is about
**verifying** a sample of the scanned inventory — pass/fail review. Research
is about **investigating** specific problem assets — missing data, unmatched
locations, duplicates. A failed QC record can generate a Research record
(`sendFailedQcToResearch`), but neither one ever assigns a room or writes
to AssetWorx.

## Backup structure

`exportQcodBackup()` in `data.js` bundles every `localStorage` key above
into one JSON file with `version` (currently `0.8`), `appVersion`
(`project.version`, currently `"Version 10"`), and `exportedAt`.
`validateBackupShape()` checks every array field really is an array before
`importQcodBackup()` writes anything; a malformed file is rejected outright.
Restoring takes an automatic snapshot of the current state first (so a bad
restore can itself be undone by re-importing that snapshot). Backups never
include uploaded file binary contents, absolute file paths, or credentials.

## Recommendations for future SQL migration

- Each `localStorage` key above maps reasonably to one SQL table; the
  `Facility -> Building -> Floor -> Section -> Room -> Asset` hierarchy
  already uses consistent foreign-key-shaped ID fields
  (`facilityId`, `buildingId`, `floorId`, `sectionId`, `roomId`) that
  translate directly to real foreign keys.
- History/log tables (`mappingHistory`, `sectionHistory`,
  `locationReviewHistory`, `auditLog`,
  `researchHistory`, `qcHistory`) are already append-only in the current
  code — a real database's `INSERT`-only table with no `UPDATE`/`DELETE`
  grants would enforce what the JS currently only enforces by convention.
- `qcod-import-backups` (pre-import undo snapshots) is the one dataset that
  probably should NOT become a permanent SQL table as-is — it's designed to
  be bounded/pruned (currently the last 10). A real system would more
  likely use database transactions for this instead.
- Asset-number and ENEX-location normalization logic
  (`classifyAssetNumber`, `enexLocationParser.js`) is pure and
  framework-agnostic — it can move server-side unchanged.
- There is currently no authentication, no per-user attribution beyond a
  free-text "Assigned To" string, and no server-side validation — all of
  this needs to be added, not adapted, during migration.

## Assumptions another developer should know

- All "current facility/building" scoping in the UI is client-side state
  reset on page reload; nothing about the current selection is persisted.
- The app assumes a single operator using a single browser profile at a
  time — there is no concurrency handling for two people editing
  simultaneously (last write to `localStorage` wins).
- `getRoomZone()` and the Building-500-specific room-extraction scripts
  encode an architectural room-numbering convention (`GA`, `1A`, `2B`, ...)
  observed at Martinsburg specifically — verify this generalizes before
  relying on it for a different facility's room numbering scheme.
