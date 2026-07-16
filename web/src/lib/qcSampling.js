/**
 * Configurable QC sampling. Deterministic: the same importId + settings
 * always produces the same sample, via a seeded PRNG (never Math.random,
 * which would make results unreproducible).
 */

// Small deterministic string hash -> 32-bit seed.
function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

// mulberry32 — small, fast, deterministic PRNG given a numeric seed.
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inScope(asset, scope, scopeValue) {
  if (!scope || scope === 'entire_import') return true;
  if (scope === 'facility') return asset.facilityId === scopeValue;
  if (scope === 'building') return asset.buildingId === scopeValue;
  if (scope === 'floor') return asset.floorId === scopeValue;
  if (scope === 'section') return asset.sectionId === scopeValue;
  if (scope === 'day') return (asset.lastInventoried || '').slice(0, 10) === scopeValue;
  return true;
}

/**
 * @param {Array} assets - already-valid assets (scanner misreads/blanks must
 *   be filtered out by the caller before this is called — this function
 *   never re-derives validity, it only samples from what it's given).
 * @param {object} options - { importId, percentage, scope, scopeValue,
 *   excludeWithResearchIssues, researchAssetNumbers }
 */
export function sampleAssets(assets, options) {
  const {
    importId, percentage = 10, scope = 'entire_import', scopeValue = '',
    excludeWithResearchIssues = false, researchAssetNumbers = new Set(),
  } = options;

  const clampedPct = Math.max(1, Math.min(100, percentage));

  const scoped = assets.filter((a) => inScope(a, scope, scopeValue));
  const eligible = excludeWithResearchIssues
    ? scoped.filter((a) => !researchAssetNumbers.has(a.assetNumber))
    : scoped;
  const excludedCount = scoped.length - eligible.length;

  const requestedCount = Math.round((eligible.length * clampedPct) / 100);

  // Stable order first (so the same input always produces the same
  // candidate order regardless of array insertion order), THEN a seeded
  // deterministic shuffle keyed to importId + settings.
  const sorted = [...eligible].sort((a, b) => (a.assetNumber ?? '').localeCompare(b.assetNumber ?? ''));
  const seed = hashSeed(`${importId}|${clampedPct}|${scope}|${scopeValue}|${excludeWithResearchIssues}`);
  const rand = mulberry32(seed);

  // Fisher-Yates using the seeded PRNG — fully deterministic for identical inputs.
  const shuffled = [...sorted];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const selected = shuffled.slice(0, requestedCount);

  return {
    eligibleCount: eligible.length,
    requestedPercentage: clampedPct,
    requestedCount,
    actualSelectedCount: selected.length,
    excludedCount,
    selected,
  };
}
