# QCOD Test Behavior Map

19 test files, 202 tests, all passing at handoff. Each file protects
specific business behavior — this is the index for the migration team.

| Test file | Behavior protected | Related page | Related business rule |
|---|---|---|---|
| `pct.test.js` | Percentage math never returns NaN/Infinity; null means Pending | All progress displays | "Never claim a verified zero when unknown" |
| `assetClassification.test.js` | `613 EE` valid, `613 E` scanner misread excluded | Imports, Master Asset List | Asset-number rules |
| `sectionMatching.test.js` | Case-insensitive, punctuation-tolerant section name matching; never creates a new section | Section Progress import | Import rules |
| `configValidation.test.js` | Facility/Building/Floor/Section config import validation, duplicate rejection | Configuration imports | Hierarchy rules |
| `assetMapping.test.js` | Free-text Location Name → section mapping, manual/batch approval | Building/floor/section asset-progress rollup | Location rules (the free-text variant, distinct from ENEX) |
| `roomConfigImport.test.js` | Room import parent validation, duplicate detection scoped to facility+building+floor, merge preserves unrelated rooms | Room Configuration import | Hierarchy rules |
| `roomAssignmentData.test.js` | Room-derived section progress and hierarchy-completeness counting, based on `sectionId`+`status` only | Rooms page, Data Status | Hierarchy rules |
| `roomExtraction.test.js` | Real architectural-PDF text parsing: multi-line room labels, corridor/stair/elevator exclusion, tab-adjacent-line edge cases | (CLI extraction script, not a UI page) | Source-priority rules (never guess a room) |
| `enexLocationParser.test.js` | ENEX code parsing, alias/rule resolution order, never guesses a floor, cross-building rejection | ENEX import, Location Mapping (logic only, no page currently) | Location resolution rules |
| `enexImport.test.js` | Full ENEX pipeline: misread exclusion, duplicate detection, Research/QC generation, replace vs. merge import modes | Imports, QC, Research | Import + QC + Research rules |
| `locationAliasRules.test.js` | Duplicate alias rejection, parser-rule approval requires an explicit action | ENEX import | Location resolution rules |
| `masterAssetList.test.js` | Master list normalization, found/missing/serial-match comparison logic | Master Asset List | Master Asset List behavior |
| `reportSafety.test.js` | Large-report PDF truncation warning, filename sanitization | Reports | Reporting rules |
| `v9ImportSafety.test.js` | Pre-import backup snapshot, undo, audit log append, backup schema validation, V8→V9 backup migration | Imports, Backup/Restore | Import safety rules |
| `v9QcSamplingDataQuality.test.js` | Deterministic seeded QC sampling, Data Quality orphan/hierarchy-error detection | (Sampling has no UI yet; Data Quality checks feed reports) | QC sampling rules |
| `v9ResearchQcWorkflow.test.js` | Status transition validation, bulk updates, reopened-Research behavior, failed-QC-to-Research handoff, batch hierarchy validation | QC, Research | QC + Research rules |
| `v9HierarchyAndExcel.test.js` | Cross-building room validation, Excel export never truncates | Rooms, Reports | Hierarchy + reporting rules |
| `localStorage.test.js` | Save/load/clear localStorage, backup export/import round-trip, malformed-backup rejection | Backup/Restore | Backup rules |
| `recordStatusAndDates.test.js` | QC/Research status normalization across both field shapes, safe date parsing (ISO/US/timezone), inclusive date-range filtering | QC, Research | Status normalization + date rules (added this round after finding the dual-shape display bug) |

**Migration equivalent expectation**: every assertion in these files
should have a corresponding passing test against the migrated backend
before that vertical slice is considered complete — not just "the UI looks
right."
