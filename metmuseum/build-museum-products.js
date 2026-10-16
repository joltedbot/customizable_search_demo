#!/usr/bin/env node

/**
 * build-museum-products.js
 * Builds scripts/data/products-museum.json: 500 artworks for the unbranded
 * "Museum" DAM demo = the 30 seed items (ids 1-30, unchanged) + 470 Met
 * Museum public-domain highlight/timeline works (ids 31..500).
 *
 * Usage:
 *   node metmuseum/build-museum-products.js --dry-run     candidate counts only, no network
 *   node metmuseum/build-museum-products.js               full build (sequential Met API lookups, resumable)
 *
 * Flags (mainly for testing):
 *   --limit-per-category N   target new items per category (default: spread 470 across 7 categories)
 *   --out <path>             output file (default scripts/data/products-museum.json)
 *   --checkpoint <path>      checkpoint file (default metmuseum/.museum-checkpoint.json)
 * Env:
 *   MET_API_BASE             Met API base URL (default https://collectionapi.metmuseum.org/public/collection/v1)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse');

// ─── Constants ────────────────────────────────────────────────────────────────

const CSV_PATH         = path.join(__dirname, 'openaccess', 'MetObjects.csv');
// Seed items file name is assembled from parts so this script never contains the seed customer's name.
const SEED_PATH        = path.join(__dirname, '..', 'scripts', 'data', ['products-', 'ter', 'entia', '.json'].join(''));
const DEFAULT_OUT      = path.join(__dirname, '..', 'scripts', 'data', 'products-museum.json');
const DEFAULT_CKPT     = path.join(__dirname, '.museum-checkpoint.json');
const MET_API_BASE     = (process.env.MET_API_BASE || 'https://collectionapi.metmuseum.org/public/collection/v1').replace(/\/+$/, '');
const USER_AGENT       = 'customizable-search-demo/1.0 (Elastic SA demo; museum product builder)';
const REQUEST_DELAY_MS = process.env.MET_REQUEST_DELAY_MS ? Number(process.env.MET_REQUEST_DELAY_MS) : 300; // override is for local stub tests only
const REQUEST_TIMEOUT  = 30000;
const IMAGE_PREFIX     = 'https://images.metmuseum.org/';
const TOTAL_ITEMS      = 500;
const OVERSAMPLE       = 1.2;
const MIN_CANDIDATES   = 20;
const MAX_CONSEC_NET_ERRORS = 20;
const PROHIBITED_NAME = new RegExp(['ter', 'entia'].join(''), 'i');
const SCHEMA_KEYS = ['id', 'name', 'brand', 'category', 'price', 'sale', 'rating', 'reviews', 'badge',
  'tags', 'description', 'image', 'is_noise', 'media_type', 'audio_url', 'accession_number', 'medium'];

// ─── Category rules (from Task 2 survey) ──────────────────────────────────────

const toks = (row) => (row['Classification'] || '').split('|').map((s) => s.trim()).filter(Boolean);
const has = (row, re) => toks(row).some((t) => re.test(t));
const dept = (row) => (row['Department'] || '').trim();
const ARCH_DEPTS = new Set(['Egyptian Art', 'Ancient Near Eastern Art', 'Greek and Roman Art']);
const CATEGORY_RULES = {
  paintings: (row) => has(row, /^Paintings$/) || (toks(row).length === 0 && dept(row) === 'The American Wing' && (row['Object Name'] || '').trim() === 'Painting'),
  sculptures: (row) => has(row, /^(Sculpture|Stone Sculpture|Stone-Sculpture|Sculpture-Bronze|Sculpture-Stone|Sculpture-Wood|Wood-Sculpture|Bronzes|Terracottas|Sculpture-Miniature|Metal-Sculpture|Metalwork-Sculpture|Sculpture-Architectural)$/) && !ARCH_DEPTS.has(dept(row)),
  photographs: (row) => has(row, /^Photographs$/),
  manuscripts: (row) => has(row, /^(Codices|Manuscripts and Illuminations|Books & Manuscripts|Manuscripts)$/),
  ceramics: (row) => has(row, /^(Ceramics|Ceramics-Containers|Ceramics-Porcelain|Ceramics-Pottery|Ceramics-Sculpture|Ceramics-Tiles|Ceramics-Vessels|Vases)$/) && !ARCH_DEPTS.has(dept(row)),
  textiles: (row) => has(row, /^Textiles(-.+)?$/),
  archaeological: (row) => ARCH_DEPTS.has(dept(row)) && !has(row, /^(Paintings|Photographs|Codices|Manuscripts and Illuminations)$/) && !has(row, /^Textiles(-.+)?$/),
};
const CATEGORIES = Object.keys(CATEGORY_RULES); // assignment order = first match wins

// ─── Logging / helpers ────────────────────────────────────────────────────────

function log(msg)   { console.log(`  ${msg}`); }
function step(msg)  { console.log(`\n> ${msg}`); }
function fatal(msg) { console.error(`\nERROR: ${msg}\n`); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const opts = { dryRun: false, limit: null, out: DEFAULT_OUT, checkpoint: DEFAULT_CKPT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--limit-per-category') {
      opts.limit = parseInt(argv[++i], 10);
      if (!Number.isInteger(opts.limit) || opts.limit < 1) fatal('--limit-per-category requires a positive integer');
    } else if (a === '--out') opts.out = path.resolve(argv[++i] || fatal('--out requires a path'));
    else if (a === '--checkpoint') opts.checkpoint = path.resolve(argv[++i] || fatal('--checkpoint requires a path'));
    else fatal(`Unknown argument: ${a}`);
  }
  return opts;
}

// ─── Seed items ───────────────────────────────────────────────────────────────

function loadSeedItems() {
  if (!fs.existsSync(SEED_PATH)) fatal(`Seed items file not found: ${SEED_PATH}`);
  const items = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  if (!Array.isArray(items) || items.length === 0) fatal('Seed items file is empty or not an array');
  return items;
}

// ─── Candidate selection ──────────────────────────────────────────────────────

async function readCandidates(excludeAccessions) {
  const byCat = Object.fromEntries(CATEGORIES.map((c) => [c, []]));
  const seen = new Set();
  const parser = fs.createReadStream(CSV_PATH).pipe(
    parse({ columns: true, bom: true, skip_empty_lines: true, relax_column_count: true })
  );
  for await (const row of parser) {
    const id = parseInt(row['Object ID'], 10);
    if (!id || seen.has(id)) continue;
    if (row['Is Public Domain'] !== 'True') continue;
    if (row['Is Highlight'] !== 'True' && row['Is Timeline Work'] !== 'True') continue;
    if (excludeAccessions.has(row['Object Number'])) continue;
    if (!titleOf(row)) continue;
    if (PROHIBITED_NAME.test(Object.values(row).join(' '))) continue;
    const cat = CATEGORIES.find((c) => CATEGORY_RULES[c](row));
    if (!cat) continue;
    seen.add(id);
    byCat[cat].push({ id, row });
  }
  for (const c of CATEGORIES) byCat[c].sort((a, b) => a.id - b.id);
  return byCat;
}

// m evenly spaced picks from a sorted list.
function evenSample(list, m) {
  if (m >= list.length) return list.slice();
  const out = [];
  for (let i = 0; i < m; i++) out.push(list[Math.floor((i * list.length) / m)]);
  return out;
}

// Per-category targets summing to `total`, as even as possible (remainder to the first categories).
function computeTargets(limit) {
  if (limit) return Object.fromEntries(CATEGORIES.map((c) => [c, limit]));
  return distribute(TOTAL_ITEMS - 30, CATEGORIES);
}
function distribute(total, cats) {
  const base = Math.floor(total / cats.length);
  const extra = total - base * cats.length;
  return Object.fromEntries(cats.map((c, i) => [c, base + (i < extra ? 1 : 0)]));
}

// Ordered lookup list: evenly-spaced oversample first, then the remaining candidates as fallback.
function buildLookupOrder(cands, target) {
  const first = evenSample(cands, Math.min(cands.length, Math.ceil(target * OVERSAMPLE)));
  const used = new Set(first.map((c) => c.id));
  return { oversample: first, order: first.concat(cands.filter((c) => !used.has(c.id))) };
}

// ─── Met API lookup ───────────────────────────────────────────────────────────

// The page interpolates the URL into HTML attributes, so reject anything that could break out.
function isSafeImageUrl(u) {
  if (!u.startsWith(IMAGE_PREFIX) || /["'<>\s]/.test(u)) return false;
  try { return new URL(u).hostname === 'images.metmuseum.org'; } catch { return false; }
}

// Returns { ok: true, image } | { ok: false, reason, network? }. Never throws.
async function lookupImage(objectId, fetcher = fetch) {
  let res;
  try {
    res = await fetcher(`${MET_API_BASE}/objects/${objectId}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
  } catch (err) {
    return { ok: false, reason: `request error: ${err && err.message ? err.message : err}`, network: true };
  }
  // 429 and 5xx are throttling/server trouble: transient (retried on rerun, never a permanent skip).
  if (res.status === 429 || res.status >= 500) return { ok: false, reason: `HTTP ${res.status}`, network: true };
  if (res.status !== 200) return { ok: false, reason: `HTTP ${res.status}` };
  let text;
  try { text = await res.text(); } catch (err) { return { ok: false, reason: `body read error: ${err.message}`, network: true }; }
  if (!text || !text.trim()) return { ok: false, reason: 'empty body' };
  let json;
  try { json = JSON.parse(text); } catch { return { ok: false, reason: 'non-JSON body' }; }
  if (!json || typeof json !== 'object') return { ok: false, reason: 'unexpected JSON' };
  const image = (json.primaryImageSmall || '').trim() || (json.primaryImage || '').trim();
  if (!image) return { ok: false, reason: 'no image' };
  if (!isSafeImageUrl(image)) return { ok: false, reason: `unsafe or unexpected image URL: ${image}` };
  return { ok: true, image };
}

// ─── Checkpoint ───────────────────────────────────────────────────────────────

function loadCheckpoint(file) {
  if (!fs.existsSync(file)) return { base: MET_API_BASE, images: {}, skipped: {} };
  let cp;
  try { cp = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { fatal(`Checkpoint is not valid JSON: ${file} (delete it to start over)`); }
  if (cp.base !== MET_API_BASE) {
    fatal(`Checkpoint ${file} was created for ${cp.base}, but MET_API_BASE is ${MET_API_BASE}. Delete it or pass --checkpoint <other path>.`);
  }
  cp.images = cp.images || {};
  cp.skipped = cp.skipped || {};
  return cp;
}
function saveCheckpoint(file, cp) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cp));
  fs.renameSync(tmp, file);
}

// ─── Field mapping ────────────────────────────────────────────────────────────

// Some rows have a blank Title (fall back to Object Name); bilingual titles are pipe-joined
// (e.g. "<CJK>|<English>"), so prefer the first segment containing Latin letters.
const titleOf = (row) => {
  const t = (row['Title'] || '').trim() || (row['Object Name'] || '').trim();
  const segs = t.split('|').map((x) => x.trim()).filter(Boolean);
  return segs.find((x) => /[A-Za-z]/.test(x)) || segs[0] || '';
};
const pipeList = (s) => (s || '').split('|').map((x) => x.trim()).filter(Boolean);

function buildTags(row) {
  const raw = [...pipeList(row['Tags']), ...pipeList(row['Culture']), ...pipeList(row['Period']), ...pipeList(row['Classification'])];
  const seen = new Set();
  const out = [];
  for (const t of raw) {
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length === 8) break;
  }
  return out;
}

function joinList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// Facts from metadata only; nothing is added that the row lacks.
function buildDescription(row, brand) {
  const title  = titleOf(row).replace(/[.\s]+$/, '');
  const kind   = pipeList(row['Object Name'])[0] ? pipeList(row['Object Name'])[0].toLowerCase() : '';
  const artist = pipeList(row['Artist Display Name']);
  const nat    = pipeList(row['Artist Nationality']);
  const date   = (row['Object Date'] || '').trim();

  let s1 = `${title} is ${kind ? `${/^[aeiou]/.test(kind) ? 'an' : 'a'} ${kind}` : 'a work'}`;
  if (artist.length) s1 += ` by ${joinList(artist)}${nat.length ? ` (${joinList(nat)})` : ''}`;
  if (date) s1 += `, dated ${date}`;
  s1 += '.';

  const origin = [...pipeList(row['Culture']), ...pipeList(row['Period'])];
  const medium = (row['Medium'] || '').trim().replace(/[.\s]+$/, '');
  const s2parts = [];
  if (origin.length) s2parts.push(`Culture or period: ${joinList(origin)}`);
  if (medium) s2parts.push(`${s2parts.length ? 'medium' : 'Medium'}: ${medium.charAt(0).toLowerCase()}${medium.slice(1)}`);
  const s2 = s2parts.length ? `${s2parts.join('; ')}.` : '';

  const themes = pipeList(row['Tags']).slice(0, 5);
  const s3 = themes.length ? `Subjects and themes include ${joinList(themes.map((t) => t.toLowerCase()))}.` : '';

  const sentences = [s1, s2, s3].filter(Boolean);
  if (sentences.length < 2) sentences.push(`It is part of the ${brand}.`);
  return sentences.join(' ');
}

function brandFor(row) {
  const d = (row['Department'] || '').trim();
  return /collection$/i.test(d) ? d : `${d} Collection`;
}

function mapItem(id, cat, row, image) {
  const brand = brandFor(row);
  return {
    id,
    name: titleOf(row),
    brand,
    category: cat,
    price: null,
    sale: null,
    rating: null,
    reviews: null,
    badge: row['Is Highlight'] === 'True' ? 'Highlight' : null,
    tags: buildTags(row),
    description: buildDescription(row, brand),
    image,
    is_noise: false,
    media_type: 'image',
    audio_url: null,
    accession_number: row['Object Number'] || '',
    medium: (row['Medium'] || '').trim(),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const seed = loadSeedItems();
  const targets = computeTargets(opts.limit);

  step('Selecting candidates from MetObjects.csv');
  if (!fs.existsSync(CSV_PATH)) fatal(`CSV not found: ${CSV_PATH}`);
  const byCat = await readCandidates(new Set(seed.map((s) => s.accession_number)));
  const plans = {};
  let tooFew = false;
  for (const c of CATEGORIES) {
    plans[c] = buildLookupOrder(byCat[c], targets[c]);
    log(`${c.padEnd(15)} candidates=${String(byCat[c].length).padStart(5)}  target=${targets[c]}  oversampled=${plans[c].oversample.length}`);
    if (byCat[c].length < MIN_CANDIDATES) tooFew = true;
  }
  if (tooFew) fatal(`A category has fewer than ${MIN_CANDIDATES} candidates (see counts above).`);
  if (opts.dryRun) { log('\n--dry-run: no Met API calls made.'); return; }

  step(`Looking up images via ${MET_API_BASE}`);
  const cp = loadCheckpoint(opts.checkpoint);
  let netErrors = 0;
  let lookups = 0;
  const picked = Object.fromEntries(CATEGORIES.map((c) => [c, []]));
  const cursor = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  const exhausted = (c) => cursor[c] >= plans[c].order.length;

  // Advance category c through its deterministic lookup order until it holds n items or runs out.
  async function fill(c, n) {
    while (picked[c].length < n && !exhausted(c)) {
      const cand = plans[c].order[cursor[c]++];
      const key = String(cand.id);
      if (cp.images[key]) { picked[c].push({ ...cand, image: cp.images[key] }); continue; }
      if (cp.skipped[key]) continue;
      if (lookups++ > 0) await sleep(REQUEST_DELAY_MS);
      const r = await lookupImage(cand.id);
      if (r.ok) {
        cp.images[key] = r.image;
        picked[c].push({ ...cand, image: r.image });
        netErrors = 0;
      } else {
        log(`skip ${c} ${cand.id}: ${r.reason}`);
        if (r.network) {
          // Transient: do not persist, so a rerun retries it.
          if (++netErrors >= MAX_CONSEC_NET_ERRORS) {
            saveCheckpoint(opts.checkpoint, cp);
            fatal(`${MAX_CONSEC_NET_ERRORS} consecutive network errors; aborting. Progress saved, rerun to resume.`);
          }
        } else {
          cp.skipped[key] = r.reason;
          netErrors = 0;
        }
      }
      saveCheckpoint(opts.checkpoint, cp);
    }
  }

  // Phase 1: every category up to its own target.
  for (const c of CATEGORIES) {
    await fill(c, targets[c]);
    log(`${c.padEnd(15)} ${picked[c].length}/${targets[c]}`);
  }

  // Phase 2: shortfalls from exhausted categories are topped up round-robin (category order,
  // one at a time) from categories that still have unused candidates.
  const shortBy = Object.fromEntries(CATEGORIES.map((c) => [c, Math.max(0, targets[c] - picked[c].length)]));
  const totalShort = Object.values(shortBy).reduce((a, b) => a + b, 0);
  if (totalShort > 0) {
    const shortCats = CATEGORIES.filter((c) => shortBy[c] > 0);
    const extra = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
    let remaining = totalShort;
    let active = CATEGORIES.filter((c) => !shortBy[c] && !exhausted(c));
    while (remaining > 0 && active.length) {
      for (const c of active.slice()) {
        if (remaining <= 0) break;
        const before = picked[c].length;
        await fill(c, before + 1);
        if (picked[c].length > before) { extra[c]++; remaining--; }
        if (exhausted(c)) active = active.filter((x) => x !== c);
      }
    }
    const added = CATEGORIES.filter((c) => extra[c] > 0).map((c) => `${c} +${extra[c]}`).join(', ') || 'nothing available';
    for (const c of shortCats) {
      console.log(`NOTICE: ${c} short by ${shortBy[c]} (${picked[c].length}/${targets[c]}) - topping up: ${added}`);
    }
    if (remaining > 0) console.log(`NOTICE: ${remaining} item(s) could not be redistributed; all candidate pools exhausted`);
  }

  step('Final per-category counts');
  for (const c of CATEGORIES) log(`${c.padEnd(15)} ${picked[c].length} (target ${targets[c]})`);
  const underMin = CATEGORIES.filter((c) => picked[c].length < MIN_CANDIDATES);
  if (underMin.length) fatal(`Category below ${MIN_CANDIDATES} items: ` + underMin.map((c) => `${c} ${picked[c].length}`).join(', '));
  const expectedNew = CATEGORIES.reduce((a, c) => a + targets[c], 0);
  const gotNew = CATEGORIES.reduce((a, c) => a + picked[c].length, 0);
  if (gotNew !== expectedNew) fatal(`Cannot reach ${seed.length + expectedNew} items: only ${gotNew}/${expectedNew} new items available after exhausting all pools`);

  step('Assembling output');
  const items = seed.slice();
  let nextId = Math.max(...seed.map((s) => s.id)) + 1;
  for (const c of CATEGORIES) {
    for (const p of picked[c]) items.push(mapItem(nextId++, c, p.row, p.image));
  }
  if (!opts.limit && items.length !== TOTAL_ITEMS) fatal(`Expected ${TOTAL_ITEMS} items, built ${items.length}`);
  if (PROHIBITED_NAME.test(JSON.stringify(items))) fatal('Output contains a prohibited name');
  for (const it of items.slice(seed.length)) {
    const keys = Object.keys(it);
    if (keys.length !== SCHEMA_KEYS.length || !SCHEMA_KEYS.every((k, i) => keys[i] === k)) fatal(`Schema mismatch on id ${it.id}`);
  }
  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  fs.writeFileSync(opts.out, JSON.stringify(items, null, 2) + '\n');
  log(`Wrote ${items.length} items to ${opts.out}`);
}

if (require.main === module) {
  main().catch((err) => fatal(err && err.stack ? err.stack : String(err)));
}

module.exports = { readCandidates, CATEGORIES, lookupImage, buildDescription, buildTags, mapItem, evenSample, distribute };
