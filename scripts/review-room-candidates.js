/**
 * Validates and normalizes the room candidates produced by
 * extract-building500-rooms.js. Reads:
 *   data/generated/building500-room-candidates.json
 * Writes:
 *   data/generated/building500-rooms-clean.json
 *   data/generated/building500-room-extraction-errors.json
 *
 * Usage:
 *   npm run review:rooms
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { reviewRoomCandidates } from './lib/roomCandidateReview.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const generatedDir = join(rootDir, 'data', 'generated');
const inputPath = join(generatedDir, 'building500-room-candidates.json');
const cleanPath = join(generatedDir, 'building500-rooms-clean.json');
const errorsPath = join(generatedDir, 'building500-room-extraction-errors.json');

function main() {
  if (!existsSync(inputPath)) {
    console.error(`Input not found: ${inputPath}`);
    console.error('Run npm run extract:rooms first.');
    process.exit(1);
  }

  const candidates = JSON.parse(readFileSync(inputPath, 'utf8'));
  const { clean, errors } = reviewRoomCandidates(candidates);

  mkdirSync(generatedDir, { recursive: true });
  writeFileSync(cleanPath, JSON.stringify(clean, null, 2) + '\n');
  writeFileSync(errorsPath, JSON.stringify(errors, null, 2) + '\n');

  const byFloor = {};
  clean.forEach((c) => { byFloor[c.floorId] = (byFloor[c.floorId] || 0) + 1; });

  console.log('Room candidate review complete.');
  console.log(`  Input candidates:    ${candidates.length}`);
  console.log(`  Clean candidates:    ${clean.length}`);
  console.log(`  Rejected/errors:     ${errors.length}`);
  console.log('  Clean candidates by floor:');
  Object.entries(byFloor).forEach(([floorId, count]) => console.log(`    ${floorId}: ${count}`));
  console.log(`\nClean output:  ${cleanPath}`);
  console.log(`Errors output: ${errorsPath}`);
  console.log('\ndata/rooms.json was NOT modified. Use the Room Assignment Review page to confirm assignments before applying.');
}

main();
