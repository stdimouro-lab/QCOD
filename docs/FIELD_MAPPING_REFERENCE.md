# QCOD Field Mapping Reference

Covers the highest-migration-priority datasets in full detail. Facility/
Building/Floor/Section/Room follow one consistent pattern (shown in full
for Room, the most complex); Facility/Building/Floor/Section use the same
approach with fewer fields — see `docs/DATA_SOURCE_INVENTORY.md` for their
field lists if a full table is needed later.

## Room

| Current field | Meaning | Type | Required | Nullable | Example | SQL type | Notes |
|---|---|---|---|---|---|---|---|
| `id` | Deterministic room ID | string | yes | no | `500-1-1A101` | varchar PK | `{buildingId}-{floorCode}-{normalizedRoomNumber}` |
| `facilityId` | Parent facility | string | yes | no | `martinsburg-va` | varchar FK | |
| `buildingId` | Parent building | string | yes | no | `500` | varchar FK | |
| `floorId` | Parent floor | string | yes | no | `500-1` | varchar FK | must belong to `buildingId` |
| `sectionId` | Parent section | string | no | **yes** | `500-1-CPC1` or `""` | varchar FK, nullable | blank = "Section Pending," a real current state |
| `roomNumber` | Display room number, exact as printed | string | yes | no | `1A-136` | varchar | never normalized/overwritten |
| `roomName` | Room label from the drawing | string | no | yes (some real rooms have none) | `OUT PATIENT PHARMACY` | text | |
| `roomType` | Derived classification | string | no | yes | `Pharmacy` | varchar | keyword-classified, not authoritative |
| `architecturalZone` | Zone prefix | string | no | yes | `1A` | varchar | parsed from `roomNumber`, stored not derived at render time |
| `squareFeet` | Square footage from the drawing | number | no | yes | `2523` | integer | |
| `sourceDocument` | Originating PDF filename | string | no | yes | `500-1st Floor Arch.pdf` | varchar | audit trail |
| `sourcePage` | PDF page number | number | no | yes | `1` | integer | |
| `extractedLabel` | Raw matched text before parsing | string | no | yes | `1A-136` | text | audit trail |
| `status` | Operational/project status | string | yes | no | `not_started` | enum | see status enum below |
| `lastUpdate` | Last status-change date | string | no | yes | `""` | date/varchar | display `Not Updated` when blank |
| `notes` | Free text | string | no | yes | `""` | text | |

Status enum (shared across sections/floors/rooms/buildings):
`not_started, in_progress, completed, return_needed, no_access` (see
`data/statuses.json` for label/color).

## Inventory Record (QCOD's "asset")

| Current field | Meaning | Type | Required | Nullable | SQL type | Notes |
|---|---|---|---|---|---|---|
| `assetNumber` | VA/AssetWorx asset tag | string | yes (blank rows excluded) | no | varchar | validated `613 EE#####`; NOT globally unique in source data — dedup detection is a feature, not an assumption |
| `serialNumber` | Manufacturer serial | string | no | yes | varchar | |
| `description` | Equipment description | string | no | yes | text | |
| `locationName` | Free-text AssetWorx location | string | no | yes | text | distinct from `rawLocation` (ENEX code) |
| `rawLocation` | Original ENEX location code | string | no | yes | varchar | e.g. `SPGD111-500`, preserved verbatim |
| `facilityId`/`buildingId`/`floorId`/`sectionId`/`roomId` | Resolved hierarchy | string | no | **all yes** | varchar FK | only populated once location resolution succeeds |
| `disposalStatus` | AssetWorx disposal field | string | no | yes | varchar | checked for "Not Found"/"New Asset"/"Offline Sync" text |
| `issueTypes` | Array of detected issues | array of string | no | yes (empty array) | JSON/array | see Business Rules for the full issue-type list |

**Inconsistent field naming across the app, confirmed real (not
hypothetical)**: this dataset uses `status`-free field names (no top-level
`status`), while QC/Research records below inconsistently use `status`,
`'QC Status'`, or `'Status'` depending on which import path wrote them.
The migration should normalize all of these to one real `status` enum
column per table and stop relying on field-name detection at read time.

## QC Record — both real shapes, normalize to one

| Manually-imported CSV field | Auto-generated field | Meaning | Recommended unified SQL field |
|---|---|---|---|
| `'Date'` | `createdAt` | When the record was created/observed | `created_at` (timestamp) |
| `'Facility'` | `facilityId` | Facility | `facility_id` |
| `'Building'` | `buildingId` | Building | `building_id` |
| `'EE Tag Number'` | `assetNumber` | Asset number | `asset_number` |
| `'Department Area'` / `'Tag Location'` | `qcType` | What was being checked | `qc_type` |
| `'Serial Number'` | `serialNumber` | Serial | `serial_number` |
| `'QC Status'` | `status` | Status | `status` (enum) |
| `'Notes'` | `notes` | Free text | `notes` |

See `web/src/lib/recordStatus.js` for the authoritative current
field-resolution logic — it is the exact specification for this mapping.

## Research Record — both real shapes, normalize to one

| Manually-imported CSV field | Auto-generated field | Recommended unified SQL field |
|---|---|---|
| `'Date Found'` | `createdAt` | `created_at` |
| `'Facility'` | `facilityId` | `facility_id` |
| `'Building'` | `buildingId` | `building_id` |
| `'Asset Number'` | `assetNumber` | `asset_number` |
| `'Serial Number'` | `serialNumber` | `serial_number` |
| `'Description'` | `description` | `description` |
| `'Issue Type'` | `issueType` | `issue_type` |
| `'Status'` | `status` | `status` (enum) |
| `'Notes'` | `notes` | `notes` |

## Import History

| Current field | Type | Notes |
|---|---|---|
| `id`, `sourceFileName`, `importType`, `importMode` | string | `importMode`: `replace_snapshot` or `merge` |
| `importedAt` | ISO timestamp | |
| `rowsRead`, `validAssets`, `scanErrorsIgnored`, `matchedLocations`, `multipleMatches`, `unmatchedLocations` | integer | all real counts, verified to sum consistently in tests |
| `researchCreated`, `researchUpdated`, `qcCreated`, `qcUpdated`, `assetsCreated`, `assetsUpdated` | integer | |
| `warnings` | array of string | |

## Section History

| Current field | Type | Notes |
|---|---|---|
| `id`, `sectionId` | string | |
| `previousStatus`, `newStatus` | enum | |
| `previousCompletionPct`, `newCompletionPct` | integer 0-100 | |
| `note`, `updatedAt` | string/timestamp | append-only — never overwritten |
