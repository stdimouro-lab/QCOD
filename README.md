# Quality Control Operations Dashboard (QCOD)

Operations dashboard for RFID inventory progress at **Martinsburg VA Medical Center**. QCOD complements AssetWorx by providing project management, visual progress tracking, and quality control reporting in one place.

**Proof of Concept scope:** Building 500

## What's Included

| Component | Description |
|-----------|-------------|
| `data/` | Shared JSON data — buildings, floors, sections, statuses |
| `scripts/` | Excel workbook generator |
| `web/` | React dashboard prototype |
| `docs/` | Data model documentation |
| `output/` | Generated Excel dashboard (after running script) |

## Quick Start

```bash
cd qcod
npm run install:all
```

### Web Dashboard

```bash
npm run dev
```

Open [http://localhost:5174](http://localhost:5174)

### Excel Dashboard

```bash
npm run generate:excel
```

Output: `output/QCOD_Building500_Dashboard.xlsx`

The workbook includes:
- **Dashboard** — executive summary, stats, floor progress
- **Buildings** — building-level asset counts
- **Floors** — floor-level progress
- **Sections** — department/section detail with QC status
- **Outstanding Work** — return needed and no access locations
- **AssetWorx Import** — paste area for inventory exports

## Updating Data

1. Edit JSON files in `data/` (or import from AssetWorx — see template in `data/templates/`)
2. Regenerate Excel: `npm run generate:excel`
3. Refresh the web dashboard (reads the same JSON files)

### QC Status Values

| Status | Symbol | Meaning |
|--------|--------|---------|
| Completed | 🟢 | Section fully inventoried |
| Return Needed | 🟡 | Crew must return |
| No Access | 🔴 | Area was inaccessible |
| Not Started | ⚪ | Work not yet begun |
| In Progress | 🔵 | Active work (aggregate) |

## Project Structure

```
qcod/
├── data/
│   ├── project.json          # Project metadata
│   ├── buildings.json        # Building-level data
│   ├── floors.json           # Floor-level data
│   ├── sections.json         # Section/department data
│   ├── statuses.json         # QC status definitions
│   └── templates/            # AssetWorx import templates
├── docs/
│   └── DATA_MODEL.md         # Full data model reference
├── scripts/
│   └── generate-excel.js     # Excel workbook generator
├── web/                      # React dashboard
└── output/                   # Generated Excel files
```

## Future Enhancements

- Room-level tracking (requires official floor plan PDFs)
- AssetWorx CSV import script
- Daily QC integration
- Asset lookup by RFID number
- Interactive building → floor → section → room maps

## Notes

- Room-level tracking is intentionally blank in this PoC
- Asset counts should be updated from AssetWorx inventory exports
- This dashboard does not replace AssetWorx — it provides a management and QC visibility layer on top
