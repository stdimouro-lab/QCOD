# QCOD Migration Acceptance Checklist

## Hierarchy
- [ ] Facilities migrate with all fields
- [ ] Buildings migrate (all 81 in the directory, not just the 1 configured)
- [ ] Floors migrate (7, all Building 500)
- [ ] Sections migrate (28, Floors 1-2 only — Floors 3-6/Basement legitimately have zero)
- [ ] Rooms migrate (1,026, all Building 500, all with valid parents)
- [ ] Every room/floor/section parent reference remains valid after migration
- [ ] Rooms with `sectionId = NULL` display as "Section Pending," not an error and not a false 0%
- [ ] Duplicate room-identity detection uses facility+building+floor+normalized-number, not room number alone
- [ ] The same room number in two different buildings is never flagged as a duplicate

## Master assets
- [ ] Asset-number search normalization works (`613 EE53567` / `613 EE 53567` / `613EE53567` / `613 ee53567` all match)
- [ ] A malformed `613 E...` value never matches as if it were `613 EE...`
- [ ] Original scanned asset-number text is preserved for audit
- [ ] Duplicate assets are reportable (not silently deduped)
- [ ] Missing serial numbers are reportable
- [ ] Found-in-scan / serial-match comparison against the Master Asset List still works

## Imports
- [ ] Preview shows before any write, for every import type
- [ ] Rejected rows are retained with original values + reason
- [ ] Warnings are retained separately from hard rejections
- [ ] Import history records filename, mode, and row counts
- [ ] Room Configuration merge mode works (add new, update matching, never delete missing-from-file)
- [ ] A failed/invalid import batch writes nothing to target tables
- [ ] Original filename and source row number are retained per rejected row

## QC
- [ ] QC records migrate from both current field shapes into one normalized schema
- [ ] Open vs. closed status logic matches `web/src/lib/recordStatus.js`'s `isOpenQcStatus()`
- [ ] Date filters are inclusive on both start and end
- [ ] No duplicate active QC record for the same (asset, QC type)
- [ ] QC Excel/PDF exports work

## Research
- [ ] Research records migrate from both current field shapes into one normalized schema
- [ ] A resolved/closed record is never overwritten when the same issue recurs — a new "reopened" record is created instead
- [ ] Open vs. closed status logic matches `isOpenResearchStatus()`
- [ ] Date filters are inclusive
- [ ] Research Excel/PDF exports work

## Reports
- [ ] All 34 current reports (see `ReportCenter.jsx`'s `REPORTS` array) exist or are explicitly deprecated with a documented reason
- [ ] Filters behave the same as current (building/floor/section/status/date-range as applicable per report)
- [ ] Excel export never truncates
- [ ] PDF export truncates large datasets with a visible warning and Excel recommendation
- [ ] Empty-report states show the same "No X have been Y yet" style message rather than a blank/broken table

## Security and audit
- [ ] Authentication uses the receiving framework (QCOD has none today — this is 100% new work, not a migration)
- [ ] Authorization is enforced server-side (QCOD has none today)
- [ ] Import activity is auditable (QCOD's `qcod-audit-log` write-side logic is a starting reference)
- [ ] Record changes are auditable
- [ ] Database credentials are never exposed to the frontend (trivially true today since there is no backend — must be designed correctly from scratch)
