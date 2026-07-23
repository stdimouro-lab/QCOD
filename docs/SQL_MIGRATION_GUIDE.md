# QCOD SQL Migration Guide

**This is a reference starting point, not a mandatory schema.** Jon's team
should adapt table/field names and constraints to their own conventions.
Only tables with real, current QCOD behavior behind them are marked
"Implemented." Tables with no current QCOD code behind them are marked
"Future-only" and should not be assumed to have working reference behavior.

## Core hierarchy tables (Implemented)

### `facilities`
- PK: `id` (currently a slug string, e.g. `martinsburg-va`)
- Fields: `name`, `city`, `state`, `status`, `notes`
- Source: `data/facilities.json` / `qcod-facilities`
- Related pages: Buildings, Floors, Sections, Rooms, Master Asset List (facility filter)
- Related import: Facility Configuration

### `buildings`
- PK: `id` (currently the VA building number as a string, e.g. `"500"`)
- FK: `facility_id → facilities.id`
- Fields: `name`, `status`, `configured` (boolean), `notes`,
  `expected_assets`, `found_assets`, `tagged_assets`
- Unique constraint: none currently enforced beyond PK — recommend
  `(facility_id, id)` unique in SQL even though `id` alone happens to be
  globally unique today (VA building numbers)
- Index: `facility_id`
- Migration concern: 81 buildings exist in the directory; only 1
  (`"500"`) has `configured: true`. Preserve `configured` as a real
  boolean column, not a derived value.

### `floors`
- PK: `id` (e.g. `500-1`, `500-B`)
- FK: `building_id → buildings.id`
- Fields: `name`, `level` (integer, Basement = 0), `status`,
  `expected_assets`, `found_assets`, `tagged_assets`, `map_completion_pct`, `map_notes`
- Index: `building_id`

### `sections`
- PK: `id` (e.g. `500-1-CPC1`)
- FK: `building_id → buildings.id`, `floor_id → floors.id`
- Fields: `name`, `status`, `completion_pct`, `expected_assets`,
  `found_assets`, `tagged_assets`, `asset_completion_pct`, `last_update`, `notes`
- Migration concern: currently only 28 sections exist, only on Floors 1-2
  of Building 500. Floors 3-6 and Basement have zero sections — this is
  real incompleteness, not a bug, and should migrate as zero rows, not
  placeholder rows.

### `rooms`
- PK: `id` (deterministic: `{buildingId}-{floorCode}-{normalizedRoomNumber}`, e.g. `500-1-1A101`)
- FK: `facility_id`, `building_id`, `floor_id`, `section_id` (**nullable** — a blank `section_id` means "Section Pending," a real and current state, not an error)
- Fields: `room_number` (display value, exact as printed on the drawing),
  `room_name`, `room_type`, `architectural_zone`, `square_feet`,
  `source_document`, `source_page`, `extracted_label`, `status`,
  `last_update`, `notes`
- Unique constraint: `(facility_id, building_id, floor_id, normalized_room_number)`
  — **not** `room_number` alone; the same room number is explicitly allowed
  to repeat in a different building.
- Recommend a separate generated/stored `normalized_room_number` column
  (uppercase, spaces stripped) purely for the uniqueness constraint and
  search — never overwrite the display `room_number`.
- Current volume: 1,026 real rows for Building 500 (extracted from actual
  architectural PDFs), 0 for every other building.
- Migration concern: 100% of current rooms have `section_id = NULL`
  (Section Pending) — no department maps have been cross-referenced yet.
  This is accurate current state, not sample/placeholder data.

## Asset and inventory tables (Implemented)

### `master_assets`
- PK: recommend a surrogate `id` (current JS array has no stable ID beyond `assetNumber`, which is not guaranteed unique — see `docs/DATA_SOURCE_INVENTORY.md`)
- Fields: `asset_number`, `description`, `serial_number`, `manufacturer`,
  `model`, `building_id`, `room_id`, `department`, `status`
- Source: VA's official reference file import, not derived data.
- Nullable: everything except `asset_number` — the app never fabricates a
  value for a blank cell.

### `inventory_records` (QCOD's `assets`)
- PK: recommend a surrogate `id` — same `assetNumber`-not-unique caveat
- FK (all nullable, since resolution can be incomplete): `facility_id`,
  `building_id`, `floor_id`, `section_id`, `room_id`
- Fields: `serial_number`, `description`, `location_name`, `cmr`,
  `last_inventoried`, `last_observed_time`, `disposal_status`,
  `raw_location` (the original unparsed ENEX code), `issue_types` (array/JSON)
- Validation rule to preserve: `asset_number` matching `^613\s?EE\d+` is
  valid; matching `^613\s?E(?!E)` is a scanner misread and must be
  excluded from this table entirely (never inserted).

### `inventory_imports` (QCOD's `qcod-import-history`)
- PK: `id`
- Fields: `source_file_name`, `import_type`, `import_mode`
  (`replace_snapshot`/`merge`), `imported_at`, `rows_read`, `valid_assets`,
  `scan_errors_ignored`, `matched_locations`, `multiple_matches`,
  `unmatched_locations`, `research_created`, `research_updated`,
  `qc_created`, `qc_updated`, `assets_created`, `assets_updated`, `warnings` (array/JSON)
- Recommend this become the parent of a real staging-table pattern (see
  "Staging approach" below) rather than only a summary row, which is all
  it currently is.

## QC and Research tables (Implemented, with a known shape inconsistency)

### `qc_records`
- **Migration concern, real and current**: today's `qcod-qc-records` key
  holds two incompatible field shapes (manually-imported CSV rows using
  `'QC Status'`/`'Date'`/etc., and auto-generated records using
  `status`/`createdAt`/etc.) — see `docs/DATA_SOURCE_INVENTORY.md`. **Design
  one real `qc_records` table with one `status` enum column**; do not carry
  the dual-shape situation into SQL. `web/src/lib/recordStatus.js` shows
  every field alias QCOD currently reads from either shape — use it as
  the mapping reference when writing the migration script.
- Recommended fields: `id`, `source` (`manual_import`/`enex_import`),
  `import_id` FK, `facility_id`, `building_id`, `floor_id`, `section_id`,
  `room_id`, `asset_number`, `serial_number`, `qc_type`, `status` (enum:
  `pending, selected, passed, failed, needs_correction, recheck_required, closed`),
  `assigned_to`, `selected_date`, `reviewed_date`, `reviewer`, `result`,
  `failure_reason`, `corrective_action`, `recheck_date`, `created_at`,
  `completed_at`, `notes`
- Unique/dedup rule to preserve: no two **non-closed** records for the
  same `(asset_number, qc_type)`.

### `research_records`
- Same dual-shape caveat as above — see `web/src/lib/recordStatus.js`.
- Recommended fields: `id`, `source` (`manual_import`/`enex_import`/`qc_failure`),
  `import_id` FK, hierarchy FKs, `asset_number`, `serial_number`,
  `raw_location`, `description`, `issue_type`, `status` (enum: `open,
  in_review, waiting_for_information, resolved, closed, reopened`),
  `priority` (enum: `low, normal, high, critical`), `assigned_to`,
  `resolution`, `created_at`, `last_updated`, `resolved_at`, `resolution_notes`, `notes`
- Critical rule to preserve: a resolved/closed record is **never
  overwritten** when the same issue recurs — a new row with status
  `reopened` is inserted instead, and the old row's `resolved_at`/`status`
  stay untouched. This means `(asset_number, issue_type)` is NOT unique
  across all rows — only across non-terminal-status rows.

## Configuration and history tables (Implemented)

### `section_history`, `location_aliases`, `location_parser_rules`
- All append-only in current behavior — recommend `INSERT`-only grants in
  SQL (no `UPDATE`/`DELETE`) to enforce in the database what QCOD currently
  only enforces by JS convention.
- `location_aliases`: unique constraint on `(facility_id,
  raw_location_normalized)` WHERE `approved = true` — QCOD's
  `approveLocationAlias()` already rejects a duplicate active alias for
  the same normalized location.

### `import_history`
Already described above under `inventory_imports` — same table.

## Future-only tables (no current QCOD implementation behind them)

- `report_definitions` — QCOD's 34 reports are currently hardcoded in
  `ReportCenter.jsx`, not data-driven. A `report_definitions` table is a
  reasonable migration target but represents new capability, not ported behavior.
- `users`, `roles`, `user_roles` — **QCOD has no authentication or user
  concept whatsoever today.** Every "Assigned To" field is a free-text
  string, not a foreign key. Do not assume any existing user-attribution
  data to migrate.
- `application_settings` — `data/project.json` is the closest current
  equivalent (app name, version, phase) but is not a generic settings store.

## Staging approach (recommended)

QCOD's current import behavior (preview → validate → apply, never
partial-write on a fatal error) maps naturally to:

1. `import_batches` (id, file name, type, mode, started_at, status)
2. `import_staging_rows` (batch_id FK, source_row_number, raw_json,
   validation_status, validation_errors, target_table)
3. On successful validation, a single transaction moves valid staging rows
   into their target tables and marks the batch `committed`; a fatal
   validation error leaves the batch `rejected` with nothing written to
   target tables — matching QCOD's current "preview only writes are
   real writes" guarantee.

## Transaction approach

Every import apply operation in QCOD today is effectively atomic at the
JS-array level (the whole updated array is written to localStorage in one
call). The SQL equivalent should wrap each import's full set of inserts/
updates in one database transaction, committing only when every row that
passed validation is written successfully.

## Audit approach

QCOD's `qcod-audit-log` (see Data Source Inventory) already models what a
real `audit_logs` table should look like: `id, timestamp, action,
entity_type, entity_id, previous_value, new_value, source, notes`,
append-only. It currently has no viewer UI, but the write-side shape is a
solid direct migration target.
