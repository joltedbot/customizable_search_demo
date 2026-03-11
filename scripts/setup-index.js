#!/usr/bin/env node

/**
 * setup-index.js
 * Bootstraps the Elasticsearch demo index: creates mappings, deploys ELSER,
 * and bulk-indexes the 75-product dataset.
 *
 * Usage:
 *   node scripts/setup-index.js            — full setup (skip if index exists)
 *   node scripts/setup-index.js --reset    — delete + recreate index, re-seed
 *   node scripts/setup-index.js --seed-only — skip index creation, just bulk index
 *   node scripts/setup-index.js --check    — verify cluster + ELSER, no writes
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('@elastic/elasticsearch');

// ─── Config ──────────────────────────────────────────────────────────────────

const ELSER_INFERENCE_ID = '.elser-2-elasticsearch';
const PRODUCTS_FILE = path.join(__dirname, 'data', 'products.json');

// ─── .env loader (no dotenv dependency) ──────────────────────────────────────

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
    if (key && val && !process.env[key]) {
      process.env[key] = val;
    }
  }
}

function requireEnv(key) {
  const val = process.env[key];
  if (!val || val.startsWith('your_') || val.includes('your-deployment')) {
    fatal(`${key} is not set or still contains the placeholder value. Fill in .env first.`);
  }
  return val;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg) { console.log(`  ${msg}`); }
function step(msg) { console.log(`\n▶ ${msg}`); }
function ok(msg) { console.log(`  ✓ ${msg}`); }
function warn(msg) { console.log(`  ⚠ ${msg}`); }
function fatal(msg) { console.error(`\n✗ ERROR: ${msg}\n`); process.exit(1); }

// ─── Index mapping ────────────────────────────────────────────────────────────

function indexMapping() {
  return {
    settings: {
      number_of_shards: 1,
      number_of_replicas: 0
    },
    mappings: {
      properties: {
        id:          { type: 'integer' },
        name:        { type: 'text', fields: { keyword: { type: 'keyword' } } },
        brand:       { type: 'text', fields: { keyword: { type: 'keyword' } } },
        category:    { type: 'keyword' },
        gender:      { type: 'keyword' },
        price:       { type: 'float' },
        sale:        { type: 'float' },
        rating:      { type: 'float' },
        reviews:     { type: 'integer' },
        badge:       { type: 'keyword' },
        tags:        { type: 'keyword' },
        image:       { type: 'keyword', index: false },
        description: {
          type: 'text',
          analyzer: 'english',
          fields: {
            semantic: {
              type: 'semantic_text',
              inference_id: ELSER_INFERENCE_ID
            }
          }
        },
        is_noise: { type: 'boolean' }
      }
    }
  };
}

// ─── Steps ───────────────────────────────────────────────────────────────────

async function checkConnection(client) {
  step('Checking cluster connection...');
  try {
    const info = await client.info();
    ok(`Connected to: ${info.cluster_name}`);
    ok(`Elasticsearch version: ${info.version.number}`);

    const major = parseInt(info.version.number.split('.')[0], 10);
    if (major < 8) {
      warn(`ES ${info.version.number} detected. semantic_text requires ES 8.x+. Proceed with caution.`);
    }
  } catch (err) {
    fatal(`Cannot connect to Elasticsearch: ${err.message}\nCheck ES_URL and ES_API_KEY in .env`);
  }
}

async function checkElser(client) {
  step('Checking ELSER inference endpoint...');
  try {
    await client.inference.get({ inference_id: ELSER_INFERENCE_ID });
    ok(`ELSER inference endpoint found: ${ELSER_INFERENCE_ID}`);
  } catch (err) {
    if (err.statusCode === 404) {
      warn(`ELSER inference endpoint not found: ${ELSER_INFERENCE_ID}`);
      warn('If you have ML nodes, create it in Kibana: Analytics → Machine Learning → Trained Models → ELSER → Deploy');
      warn('The index will still be created, but semantic_text fields will not work until ELSER is deployed.');
    } else {
      warn(`Could not verify ELSER endpoint: ${err.message}`);
    }
  }
}

async function deleteIndex(client, indexName) {
  step(`Deleting index: ${indexName}...`);
  try {
    await client.indices.delete({ index: indexName });
    ok(`Index deleted: ${indexName}`);
  } catch (err) {
    if (err.statusCode === 404) {
      log('Index did not exist, nothing to delete.');
    } else {
      fatal(`Failed to delete index: ${err.message}`);
    }
  }
}

async function createIndex(client, indexName) {
  step(`Creating index: ${indexName}...`);
  try {
    const exists = await client.indices.exists({ index: indexName });
    if (exists) {
      warn(`Index ${indexName} already exists. Use --reset to recreate it.`);
      return false;
    }
  } catch (_) {}

  try {
    await client.indices.create({
      index: indexName,
      body: indexMapping()
    });
    ok(`Index created: ${indexName}`);
    ok('Mappings applied (including semantic_text on description.semantic)');
    return true;
  } catch (err) {
    fatal(`Failed to create index: ${err.message}`);
  }
}

async function seedProducts(client, indexName) {
  step('Bulk indexing products...');

  let products;
  try {
    products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
  } catch (err) {
    fatal(`Cannot read products file: ${err.message}`);
  }

  log(`Loaded ${products.length} products from ${PRODUCTS_FILE}`);

  const operations = products.flatMap(product => [
    { index: { _index: indexName, _id: String(product.id) } },
    product
  ]);

  try {
    const result = await client.bulk({ body: operations, refresh: true });

    if (result.errors) {
      const failed = result.items.filter(i => i.index && i.index.error);
      warn(`Bulk index completed with ${failed.length} error(s):`);
      for (const item of failed.slice(0, 5)) {
        warn(`  ID ${item.index._id}: ${JSON.stringify(item.index.error)}`);
      }
      if (failed.length > 5) warn(`  ... and ${failed.length - 5} more`);
    } else {
      ok(`All ${products.length} products indexed successfully`);
    }

    const indexed = result.items.filter(i => i.index && !i.index.error).length;
    ok(`Documents indexed: ${indexed}`);
  } catch (err) {
    fatal(`Bulk indexing failed: ${err.message}`);
  }
}

async function verifyIndex(client, indexName) {
  step('Verifying index...');

  // Total count
  try {
    const countResult = await client.count({ index: indexName });
    ok(`Total documents: ${countResult.count}`);
  } catch (err) {
    warn(`Could not get document count: ${err.message}`);
  }

  // Noise count
  try {
    const noiseResult = await client.count({
      index: indexName,
      body: { query: { term: { is_noise: true } } }
    });
    ok(`Noise products (is_noise: true): ${noiseResult.count}`);
  } catch (err) {
    warn(`Could not count noise products: ${err.message}`);
  }

  // Spot-check: confirm description.semantic field exists on a doc
  try {
    const sample = await client.search({
      index: indexName,
      body: {
        query: { term: { is_noise: false } },
        size: 1,
        _source: ['name', 'brand', 'description']
      }
    });
    if (sample.hits.hits.length > 0) {
      const doc = sample.hits.hits[0]._source;
      ok(`Sample doc: "${doc.name}" by ${doc.brand}`);
    }
  } catch (err) {
    warn(`Spot-check failed: ${err.message}`);
  }

  // Check ELSER ingestion status (semantic fields may be pending)
  try {
    const pendingResult = await client.count({
      index: indexName,
      body: {
        query: {
          bool: {
            must_not: {
              exists: { field: 'description.semantic' }
            }
          }
        }
      }
    });
    if (pendingResult.count > 0) {
      warn(`${pendingResult.count} documents are still awaiting ELSER inference (this is normal — background processing continues after setup).`);
    } else {
      ok('All documents have semantic embeddings');
    }
  } catch (_) {
    // semantic_text field may not be queryable this way — skip silently
  }
}

function printSummary(indexName) {
  console.log('\n' + '─'.repeat(60));
  console.log('  Setup complete!');
  console.log('─'.repeat(60));
  console.log(`
  Index:   ${indexName}
  Products: 75 (65 real + 10 noise)

  Next steps:
  1. Configure CORS so the demo can query ES from localhost:3000.
     In Kibana: Stack Management → Elasticsearch →
     Edit deployment settings → add:
       http.cors.allow-origin: ["http://localhost:3000"]
       http.cors.enabled: true

  2. Create a READ-ONLY API key for the demo HTML:
     Kibana → Stack Management → API Keys → Create API key
     Privileges: index — ${indexName} → read, view_index_metadata

  3. Run the demo:
     npm run dev
     Then open http://localhost:3000

  Note: ELSER generates embeddings asynchronously after indexing.
  Hybrid and LTR search modes will improve as embeddings complete.
  Full processing typically takes 1-5 minutes for 75 documents.
`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const isReset = args.includes('--reset');
  const isSeedOnly = args.includes('--seed-only');
  const isCheckOnly = args.includes('--check');

  console.log('\n━━━ Elastic Search Demo — Index Setup ━━━');
  if (isReset)    console.log('  Mode: RESET (delete + recreate + seed)');
  if (isSeedOnly) console.log('  Mode: SEED ONLY (skip index creation)');
  if (isCheckOnly) console.log('  Mode: CHECK (read-only, no writes)');

  loadEnv();

  const esUrl   = requireEnv('ES_URL');
  const apiKey  = requireEnv('ES_API_KEY');
  const esIndex = process.env.ES_INDEX || 'demo-products';

  log(`ES_URL:   ${esUrl}`);
  log(`ES_INDEX: ${esIndex}`);

  const client = new Client({
    node: esUrl,
    auth: { apiKey }
  });

  await checkConnection(client);
  await checkElser(client);

  if (isCheckOnly) {
    console.log('\n  Check complete — no changes made.\n');
    return;
  }

  if (isReset) {
    await deleteIndex(client, esIndex);
  }

  if (!isSeedOnly) {
    await createIndex(client, esIndex);
  }

  await seedProducts(client, esIndex);
  await verifyIndex(client, esIndex);
  printSummary(esIndex);
}

main().catch(err => {
  console.error('\n✗ Unexpected error:', err.message);
  if (err.meta) console.error('  ES response:', JSON.stringify(err.meta.body, null, 2));
  process.exit(1);
});
