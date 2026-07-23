# QCOD Handoff Notes

## Recipient

Jon Flowers and his development team, for integration into their
organization's application framework and eventual migration to a SQL
data layer.

## Recommended reading order

1. This file (`HANDOFF.md`)
2. `AI_MIGRATION_PROMPT.md` — copy this directly into your AI coding tool
   before starting migration work
3. `docs/BUSINESS_RULES.md` — the behavior that must survive migration
4. `docs/DATA_SOURCE_INVENTORY.md` — every real dataset, storage key, and
   known inconsistency
5. `docs/FIELD_MAPPING_REFERENCE.md` — field-by-field detail for the
   highest-priority datasets
6. `docs/SQL_MIGRATION_GUIDE.md` — a starting-point schema, not a mandate
7. `docs/IMPORT_WORKFLOWS.md` — every import type and its validation rules
8. `docs/FEATURE_WORKFLOW_REFERENCE.md` — every page, mapped to its data and known gaps
9. `docs/MIGRATION_ACCEPTANCE_CHECKLIST.md` — a checklist to verify against
10. `docs/TEST_BEHAVIOR_MAP.md` — index from QCOD's 202 tests to the
    behavior each one protects
11. `ARCHITECTURE.md` — code-level structure
12. `sample-data/README.md` — sanitized fixtures for testing your migration

## Project status

**QCOD is a working, tested proof of concept — not a finished product.**
It runs entirely client-side (React/Vite, no server, no database), and
that architecture is intentional for a proof of concept but is explicitly
NOT meant to survive migration as-is. See "Known limitations" below and
`ARCHITECTURE.md`'s "Recommendations for future SQL migration."

Honest completion estimate: roughly **90-95%** of what a receiving team
needs to evaluate and plan the migration. Core hierarchy, imports, QC/
Research, reporting, and backup are real and tested. Several Master Asset
List UI refinements (true pagination, column sorting, a detail panel) and
a couple of import-format edge cases (HTML-table `.xls` detection, a
second AssetWorx schema profile) are **not built** — see "Known
limitations."

## What is complete

- Full project hierarchy: Facility → Building → Floor → Section → Room,
  all validated (no room points at a missing parent; duplicate detection
  is scoped per facility+building+floor so the same room number in a
  different building is correctly allowed).
- **1,026 real Building 500 rooms**, extracted from actual architectural
  PDFs you provided, with real room names and square footage — not
  synthetic data. Every room currently has no section assigned, because
  no department maps were provided for cross-referencing; that's accurate
  reporting, not a bug — the app never guesses a room's section.
- AssetWorx/ENEX import pipeline: asset-number validation (`613 EE#####`
  valid, `613 E####` scanner misread — excluded entirely, never becomes a
  Research item), location-code parsing and resolution (never guesses a
  floor when multiple rooms could match), automatic QC/Research record
  generation from explicit conditions only.
- Master Asset List: import + comparison against scanned inventory (found
  in scan, serial match, QC/Research status).
- QC and Research work queues with statuses, priorities, bulk actions,
  immutable history.
- Configurable, deterministic QC sampling.
- Data Quality validation logic (orphan detection, hierarchy integrity,
  conflicting aliases/rules) — surfaced via reports, not a dedicated queue.
- Import history, audit log, pre-import backup + undo for the most recent
  import.
- Full backup/restore (JSON, versioned, schema-validated, excludes source
  documents/binary data/absolute paths).
- Excel and PDF export for every retained report; PDF truncates large
  reports with a visible warning and directs to Excel.
- 197 automated tests (Vitest), all passing.

## What is intentionally prototype-only

- **No authentication.** Anyone with the app open has full access.
- **No server-side validation.** All validation is client-side JS.
- **Single-browser data.** Nothing syncs between users or devices —
  `localStorage` only.
- **No true pagination/sorting/detail panel** in Master Asset List yet —
  it currently shows the first ~150 filtered rows.
- **Two AssetWorx import profiles already exist** ("AssetWorx Inventory,"
  a simpler schema with no location resolution, and "AssetWorx ENEX
  Import," which adds location parsing) — a correction to an earlier
  version of this document, which incorrectly said only one profile
  existed. Neither profile currently auto-detects which schema a given
  file matches; the user picks the import type manually.
- **No HTML-table `.xls` detection** — files are read as real Excel
  workbooks; a report that's actually an HTML table saved with an `.xls`
  extension will fail to parse.
- **QC and Research records share one storage key across two different
  field shapes** (manually-imported CSV rows vs. auto-generated records).
  This round added shape-agnostic read helpers
  (`web/src/lib/recordStatus.js`) so both display correctly, but the
  underlying dual-shape storage itself was not unified — see
  `docs/DATA_SOURCE_INVENTORY.md`. The SQL migration should pick one shape.
- **Several backend features are built and tested but have no UI**: audit
  log viewing, import undo, QC sampling configuration, and the
  failed-QC-to-Research handoff. See `docs/FEATURE_WORKFLOW_REFERENCE.md`'s
  "Not yet built" section for the complete list.

## How to run the app

```bash
npm run install:all
npm run dev
```

## How to test the app

```bash
npm test --prefix web
```

## How to build the app

```bash
npm run build:web
```

Output: `web/dist/` (static files, deployable to any static host once a
real backend exists to replace the `localStorage` layer).

## Where data is stored

Entirely in the browser's `localStorage`, under keys prefixed `qcod-`. See
`ARCHITECTURE.md` for the full key list and what each holds. Bundled
`data/*.json` files are only the first-run defaults.

## Sample import workflow

1. **Assets → Imports** → pick "AssetWorx ENEX Import" → select a file →
   review the preview (counts of valid/excluded/matched/unresolved) →
   click Apply. QC/Research records generate automatically from any real
   issues found.
2. **Assets → Master Asset List** → import the VA's official reference
   file → the app compares it against whatever's already imported.
3. **Reports** → pick any retained report → filter → Export Excel or PDF.

## Important business rules

- **AssetWorx owns asset location assignment. QCOD does not.** QCOD only
  imports AssetWorx's own export and compares/reports on it.
- A `613 E` (missing second E) asset number is a known scanner misread —
  excluded from import entirely, never a Research item.
- An ENEX location code that could match more than one room (because the
  floor isn't embedded in the code) is left unresolved. It only resolves
  automatically via an exact human-approved alias or parser rule.
- A room's `sectionId` is either verified (from an approved source) or
  blank ("Section Pending") — never inferred from name or number alone.

## Known limitations

See "What is intentionally prototype-only" above, plus:
- Bundle size is large (~1.5MB minified) — not code-split.
- No accessibility audit was performed against WCAG criteria; only
  targeted fixes were made where specifically identified.
- No responsive-breakpoint testing was performed at 320/375/768/1024/1280px.
- No automated browser/UI interaction tests — Vitest tests cover logic
  modules, not rendered component behavior.

## Migration priorities (recommended order)

1. SQL data layer (see `ARCHITECTURE.md` for a suggested entity mapping)
2. Authentication
3. Role-based authorization
4. Server-side import processing
5. Central file storage (replacing local `localStorage`)
6. Audit logging (server-side, replacing the client-side audit log)
7. API layer
8. Production hosting
9. Automated deployment
10. Production security review

## Privacy notes

No secrets, API keys, tokens, or `.env` files exist in this repository.
No real production asset/QC/Research data is bundled — `data/assets.json`
is an empty array. `data/rooms.json` contains real Building 500 room
numbers/names/square footage extracted from architectural drawings, which
is facility layout information, not personal or patient data. Private
source documents (architectural PDFs, department maps) are excluded from
Git entirely via `.gitignore` and were never included in any handoff
package.
