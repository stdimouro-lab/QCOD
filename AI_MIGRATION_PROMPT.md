# AI Migration Prompt for QCOD → [Receiving Framework]

Copy this prompt to your AI development tool when beginning the migration.

---

You are migrating an existing working proof-of-concept application called
QCOD (Quality Control Operations Dashboard) into our organization's
application framework, replacing its JSON-file/browser-localStorage
persistence with our SQL database.

**Do not assume QCOD's current React components, JSON structures,
localStorage helpers, or CSS must be copied directly. Treat them as a
working reference for behavior, data relationships, workflow, and
presentation — not as code to port verbatim.**

Before writing any code:

1. Inspect the complete QCOD repository — read `HANDOFF.md`, `README.md`,
   `docs/BUSINESS_RULES.md`, `docs/DATA_SOURCE_INVENTORY.md`,
   `docs/FIELD_MAPPING_REFERENCE.md`, `docs/SQL_MIGRATION_GUIDE.md`,
   `docs/IMPORT_WORKFLOWS.md`, `docs/FEATURE_WORKFLOW_REFERENCE.md`,
   `ARCHITECTURE.md`, and the test suite in `web/src/lib/__tests__/`
   before touching source code.
2. Inspect our receiving framework's existing conventions (routing,
   service layer, database access, authentication, file upload handling,
   reporting) before deciding how QCOD's behavior maps onto it.
3. Identify equivalent patterns already in our framework for: frontend
   pages/components, backend services, database access, authentication,
   report generation, and file import — reuse those patterns rather than
   introducing QCOD's specific implementation choices.
4. Preserve business behavior, not implementation. If our framework's
   conventions differ from QCOD's (naming, folder structure, state
   management), follow our conventions — the tests and business-rule docs
   describe the behavior that must survive, not the code that must survive.
5. Replace every JSON-file default and every `localStorage` read/write
   with a service layer backed by our database. `web/src/lib/data.js` is
   the single current data-access module — its exported function list is
   your interface contract to reproduce.
6. Design SQL tables using `docs/SQL_MIGRATION_GUIDE.md` as a starting
   point, adapted to our schema conventions. Do not treat it as mandatory
   as written.
7. Preserve QCOD's current record IDs where they are stable and
   meaningful (e.g. room IDs already follow `{building}-{floor}-
   {normalizedRoomNumber}`) or produce a documented ID mapping table if you
   must regenerate IDs.
8. Migrate every import type through: create an import batch record, stage
   and validate rows, preserve the original row values for every rejected
   row, write valid rows inside a single transaction, record rejected rows
   separately, commit only when no fatal validation errors exist, and
   produce a machine-readable import summary. See `docs/IMPORT_WORKFLOWS.md`.
9. Preserve rejected-row detail and audit/import history — do not silently
   drop a row that QCOD would have reported as valid, rejected, or a
   warning.
10. Preserve hierarchy validation exactly: a room/floor/section can never
    reference a parent from a different branch of the hierarchy; an
    unresolved parent is reported, never guessed.
11. Preserve the asset-number rule exactly: `613 EE#####` is valid, `613
    E####` (missing the second E) is a scanner misread excluded from
    import and never converted into a Research record.
12. Preserve location-resolution behavior exactly: an ENEX location code
    resolves automatically only via an exact approved alias or an approved
    parser rule; anything else (including a "unique match" that a human
    hasn't approved) stays unresolved. Never infer a floor.
13. Preserve QC workflow behavior: dual-shape status reading is a known
    QCOD quirk (see `docs/DATA_SOURCE_INVENTORY.md`'s "Known
    Inconsistencies") — your SQL schema should use ONE status field/enum,
    not replicate the dual shape; just make sure every current QC record
    type still maps to a valid status.
14. Preserve Research workflow behavior, including the "reopened" record
    behavior (a new record when a resolved/closed issue recurs, old record
    left untouched).
15. Preserve every retained report's output columns and filter behavior —
    see `docs/FEATURE_WORKFLOW_REFERENCE.md` and the `REPORTS` array in
    `web/src/components/ReportCenter.jsx` for the authoritative current list.
16. Preserve Excel export (complete dataset, never truncated) and PDF
    export (truncates large reports with a visible warning) behavior.
17. Add automated tests for the migrated behavior. QCOD's own 202 Vitest
    tests in `web/src/lib/__tests__/` describe the specific behaviors that
    must still hold true — port the *assertions*, not necessarily the test
    framework, and use `docs/TEST_BEHAVIOR_MAP.md` as an index.
18. After migrating each vertical slice (e.g. "Room Configuration import"),
    compare its behavior against running QCOD locally with the same
    synthetic input from `sample-data/`, and report any difference you
    cannot resolve — do not silently accept a behavioral gap.
19. Never invent a business rule QCOD doesn't actually implement. If
    something in this prompt or the docs seems to imply behavior that
    isn't backed by code or a passing test, flag it rather than build it.
20. Never silently drop data that QCOD currently preserves (rejected rows,
    original scanned values, audit history, historical status changes) —
    if the target schema genuinely can't represent something, document
    that gap explicitly rather than dropping it quietly.

**Produce a written migration plan (proposed schema, service boundaries,
and a phased sequence) before implementing.** Once the plan is written, you
do not need to request approval again before each subsequent step — proceed
through implementation, and only stop to ask if you hit a genuine
ambiguity that the QCOD documentation and tests don't resolve.

At the end of each phase, report: what was migrated, what tests pass, what
behavior could not be reproduced and why, and what remains for the next
phase.
