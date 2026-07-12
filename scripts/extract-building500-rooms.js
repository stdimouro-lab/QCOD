/**
 * Extracts Building 500 room candidates from architectural PDFs.
 *
 * Usage (single file):
 *   npm run extract:rooms -- "C:\dev\qcod\private-source-documents\martinsburg-va-medical-center\building-500\architecture\500-1st Floor Arch.pdf" 500-1
 *
 * Usage (batch — processes every recognized filename in the architecture folder):
 *   npm run extract:rooms -- --batch
 *
 * Reads embedded PDF text only (via pdf-parse) — does not run OCR. If a PDF
 * has no usable embedded text layer, it will simply produce zero candidates
 * for that file; this script does not silently invent room data to fill
 * the gap.
 *
 * Writes to data/generated/building500-room-candidates.json.
 * Never writes to data/rooms.json directly.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';
import { PDFParse } from 'pdf-parse';
import { extractRoomCandidatesFromText, dedupeAcrossPages } from './lib/roomExtractionParser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const archDir = join(rootDir, 'private-source-documents', 'martinsburg-va-medical-center', 'building-500', 'architecture');
const outputDir = join(rootDir, 'data', 'generated');
const outputPath = join(outputDir, 'building500-room-candidates.json');

// Building 500 filename -> floor ID, per the spec's expected naming pattern.
const FILENAME_FLOOR_MAP = [
  [/basement/i, '500-B'],
  [/1st\s*floor/i, '500-1'],
  [/2nd\s*floor/i, '500-2'],
  [/3rd\s*floor/i, '500-3'],
  [/4th\s*floor/i, '500-4'],
  [/5th\s*floor/i, '500-5'],
  [/6th\s*floor/i, '500-6'],
];

function floorIdFromFilename(filename) {
  const match = FILENAME_FLOOR_MAP.find(([re]) => re.test(filename));
  return match ? match[1] : null;
}

async function extractFromPdfFile(pdfPath, floorId) {
  const buffer = readFileSync(pdfPath);
  const sourceDocument = basename(pdfPath);

  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();

  // result.pages is an array of { num, text } — one entry per PDF page.
  // If the PDF has no usable embedded text layer, pages will be empty or
  // blank; this script does not fall back to OCR or invented data.
  const pages = result.pages && result.pages.length > 0 ? result.pages : [{ num: 1, text: result.text }];

  let allCandidates = [];
  let allRejected = [];
  let totalMatches = 0;

  pages.forEach((page) => {
    const { candidates, rejected, stats } = extractRoomCandidatesFromText(page.text, floorId, sourceDocument, page.num);
    allCandidates = allCandidates.concat(candidates);
    allRejected = allRejected.concat(rejected);
    totalMatches += stats.totalTextCandidates;
  });

  const { unique, duplicates } = dedupeAcrossPages(allCandidates);

  return {
    floorId,
    sourceDocument,
    totalTextCandidates: totalMatches,
    validCandidates: unique,
    duplicateCandidates: duplicates,
    rejectedLabels: allRejected,
    missingNames: unique.filter((c) => !c.roomName),
  };
}

function printFloorSummary(result) {
  console.log(`\nFloor ${result.floorId} (${result.sourceDocument})`);
  console.log(`  Total text candidates found: ${result.totalTextCandidates}`);
  console.log(`  Valid room candidates:       ${result.validCandidates.length}`);
  console.log(`  Duplicate room numbers:      ${result.duplicateCandidates.length}`);
  console.log(`  Rejected labels:             ${result.rejectedLabels.length}`);
  console.log(`  Rooms missing names:         ${result.missingNames.length}`);
}

function writeOutput(allResults) {
  mkdirSync(outputDir, { recursive: true });
  const allCandidates = allResults.flatMap((r) => r.validCandidates);
  writeFileSync(outputPath, JSON.stringify(allCandidates, null, 2) + '\n');
  console.log(`\nOutput written to: ${outputPath}`);
  console.log(`Total candidates across all floors processed: ${allCandidates.length}`);
  console.log('\ndata/rooms.json was NOT modified. Review candidates, then run scripts/review-room-candidates.js next.');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--batch')) {
    if (!existsSync(archDir)) {
      console.error(`Architecture folder not found: ${archDir}`);
      console.error('Create it and copy your Building 500 architectural PDFs there first.');
      process.exit(1);
    }
    const files = readdirSync(archDir).filter((f) => f.toLowerCase().endsWith('.pdf'));
    if (files.length === 0) {
      console.error(`No PDF files found in ${archDir}`);
      process.exit(1);
    }

    const results = [];
    for (const file of files) {
      const floorId = floorIdFromFilename(file);
      if (!floorId) {
        console.log(`\nSkipping "${file}" — filename does not match a recognized Building 500 floor pattern.`);
        continue;
      }
      const result = await extractFromPdfFile(join(archDir, file), floorId);
      printFloorSummary(result);
      results.push(result);
    }
    writeOutput(results);
    return;
  }

  const [pdfPath, floorId] = args;
  if (!pdfPath || !floorId) {
    console.error('Usage:');
    console.error('  npm run extract:rooms -- "C:\\path\\to\\500-1st Floor Arch.pdf" 500-1');
    console.error('  npm run extract:rooms -- --batch');
    process.exit(1);
  }
  if (!existsSync(pdfPath)) {
    console.error(`File not found: ${pdfPath}`);
    process.exit(1);
  }

  const result = await extractFromPdfFile(pdfPath, floorId);
  printFloorSummary(result);
  writeOutput([result]);
}

main().catch((err) => {
  console.error('Extraction failed:', err.message);
  process.exit(1);
});
