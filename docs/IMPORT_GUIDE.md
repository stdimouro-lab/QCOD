# QCOD Import Guide

QCOD is updated from two command-line import scripts. Both are safe to re-run —
neither one invents data, and the section importer keeps a backup before it
writes anything.

## 1. Importing AssetWorx data

```
npm run import:assets -- "C:\path\to\ASSETS HOME COPY.xlsx"
```

Reads the first worksheet of an AssetWorx export and writes the normalized
result to `data/assets.json`. Matches these columns (case-insensitive):
`Name`, `Serial Number`, `Description`, `Location Name`, `CMR`,
`Last Inventoried`, `Last Observed Time`, `Disposal Status`.

Blank rows are skipped. Unknown/blank cell values are preserved as blank —
never guessed. `data/import-status.json` is updated with the import
timestamp and asset count.

**Asset-number rule:** a valid asset number begins with `613 EE` (e.g.
`613 EE12345`). A number that begins with `613 E` but is *missing* the
second `E` is a known RFID scanner misread, not a real record — those rows
are excluded from the import entirely and are never treated as Research
items.

Records still get imported even when AssetWorx marked them **Not Found in
DB**, **New Asset Found**, or **Offline Sync** — they're kept, but flagged
with an `issueType` (and full `issueTypes` array) so the dashboard can
surface them rather than hide them.

## 2. Importing section progress

```
npm run import:sections -- "C:\path\to\section-progress.xlsx"
```

Accepts `.csv` or `.xlsx`. Supported columns: `Building`, `Floor`, `Section`,
`Status`, `Completion Percent`, `Expected Assets`, `Found Assets`,
`Tagged Assets`, `Last Updated`, `Notes`. A blank template with real section
names is at `data/templates/section_progress_template.csv`.

**This script only updates sections that already exist in
`data/sections.json`.** It matches each row by Building + Floor + Section
name (case-insensitive, whitespace-trimmed) and never creates a new section.
If a row doesn't match anything, it's skipped and printed as an unmatched
row rather than silently dropped.

Blank cells in a matched row leave the existing value untouched — importing
a file with an empty `Notes` column will not erase notes you already have.
`assetCompletionPct` is recalculated automatically as
`taggedAssets / expectedAssets` whenever `expectedAssets` is greater than
zero; otherwise it stays `0`.

### Valid status values

| Internal value  | Friendly labels accepted in your spreadsheet |
|---|---|
| `completed`      | Completed |
| `return_needed`  | Return Needed, Scanned - Return Needed |
| `no_access`      | No Access |
| `not_started`    | Not Started |
| `in_progress`    | In Progress |

Anything else is reported as an invalid status and that row is skipped —
it will never silently fall back to a guessed status.

### Backups

Before writing any changes, the script copies the current
`data/sections.json` to `data/backups/sections-YYYYMMDD-HHMMSS.json`. If you
ever need to undo an import, copy the relevant backup file back over
`data/sections.json`.

## 3. Files each importer touches

| Script | Reads | Writes |
|---|---|---|
| `import:assets` | your AssetWorx Excel file | `data/assets.json`, `data/import-status.json` |
| `import:sections` | your CSV/Excel section file | `data/sections.json` (with a backup first), `data/import-status.json` |

Neither script touches `data/buildings.json`, `data/floors.json`,
`data/facilities.json`, or anything under `web/`.

## 4. QC and Research — placeholders only

`data/templates/qc_import_template.csv` and
`data/templates/research_import_template.csv` define the column layout QCOD
will eventually expect for those workflows. There is no importer for them
yet and no QC/Research navigation in the app — these templates just reserve
the format so real data can be dropped in later without a rework.

## 5. After you import

Imports only touch the JSON files on disk — the running dev server or a
built app won't pick up the change automatically.

```
npm run dev        # restart if it was already running
npm run build:web  # rebuild before deploying
```
