# QCOD Sample Data Guide

This folder intentionally contains **no real VA data**. It exists to show
Jon's team the file formats QCOD expects, using obviously synthetic values.

## Supported import formats

### AssetWorx / ENEX inventory export
Required headers: `Name`, `Serial Number`, `Description`, `Location Name`,
`CMR`, `Last Inventoried`, `Last Observed Time`, `Disposal Status`.

Asset numbers must follow the `613 EE#####` pattern to be treated as valid;
`613 E####` (missing the second E) is a known scanner misread and is
excluded from import automatically.

### Master Asset List
Required headers: `Asset Number`, `Description`, `Serial Number`,
`Manufacturer`, `Model`, `Building`, `Room`, `Department`.

### Configuration imports (Facility / Building / Floor / Section / Room)
See `data/templates/*.csv` in the repository root for the exact header
row each one expects.

## How to create a sanitized test file

1. Start from the relevant template in `data/templates/`.
2. Replace every real asset number with a clearly fake one, e.g.
   `TEST EE00001`, `TEST EE00002`.
3. Replace every real room/description with an obviously fake label, e.g.
   `SAMPLE ROOM 101`, `Sample Equipment`.
4. Never include a real serial number, real patient-adjacent department
   name change, or a real employee name.

## Fields that may contain sensitive information in a real export

- Serial numbers (can sometimes be traced to a specific purchase/contract)
- `Empl_ID` / `Last_Modified_By` (real employee identifiers)
- Any free-text `Notes` column, which historically may contain names

**Do not commit a real production AssetWorx, ENEX, or Master Asset List
export to this repository without explicit approval.** The `.gitignore`
already excludes `imports/` and `private-source-documents/` for this
reason — real files should stay local to your machine, not in Git.

## Example synthetic row (AssetWorx-style)

```
Name,Serial Number,Description,Location Name,CMR,Last Inventoried,Last Observed Time,Disposal Status
613 EE00001,SN-TEST-001,Sample Equipment,SAMPLE ROOM 101,CMR-TEST,2026-01-01,2026-01-01,Active
```
