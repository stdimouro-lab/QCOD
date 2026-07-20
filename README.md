# QCOD — Quality Control Operations Dashboard

**Version 10 — Pre-Handoff Proof of Concept**

## Purpose

QCOD tracks RFID inventory tagging and quality-control progress at
Martinsburg VA Medical Center (and, as of V10, is generalized to support
multiple VA facilities). It gives a facilities/logistics team a project-
management view of a campus-wide asset inventory effort: which buildings,
floors, and sections are done, which rooms still need attention, which
scanned assets have data-quality problems, and which items need manual
research or QC follow-up.

## Business context — what AssetWorx handles vs. what QCOD handles

**AssetWorx** is the VA's system of record for asset tracking. It owns:
- The official location/room assignment for every tagged asset.
- RFID tag writing and scanning.
- The canonical ENEX/ENNX inventory export.

**QCOD does not duplicate any of that.** QCOD is a project-tracking and
data-quality layer on top of AssetWorx's output. It:
- Imports AssetWorx's ENEX/ENNX export and the VA's official Master Asset
  List, and compares them (found vs. missing, serial match, etc.).
- Tracks project-level progress (building -> floor -> section -> room
  completion) that AssetWorx itself doesn't represent.
- Surfaces data-quality problems (missing serials, duplicate numbers,
  unmatched locations) for a human to send to Research or QC.
- Never assigns a room to an asset -- that's AssetWorx's job. If an ENEX
  location code doesn't cleanly resolve to exactly one room, QCOD leaves it
  unresolved rather than guessing.

## Technology stack

- **Frontend:** React 19 + Vite, plain CSS (no component library)
- **Data layer:** JSON files (bundled defaults) + browser `localStorage`
  (live/imported data) -- see `ARCHITECTURE.md` for the full data-access
  pattern. **No server, no database, no network calls for app data.**
- **Testing:** Vitest + jsdom
- **Excel/PDF:** `xlsx` and `jspdf`/`jspdf-autotable`, both run client-side
- **CLI scripts:** Node.js (asset/section CSV imports, Building 500 room
  extraction from architectural PDFs via `pdf-parse`)

## Folder structure

```
qcod/
├── data/                  Bundled default JSON (facilities, buildings, floors,
│                          sections, rooms, assets, statuses, templates)
│   ├── templates/         CSV import templates
│   ├── private/           Local-only operational config (gitignored)
│   ├── generated/         Local-only script output (gitignored)
│   └── backups/           Local-only backup snapshots (gitignored)
├── scripts/               Node CLI: CSV imports, Building 500 PDF room extraction
├── web/                   The React/Vite application
│   └── src/
│       ├── App.jsx        Navigation + top-level layout
│       ├── components/    One file per page/panel
│       └── lib/           Pure logic: data access, parsers, calculations
│           └── __tests__/ Vitest suite
├── private-source-documents/   Local-only architectural PDFs (gitignored)
├── imports/                    Local-only real import files (gitignored)
├── docs/                       IMPORT_GUIDE.md, V9_CHANGELOG.md, this file's neighbors
├── ARCHITECTURE.md
├── VERSION.txt
└── REMOVED_FILES.txt
```

## Installation

```bash
npm run install:all
```

(equivalent to `npm install` at the root, then `npm install --prefix web`)

## Development

```bash
npm run dev
```

Starts the Vite dev server (default port 5174) from the root script, which
delegates to `web/`.

## Tests

```bash
npm test --prefix web
```

## Build

```bash
npm run build:web
```

Outputs a static production build to `web/dist/`.

## Supported imports

All imports run through **Assets → Imports** and require a preview before
anything is applied -- no import silently writes data.

| Import | What it does |
|---|---|
| AssetWorx / ENEX inventory | Parses asset rows, classifies `613 EE#####` as valid and `613 E####` (missing the second E) as a scanner misread -- misreads are excluded entirely, never treated as Research items |
| Master Asset List | The VA's official reference asset file (Excel/CSV) -- QCOD's comparison dataset, not a mapping tool |
| Section / Configuration imports | Facility, Building, Floor, Section, Room CSV/Excel imports, each validated against real parent records -- a row with a broken hierarchy is skipped, never guessed |

## Master Asset List workflow

Import the VA's official asset file once (or refresh periodically). QCOD
compares every master record against its own scanned inventory and shows,
per asset: found in scan (yes/no), serial number match, current QC status,
current Research status, and when it was last imported. This is read-only
comparison -- nothing here reassigns a room.

## ENNX / ENEX import workflow

See `docs/IMPORT_GUIDE.md` for the full column mapping and the asset-number
validation rule. In short: AssetWorx location codes (e.g. `SPGD111-500`) are
parsed into department prefix / zone letter / room digits / building, then
matched against QCOD's own room list. If more than one room could match
(the floor genuinely can't be determined from the code alone), the location
is left unresolved rather than guessed -- an exact approved alias or
parser rule is the only way an ambiguous location resolves automatically,
and both require an explicit one-time human decision to create.

## QC workflow

QC tracks quality-control sampling and review of the scanned inventory --
pass/fail, verification notes, resolution -- separate from AssetWorx's own
tagging process. See `web/src/lib/qcSampling.js` for the configurable,
deterministic sampling logic (same import + settings always produces the
same sample).

## Research workflow

Research tracks assets that need investigation: missing data, unmatched
locations, conflicting records. It is a work queue, not a room-assignment
tool -- see `web/src/lib/researchQcWorkflow.js`.

## Backup and restore

**Assets → Imports → Export All Local Data** produces a single JSON file
containing every QCOD dataset (see `ARCHITECTURE.md` for the full field
list). Restoring validates the file's shape before writing anything, and
takes an automatic snapshot of the current state first. Backups never
include uploaded file contents, absolute file paths, or credentials.

## Export features

Every report supports Excel (complete data, no truncation) and PDF (large
reports are truncated with a clear warning directing the user to Excel).

## Current architecture: JSON + localStorage

There is no server and no database. All "live" data -- imports, QC/Research
records, backups -- lives in the browser's `localStorage` on the machine
running QCOD. Bundled JSON in `data/` is only the initial/fallback state.
See `ARCHITECTURE.md` for exactly which `localStorage` keys exist and what
each holds.

## Current limitations

- Single-browser, single-machine data -- nothing syncs between users.
- No authentication -- anyone with the app open has full access.
- No server-side validation -- all validation is client-side JavaScript.
- Large master-asset-list tables are not virtualized; very large imports
  (tens of thousands of rows) may be slow to render in the browser table,
  though Excel export itself has no row limit.
- No automated browser/UI test coverage (Vitest tests cover logic modules,
  not rendered component behavior).

## Future migration

This proof of concept is scoped for handoff to a receiving development
team who will integrate it into their own framework and replace the
JSON/localStorage layer with SQL. See `ARCHITECTURE.md`'s "Recommendations
for future SQL migration" section for a suggested schema starting point
and the assumptions baked into the current data model.
