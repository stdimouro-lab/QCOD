# QCOD Handoff Manifest

Every top-level file/folder in this package, what it is, and whether it's
new this round or unchanged from an earlier handoff.

| Path | What it is | Status |
|---|---|---|
| `AI_MIGRATION_PROMPT.md` | Copy-paste prompt for an AI coding tool starting the migration | New this round |
| `HANDOFF.md` | Top-level handoff summary, recommended reading order, known limitations | Updated this round |
| `HANDOFF_MANIFEST.md` | This file | New this round |
| `README.md` | Project overview, tech stack, how to run/test/build | Existing, unchanged this round |
| `ARCHITECTURE.md` | Code-level structure, data flow, localStorage key reference | Existing, minor prior-round updates |
| `VERSION.txt` | Version label + backup schema version | Existing, unchanged this round |
| `REMOVED_FILES.txt` | Plain-text record of every intentionally removed file/feature and why | Existing, updated across multiple rounds |
| `.gitignore` | Excludes local-only/private data from version control | Existing |
| `package.json`, `package-lock.json` | Root Node scripts (CLI imports, room extraction) | Existing |
| `docs/BUSINESS_RULES.md` | Every implemented, tested business rule | New this round |
| `docs/DATA_SOURCE_INVENTORY.md` | Every dataset, storage key, and known inconsistency | New this round |
| `docs/FIELD_MAPPING_REFERENCE.md` | Field-by-field detail for the highest-priority datasets | New this round |
| `docs/SQL_MIGRATION_GUIDE.md` | Starting-point schema for the SQL migration | New this round |
| `docs/IMPORT_WORKFLOWS.md` | Every import type, validation rules, recommended transaction pattern | New this round |
| `docs/FEATURE_WORKFLOW_REFERENCE.md` | Every page mapped to its data, actions, and known gaps | New this round |
| `docs/MIGRATION_ACCEPTANCE_CHECKLIST.md` | Checklist to verify the migration against | New this round |
| `docs/TEST_BEHAVIOR_MAP.md` | Index from all 202 current tests to the behavior each protects | New this round |
| `docs/schemas/room.schema.json` | JSON Schema for the Room record | New this round |
| `docs/schemas/master-asset.schema.json` | JSON Schema for the Master Asset record | New this round |
| `docs/schemas/inventory-record.schema.json` | JSON Schema for the scanned/imported Asset record | New this round |
| `docs/DATA_MODEL.md` | Earlier-round data model notes | Existing, superseded in detail by `DATA_SOURCE_INVENTORY.md` and `FIELD_MAPPING_REFERENCE.md` — kept for history, not the primary reference going forward |
| `docs/IMPORT_GUIDE.md` | Earlier-round CLI import guide (facility/section/room CSV scripts) | Existing, still accurate for the CLI scripts in `scripts/` |
| `docs/V9_CHANGELOG.md` | Historical changelog from an earlier round | Existing, historical record only |
| `sample-data/README.md` | Explains the sanitized fixture files | Updated this round |
| `sample-data/sample_room_configuration.csv` | Synthetic Room Configuration import fixture | New this round, verified against real validation logic |
| `sample-data/sample_enex_import.csv` | Synthetic ENEX import fixture (valid/missing-serial/scanner-misread/not-found rows) | New this round, verified against real `classifyAssetNumber()`/`parseEnexLocation()` |
| `sample-data/sample_master_asset_list.csv` | Synthetic Master Asset List fixture | New this round |
| `data/` | Bundled JSON defaults + CSV import templates | Existing; `data/rooms.json` contains 1,026 real Building 500 rooms extracted from actual architectural PDFs |
| `scripts/` | Node CLI: CSV imports, architectural-PDF room extraction | Existing |
| `web/` | The React/Vite application, including all source and the Vitest test suite | Existing, modified this round (see `REMOVED_FILES.txt` for specifics) |

## Not included in this package (by design)

- `node_modules/`, `web/dist/` — regenerate via `npm run install:all` and `npm run build:web`
- `.git/` — this is a file export, not a git clone
- `private-source-documents/`, `imports/`, `data/generated/`,
  `data/backups/`, `data/private/`, `reports/generated/` — all gitignored,
  local-only operational data that was never meant to leave the original
  development machine
