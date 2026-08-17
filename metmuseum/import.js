#!/usr/bin/env node

/**
 * import.js
 * Indexes Met Museum highlight and timeline works into Elasticsearch.
 * Filters to public domain objects flagged as Is Highlight or Is Timeline Work (~7,200 records).
 *
 * Usage:
 *   node metmuseum/import.js             — full import (skips if index exists)
 *   node metmuseum/import.js --reset     — drop + recreate index, re-import
 *   node metmuseum/import.js --resume    — continue from last checkpoint
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const https = require('https');
const { parse } = require('csv-parse');
const { Client } = require('@elastic/elasticsearch');

// ─── Constants ────────────────────────────────────────────────────────────────

const INDEX_NAME          = 'metmuseum-objects';
const INFERENCE_ID        = '.jina-embeddings-v5-text-small';
const CSV_PATH            = path.join(__dirname, 'openaccess', 'MetObjects.csv');
const CHECKPOINT_PATH     = path.join(__dirname, '.checkpoint');
const FAILED_PATH         = path.join(__dirname, '.failed');
const BATCH_SIZE          = 100;
const MET_API_CONCURRENCY = 10;

// ─── .env loader ─────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    fatal('.env file not found. Copy .env.template to .env and fill in your credentials.');
  }
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && val && !process.env[key]) process.env[key] = val;
  }
}

function requireEnv(key) {
  const val = process.env[key];
  if (!val || val.startsWith('your_') || val.includes('your-deployment')) {
    fatal(`${key} is not set or still contains a placeholder. Fill in .env first.`);
  }
  return val;
}

// ─── Logging helpers ──────────────────────────────────────────────────────────

function log(msg)   { console.log(`  ${msg}`); }
function step(msg)  { console.log(`\n▶ ${msg}`); }
function ok(msg)    { console.log(`  ✓ ${msg}`); }
function warn(msg)  { console.log(`  ⚠ ${msg}`); }
function fatal(msg) { console.error(`\n✗ ERROR: ${msg}\n`); process.exit(1); }

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args   = process.argv.slice(2);
const RESET  = args.includes('--reset');
const RESUME = args.includes('--resume');

// ─── Index management ─────────────────────────────────────────────────────────

async function deleteIndex(client) {
  try {
    await client.indices.delete({ index: INDEX_NAME });
    ok(`Deleted existing index: ${INDEX_NAME}`);
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }
}

async function ensureIndex(client, reset) {
  step('Setting up index...');

  if (reset) await deleteIndex(client);

  const exists = await client.indices.exists({ index: INDEX_NAME });
  if (exists) {
    ok(`Index already exists: ${INDEX_NAME} (use --reset to recreate)`);
    return;
  }

  await client.indices.create({
    index: INDEX_NAME,
    settings: { number_of_shards: 1, number_of_replicas: 0 },
    mappings: {
      properties: {
        object_id:           { type: 'integer' },
        object_number:       { type: 'keyword' },
        title:               { type: 'text' },
        object_name:         { type: 'keyword' },
        department:          { type: 'keyword' },
        is_highlight:        { type: 'boolean' },
        is_public_domain:    { type: 'boolean' },
        accession_year:      { type: 'integer' },
        gallery_number:      { type: 'keyword' },
        culture:             { type: 'keyword' },
        period:              { type: 'keyword' },
        dynasty:             { type: 'keyword' },
        medium:              { type: 'text' },
        artist_display_name: { type: 'text' },
        artist_nationality:  { type: 'keyword' },
        artist_begin_date:   { type: 'integer' },
        artist_end_date:     { type: 'integer' },
        object_date:         { type: 'keyword' },
        object_begin_date:   { type: 'integer' },
        object_end_date:     { type: 'integer' },
        country:             { type: 'keyword' },
        region:              { type: 'keyword' },
        classification:      { type: 'keyword' },
        tags:                { type: 'keyword' },
        link_resource:       { type: 'keyword', index: false },
        primary_image:       { type: 'keyword', index: false },
        semantic: {
          type: 'semantic_text',
          inference_id: INFERENCE_ID,
        },
      },
    },
  });

  ok(`Created index: ${INDEX_NAME}`);
}

// ─── CSV streaming ────────────────────────────────────────────────────────────

async function* streamFilteredRows(fromId = 0) {
  const parser = fs.createReadStream(CSV_PATH).pipe(
    parse({
      columns: true,
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
    })
  );

  for await (const row of parser) {
    const objectId = parseInt(row['Object ID'], 10);
    if (!objectId) continue;
    // Met CSV is sorted ascending by Object ID — this invariant is required for --resume correctness
    if (objectId <= fromId) continue;

    const isPublicDomain = row['Is Public Domain'] === 'True';
    const isCurated      = row['Is Highlight'] === 'True' || row['Is Timeline Work'] === 'True';
    const linkResource   = (row['Link Resource'] || '').trim();

    if (!isPublicDomain || !isCurated || !linkResource) continue;

    yield {
      objectId:          String(objectId),
      objectNumber:      row['Object Number'] || '',
      title:             row['Title'] || '',
      objectName:        row['Object Name'] || '',
      department:        row['Department'] || '',
      isHighlight:       row['Is Highlight'] || 'False',
      isPublicDomain:    row['Is Public Domain'] || 'False',
      accessionYear:     row['AccessionYear'] || '',
      galleryNumber:     row['Gallery Number'] || '',
      culture:           row['Culture'] || '',
      period:            row['Period'] || '',
      dynasty:           row['Dynasty'] || '',
      medium:            row['Medium'] || '',
      artistDisplayName: row['Artist Display Name'] || '',
      artistNationality: row['Artist Nationality'] || '',
      artistBeginDate:   (row['Artist Begin Date'] || '').trim(),
      artistEndDate:     (row['Artist End Date'] || '').trim(),
      objectDate:        row['Object Date'] || '',
      objectBeginDate:   row['Object Begin Date'] || '',
      objectEndDate:     row['Object End Date'] || '',
      country:           row['Country'] || '',
      region:            row['Region'] || '',
      classification:    row['Classification'] || '',
      tags:              row['Tags'] || '',
      linkResource,
    };
  }
}

// ─── Met API image fetching ──────────────────────────────────────────────────

function fetchImageUrl(objectId) {
  return new Promise((resolve) => {
    const url = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${objectId}`;
    const req = https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      if (res.statusCode !== 200) {
        // 403 is common — image restricted/removed since CSV was published; not an API problem
        const fn = res.statusCode === 403 ? log : warn;
        fn(`Met API ${res.statusCode} for object ${objectId}`);
        res.resume();
        resolve('');
        return;
      }
      res.setEncoding('utf8');
      let data = '';
      res.on('data', chunk => {
        if (data.length + chunk.length > 1_000_000) { res.destroy(); resolve(''); return; }
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.primaryImageSmall || json.primaryImage || '');
        } catch {
          warn(`Met API JSON parse error for object ${objectId}`);
          resolve('');
        }
      });
    });
    req.setTimeout(10000, () => { req.destroy(); warn(`Met API timeout for object ${objectId}`); resolve(''); });
    req.on('error', (err) => { warn(`Met API error for object ${objectId}: ${err.message}`); resolve(''); });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchImagesForBatch(rows) {
  const results = [];
  for (let i = 0; i < rows.length; i += MET_API_CONCURRENCY) {
    if (i > 0) await sleep(1000); // 1s between chunks to avoid Met API rate limiting
    const chunk = rows.slice(i, i + MET_API_CONCURRENCY);
    const images = await Promise.all(chunk.map(row => fetchImageUrl(row.objectId)));
    for (let j = 0; j < chunk.length; j++) {
      if (images[j]) {
        results.push({ ...chunk[j], primaryImage: images[j] });
      }
    }
  }
  return results;
}

// ─── Document composition & indexing ──────────────────────────────────────────

function composeSemanticText(row) {
  return [
    row.title,
    row.objectName,
    row.medium,
    row.culture,
    row.period,
    row.dynasty,
    row.tags ? row.tags.split('|').map(t => t.trim()).join(' ') : '',
    row.artistDisplayName,
  ].filter(Boolean).join(' | ');
}

function composeDoc(row) {
  function intOrNull(val) {
    const n = parseInt(val, 10);
    return isNaN(n) ? null : n;
  }

  const doc = {
    object_id:           parseInt(row.objectId, 10),
    object_number:       row.objectNumber || null,
    title:               row.title || null,
    object_name:         row.objectName || null,
    department:          row.department || null,
    is_highlight:        row.isHighlight === 'True',
    is_public_domain:    true,
    accession_year:      intOrNull(row.accessionYear),
    gallery_number:      row.galleryNumber || null,
    culture:             row.culture || null,
    period:              row.period || null,
    dynasty:             row.dynasty || null,
    medium:              row.medium || null,
    artist_display_name: row.artistDisplayName || null,
    artist_nationality:  row.artistNationality || null,
    artist_begin_date:   intOrNull(row.artistBeginDate),
    artist_end_date:     intOrNull(row.artistEndDate),
    object_date:         row.objectDate || null,
    object_begin_date:   intOrNull(row.objectBeginDate),
    object_end_date:     intOrNull(row.objectEndDate),
    country:             row.country || null,
    region:              row.region || null,
    classification:      row.classification || null,
    tags:                row.tags ? row.tags.split('|').map(t => t.trim()).filter(Boolean) : [],
    link_resource:       row.linkResource || null,
    primary_image:       row.primaryImage || null,
    semantic:            composeSemanticText(row),
  };

  // Drop null top-level keys to keep documents clean
  for (const key of Object.keys(doc)) {
    if (doc[key] === null) delete doc[key];
  }

  return doc;
}

async function bulkIndex(client, docs) {
  if (docs.length === 0) return 0;

  const operations = docs.flatMap(doc => [
    { index: { _index: INDEX_NAME, _id: String(doc.object_id) } },
    doc,
  ]);

  const result = await client.bulk({ operations, refresh: false });

  const failed = result.errors ? result.items.filter(i => i.index && i.index.error) : [];
  for (const item of failed) {
    warn(`Failed to index object_id ${item.index._id}: ${JSON.stringify(item.index.error)}`);
  }

  if (failed.length > 0) {
    // Append failed IDs to .failed for post-run recovery
    const failedIds = failed.map(i => i.index._id).join('\n');
    fs.appendFileSync(FAILED_PATH, failedIds + '\n', 'utf8');
  }

  return failed.length;
}

function readCheckpoint() {
  try {
    const val = parseInt(fs.readFileSync(CHECKPOINT_PATH, 'utf8').trim(), 10);
    return isNaN(val) ? 0 : val;
  } catch {
    return 0;
  }
}

function writeCheckpoint(objectId) {
  fs.writeFileSync(CHECKPOINT_PATH, String(objectId), 'utf8');
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    fatal(`CSV not found: ${CSV_PATH}\nRun from the repo root and ensure metmuseum/openaccess/MetObjects.csv exists.`);
  }

  loadEnv();
  const esUrl    = requireEnv('ES_URL');
  const esApiKey = requireEnv('ES_API_KEY');

  const client = new Client({ node: esUrl, auth: { apiKey: esApiKey } });

  log('Met Museum open access import');
  log(`Index:  ${INDEX_NAME}`);
  log(`Mode:   ${RESET ? 'reset' : RESUME ? 'resume' : 'normal'}`);

  if (RESET && fs.existsSync(CHECKPOINT_PATH)) {
    fs.unlinkSync(CHECKPOINT_PATH);
    ok('Cleared checkpoint');
  }

  const fromId = RESUME ? readCheckpoint() : 0;
  if (fromId > 0) log(`Resuming from Object ID: ${fromId}`);

  await ensureIndex(client, RESET);

  step('Starting import...');

  let batch     = [];
  let total     = 0;
  let skipped   = 0;
  let failed    = 0;
  let lastId    = fromId;

  for await (const row of streamFilteredRows(fromId)) {
    batch.push(row);

    if (batch.length >= BATCH_SIZE) {
      const enriched = await fetchImagesForBatch(batch);
      skipped += batch.length - enriched.length;

      const docs = enriched.map(composeDoc);
      const failCount = await bulkIndex(client, docs);
      failed += failCount;

      lastId = parseInt(batch[batch.length - 1].objectId, 10);
      writeCheckpoint(lastId);
      total += docs.length - failCount;

      log(`Indexed ${total} objects | last ID: ${lastId} | skipped (no image): ${skipped}`);
      batch = [];
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    const enriched = await fetchImagesForBatch(batch);
    skipped += batch.length - enriched.length;
    const docs = enriched.map(composeDoc);
    const failCount = await bulkIndex(client, docs);
    failed += failCount;
    total += docs.length - failCount;
    if (docs.length > 0) {
      lastId = docs[docs.length - 1].object_id;
      writeCheckpoint(lastId);
    }
  }

  step('Import complete');
  ok(`Total indexed:       ${total}`);
  ok(`Skipped (no image):  ${skipped}`);
  ok(`Failed (bulk error): ${failed}`);
  ok(`Last Object ID:      ${lastId}`);
}

main().catch(err => {
  const detail = err.meta?.body ? `\n${JSON.stringify(err.meta.body, null, 2)}` : '';
  fatal(`${err.message}${detail}\n${err.stack || ''}`);
});
