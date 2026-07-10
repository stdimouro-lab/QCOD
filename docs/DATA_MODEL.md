# QCOD Data Model

## Overview

QCOD tracks RFID inventory progress at four hierarchy levels:

```
Project
  └── Building (e.g. Building 500)
        └── Floor (e.g. 2nd Floor)
              └── Section (e.g. CPC 1, Surgery, Emergency)
                    └── Room (future — requires official floor plan PDFs)
```

Asset counts roll up from sections → floors → buildings → project.

## Entities

### Project (`project.json`)

| Field | Type | Description |
|-------|------|-------------|
| name | string | Full project name |
| facility | string | VA Medical Center name |
| phase | string | Current project phase |
| focusBuilding | string | PoC focus building ID |
| lastUpdated | date | Last data refresh |

### Building (`buildings.json`)

| Field | Type | Description |
|-------|------|-------------|
| id | string | Building identifier (e.g. `"500"`) |
| name | string | Display name |
| description | string | Optional notes |
| expectedAssets | number | Total expected from AssetWorx |
| foundAssets | number | Assets located during inventory |
| taggedAssets | number | Assets with RFID tags applied |
| status | status | Aggregate QC status |

### Floor (`floors.json`)

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique floor ID (e.g. `"500-2"`) |
| buildingId | string | Parent building |
| name | string | Display name (e.g. `"2nd Floor"`) |
| level | number | Numeric level (0 = basement) |
| expectedAssets | number | Expected asset count |
| foundAssets | number | Found asset count |
| taggedAssets | number | Tagged asset count |
| status | status | Aggregate QC status |

### Section (`sections.json`)

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique section ID |
| floorId | string | Parent floor |
| buildingId | string | Parent building |
| name | string | Department/section name |
| expectedAssets | number | Expected from AssetWorx export |
| foundAssets | number | Located during field work |
| taggedAssets | number | RFID tagged |
| completionPct | number | Section inventory completion (0–100) |
| assetCompletionPct | number | Asset tagging completion (0–100) |
| status | status | QC status from field maps |
| notes | string | Crew notes, access issues |
| lastUpdate | date | Last field update |

## QC Status Values

| Key | Label | Symbol | Use |
|-----|-------|--------|-----|
| `completed` | Completed | 🟢 | Section fully inventoried and tagged |
| `return_needed` | Return Needed | 🟡 | Crew must return to finish |
| `no_access` | No Access | 🔴 | Area was inaccessible |
| `not_started` | Not Started | ⚪ | Work not yet begun |
| `in_progress` | In Progress | 🔵 | Active work (aggregate levels) |

## AssetWorx Import

Asset counts are sourced from AssetWorx inventory exports. Expected workflow:

1. Export inventory data from AssetWorx (CSV/Excel)
2. Map export columns to QCOD section IDs
3. Update `foundAssets` and `taggedAssets` per section
4. Recalculate completion percentages
5. Refresh dashboard (Excel regenerate or web reload)

See `data/templates/assetworx_import_template.csv` for the expected import format.

## Calculated Metrics

```
foundPct       = foundAssets / expectedAssets × 100
taggedPct      = taggedAssets / expectedAssets × 100
sectionAvg     = average(completionPct) for sections on a floor
buildingTotal  = sum(expectedAssets) across all floors
```

Room-level tracking is intentionally blank in the PoC until official floor plan PDFs are available.
