# QCOD Feature/Workflow Reference

Current navigation, verified directly from `web/src/App.jsx`:

```
Overview   -> Dashboard
Project    -> Buildings, Floors, Sections, Rooms
Assets     -> Master Asset List, Imports
Operations -> QC, Research, Outstanding Work
Reports    -> Reports
Admin      -> Configuration
```

## Dashboard (Overview)
- Components: `StatCards.jsx`, `ProjectInfo.jsx` (collapsed by default), `DataStatus.jsx`
- Reads: campus/building/section progress totals, hierarchy completeness, open QC/Research counts
- Writes: nothing
- Migration concern: none — purely a read/aggregate view

## Buildings / Floors / Sections / Rooms
- Components: `BuildingCards.jsx`, `FloorProgress.jsx`, `SectionTable.jsx`, `RoomTable.jsx`
- Filters: Facility, Building, Floor, Section, Status, Search (Rooms page)
- Actions: none (read-only progress/hierarchy browsing)
- Business rules: room/section progress derived from `status` field only,
  never from a retired assignment-confidence concept; "Section Pending"
  displayed rather than a false 0% when a room's section isn't verified
- Migration concern: `RoomTable.jsx` currently shows the first N rows with
  no true pagination — acceptable for ~1,000 rows, will need real
  pagination for a much larger dataset

## Master Asset List
- Component: `MasterAssetList.jsx`
- Imports: Master Asset List file
- Reads: `qcod-master-asset-list`, `qcod-assets`, `qcod-qc-records`, `qcod-research-records`
- Compares: found-in-scan, serial match, QC status, Research status per master record
- Exports: Excel, PDF, JSON
- **Known incomplete**: no true pagination, no column sorting, no
  row-detail panel — see Known Limitations in `HANDOFF.md`

## Imports
- Component: `ImportCenter.jsx`
- Handles every import type listed in `docs/IMPORT_WORKFLOWS.md`, plus backup export/restore
- Business rule: preview always required before apply

## QC
- Component: `QcCenter.jsx`
- Reads: `qcod-qc-records` (both field shapes — see Field Mapping Reference)
- Filters: Search, Facility, Building, QC Status, Start/End date (inclusive, safe on invalid input)
- Actions: Export Excel, Export PDF, Clear Local Data
- Refreshes automatically on any `qcod-data-changed` event (verified this round — not memoized, re-renders when its parent does)

## Research
- Component: `ResearchCenter.jsx`
- Same shape/refresh situation as QC
- On-page description text was corrected this round to accurately state
  that Research records are generated automatically from explicit import
  conditions, not "manual import only" (a previously stale claim)

## Outstanding Work
- Shows sections with status `return_needed` or `no_access`
- Read-only

## Reports
- Component: `ReportCenter.jsx` — 34 report definitions, single `buildReport()` switch
- Every report: `{ columns, rows, summaryLines, emptyMessage }` → Excel/PDF exporters
- PDF truncates at 2,000 rows with a visible warning; Excel never truncates

## Configuration
- Component: `ConfigurationCenter.jsx`
- Read-only browsing of Facility/Building/Floor/Section/Room configuration with filters and JSON export

## Not yet built (exists in logic, no page)
- Data Quality validation (`web/src/lib/dataQuality.js`) — logic and tests
  exist, no dedicated page (the earlier "Data Quality Queue" was
  intentionally removed as a duplicate-of-AssetWorx workflow; the
  underlying checks were kept for future report/filter use)
- Audit log viewer — `qcod-audit-log` is written, nothing displays it
- Import undo — `undoImport()` exists and is tested, no UI button calls it
- QC sampling configuration UI — `qcSampling.js` is built and tested, not wired to any page
