#!/usr/bin/env node

/**
 * setup-index.js
 * Bootstraps the Elasticsearch demo index: creates mappings, configures Jina embeddings,
 * and bulk-indexes the product dataset.
 *
 * Usage:
 *   node scripts/setup-index.js                        — full setup (skip if index exists)
 *   node scripts/setup-index.js --reset                — delete + recreate indexes, re-seed
 *   node scripts/setup-index.js --seed-only            — skip index creation, just bulk index
 *   node scripts/setup-index.js --check                — verify cluster + ELSER, no writes
 *   node scripts/setup-index.js --slug sportchek       — use products-sportchek.json and index suffix -sportchek
 *   node scripts/setup-index.js --reset --slug mec     — delete + recreate customer-specific indexes
 *   node scripts/setup-index.js --skip-agent           — skip Agent Builder setup even if Kibana creds are set
 *
 * The --slug flag:
 *   - Reads product data from scripts/data/products-{slug}.json instead of products.json
 *   - Appends -{slug} to index names (e.g. demo-products → demo-products-sportchek, demo-personas → demo-personas-sportchek)
 *   - Agent Builder tools/agent IDs are also suffixed
 *   - Without --slug, behaviour is unchanged (uses products.json and base index names)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { Client } = require('@elastic/elasticsearch');

// ─── Config ──────────────────────────────────────────────────────────────────

const JINA_EMBEDDINGS_INFERENCE_ID = '.jina-embeddings-v5-text-small';
const JINA_RERANKER_INFERENCE_ID = '.jina-reranker-v3';

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
              inference_id: JINA_EMBEDDINGS_INFERENCE_ID
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

    const [major, minor] = info.version.number.split('.').map(n => parseInt(n, 10));
    if (major < 8 || (major === 8 && minor < 15)) {
      warn(`ES ${info.version.number} detected. semantic_text requires ES 8.15+. Proceed with caution.`);
    }
  } catch (err) {
    fatal(`Cannot connect to Elasticsearch: ${err.message}\nCheck ES_URL and ES_API_KEY in .env`);
  }
}

async function checkJinaEmbeddings(client) {
  step('Checking Jina embeddings inference endpoint...');
  try {
    await client.inference.get({ inference_id: JINA_EMBEDDINGS_INFERENCE_ID });
    ok(`Jina embeddings inference endpoint found: ${JINA_EMBEDDINGS_INFERENCE_ID}`);
  } catch (err) {
    if (err.statusCode === 404) {
      warn(`Jina embeddings inference endpoint not found: ${JINA_EMBEDDINGS_INFERENCE_ID}`);
      warn('This endpoint is EIS-managed. Verify it is available on your cluster via: GET _inference/text_embedding/.jina-embeddings-v5-text-small');
      warn('The index will still be created, but semantic_text fields will not work until the endpoint is available.');
    } else {
      warn(`Could not verify Jina embeddings endpoint: ${err.message}`);
    }
  }
}

async function checkJinaReranker(client) {
  step('Checking Jina reranker inference endpoint...');
  try {
    await client.inference.get({ inference_id: JINA_RERANKER_INFERENCE_ID });
    ok(`Jina reranker inference endpoint found: ${JINA_RERANKER_INFERENCE_ID}`);
  } catch (err) {
    if (err.statusCode === 404) {
      warn(`Jina reranker endpoint not found: ${JINA_RERANKER_INFERENCE_ID}`);
      warn('Create it in Kibana: Search → Inference Endpoints → Add endpoint → Elastic Inference Service → .jina-reranker-v3');
      warn('Personalized search mode requires this endpoint for ML-based reranking.');
    } else {
      warn(`Could not verify Jina reranker endpoint: ${err.message}`);
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

async function seedProducts(client, indexName, productsFilePath) {
  step('Bulk indexing products...');

  let products;
  try {
    products = JSON.parse(fs.readFileSync(productsFilePath, 'utf8'));
  } catch (err) {
    fatal(`Cannot read products file: ${err.message}\n  Path: ${productsFilePath}`);
  }

  log(`Loaded ${products.length} products from ${productsFilePath}`);

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
      warn(`${pendingResult.count} documents are still awaiting Jina embeddings inference (this is normal — background processing continues after setup).`);
    } else {
      ok('All documents have semantic embeddings');
    }
  } catch (_) {
    // semantic_text field may not be queryable this way — skip silently
  }
}

// ─── Persona index ──────────────────────────────────────────────────────────

function personaMapping() {
  return {
    settings: { number_of_shards: 1, number_of_replicas: 0 },
    mappings: {
      properties: {
        id:               { type: 'keyword' },
        name:             { type: 'text', fields: { keyword: { type: 'keyword' } } },
        tagline:          { type: 'text' },
        gender:           { type: 'keyword' },
        preferredBrands:  { type: 'keyword' },
        purchaseHistory:  { type: 'keyword' },
        clickHistory:     { type: 'keyword' },
        season:           { type: 'keyword' }
      }
    }
  };
}

async function createPersonaIndex(client, indexName) {
  step(`Creating persona index: ${indexName}...`);
  try {
    const exists = await client.indices.exists({ index: indexName });
    if (exists) {
      warn(`Persona index ${indexName} already exists. Use --reset to recreate it.`);
      return false;
    }
  } catch (_) {}

  try {
    await client.indices.create({ index: indexName, body: personaMapping() });
    ok(`Persona index created: ${indexName}`);
    return true;
  } catch (err) {
    fatal(`Failed to create persona index: ${err.message}`);
  }
}

async function seedPersonas(client, indexName) {
  step('Indexing personas...');
  const personasPath = path.join(__dirname, 'data', 'personas.json');
  let personas;
  try {
    personas = JSON.parse(fs.readFileSync(personasPath, 'utf8'));
  } catch (err) {
    fatal(`Cannot read personas file: ${err.message}\n  Path: ${personasPath}`);
  }

  const operations = personas.flatMap(p => [
    { index: { _index: indexName, _id: p.id } },
    p
  ]);

  try {
    const result = await client.bulk({ body: operations, refresh: true });
    if (result.errors) {
      const failed = result.items.filter(i => i.index && i.index.error);
      warn(`Persona bulk index had ${failed.length} error(s)`);
    } else {
      ok(`All ${personas.length} personas indexed successfully`);
    }
  } catch (err) {
    fatal(`Persona bulk indexing failed: ${err.message}`);
  }
}

async function deletePersonaIndex(client, indexName) {
  step(`Deleting persona index: ${indexName}...`);
  try {
    await client.indices.delete({ index: indexName });
    ok(`Persona index deleted: ${indexName}`);
  } catch (err) {
    if (err.statusCode === 404) {
      log('Persona index did not exist, nothing to delete.');
    } else {
      fatal(`Failed to delete persona index: ${err.message}`);
    }
  }
}

// ─── Agent Builder (Kibana API) ─────────────────────────────────────────────

function kibanaRequest(method, urlPath, body, kibanaUrl, kibanaApiKey) {
  const fullUrl = new URL(urlPath, kibanaUrl);
  const payload = body ? JSON.stringify(body) : null;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: fullUrl.hostname,
      port: fullUrl.port || (fullUrl.protocol === 'https:' ? 443 : 80),
      path: fullUrl.pathname,
      method,
      headers: {
        'Authorization': `ApiKey ${kibanaApiKey}`,
        'kbn-xsrf': 'true',
        'Content-Type': 'application/json'
      }
    };
    if (payload) options.headers['Content-Length'] = Buffer.byteLength(payload);

    const transport = fullUrl.protocol === 'https:' ? https : http;

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body: parsed });
        } else {
          reject({ status: res.statusCode, body: parsed });
        }
      });
    });

    req.on('error', (e) => reject({ status: 0, body: e.message }));
    req.setTimeout(30000, () => { req.destroy(); reject({ status: 0, body: 'Request timed out' }); });

    if (payload) req.write(payload);
    req.end();
  });
}

async function createAgentTools(kibanaUrl, kibanaApiKey, productIndex, personaIndex, slug) {
  step('Creating Agent Builder tools...');

  const suffix = slug ? `-${slug}` : '';
  const tools = [
    {
      id: `demo-product-search${suffix}`,
      type: 'index_search',
      description: 'Search the product catalog for items matching customer queries',
      configuration: { pattern: productIndex }
    },
    {
      id: `demo-persona-search${suffix}`,
      type: 'index_search',
      description: 'Look up customer persona profiles including preferences and purchase history',
      configuration: { pattern: personaIndex }
    }
  ];

  const toolIds = [];
  for (const tool of tools) {
    // Idempotency: check if tool exists
    try {
      await kibanaRequest('GET', `/api/agent_builder/tools/${tool.id}`, null, kibanaUrl, kibanaApiKey);
      ok(`Tool already exists: ${tool.id} (skipping)`);
      toolIds.push(tool.id);
      continue;
    } catch (e) {
      if (e.status !== 404) {
        warn(`Could not check tool ${tool.id}: ${JSON.stringify(e.body)}`);
      }
    }

    try {
      await kibanaRequest('POST', '/api/agent_builder/tools', tool, kibanaUrl, kibanaApiKey);
      ok(`Tool created: ${tool.id}`);
      toolIds.push(tool.id);
    } catch (e) {
      fatal(`Failed to create tool ${tool.id}: ${JSON.stringify(e.body)}`);
    }
  }

  return toolIds;
}

async function createAgent(kibanaUrl, kibanaApiKey, toolIds, slug) {
  step('Creating Agent Builder agent...');

  const suffix = slug ? `-${slug}` : '';
  const agentId = `demo-shopping-assistant${suffix}`;

  // Idempotency: check if agent exists
  try {
    await kibanaRequest('GET', `/api/agent_builder/agents/${agentId}`, null, kibanaUrl, kibanaApiKey);
    ok(`Agent already exists: ${agentId} (skipping)`);
    return agentId;
  } catch (e) {
    if (e.status !== 404) {
      warn(`Could not check agent ${agentId}: ${JSON.stringify(e.body)}`);
    }
  }

  const agent = {
    id: agentId,
    name: `Shopping Assistant${slug ? ` (${slug})` : ''}`,
    description: 'AI shopping assistant for product discovery and recommendations',
    configuration: {
      instructions: [
        'You are a shopping assistant for an online retail store.',
        'Help customers find products, make recommendations, and answer questions about the catalog.',
        '',
        'When a customer asks about products:',
        '1. Search the product index for relevant items',
        '2. If a persona name is mentioned, look up their profile in the persona index to understand their preferences and purchase history',
        '3. Recommend products that match both the query and the customer\'s preferences',
        '4. Be conversational, helpful, and concise'
      ].join('\n'),
      tools: [{ tool_ids: toolIds }]
    }
  };

  try {
    await kibanaRequest('POST', '/api/agent_builder/agents', agent, kibanaUrl, kibanaApiKey);
    ok(`Agent created: ${agentId}`);
    return agentId;
  } catch (e) {
    fatal(`Failed to create agent: ${JSON.stringify(e.body)}`);
  }
}

function writeAgentIdToEnv(agentId) {
  const envPath = path.join(__dirname, '..', '.env');
  let content = fs.readFileSync(envPath, 'utf8');

  if (content.match(/^AGENT_ID=.*$/m)) {
    content = content.replace(/^AGENT_ID=.*$/m, `AGENT_ID=${agentId}`);
  } else {
    content = content.trimEnd() + `\nAGENT_ID=${agentId}\n`;
  }

  fs.writeFileSync(envPath, content, 'utf8');
  ok(`AGENT_ID=${agentId} written to .env`);
}

function printSummary(indexName) {
  console.log('\n' + '─'.repeat(60));
  console.log('  Setup complete!');
  console.log('─'.repeat(60));
  console.log(`
  Index:   ${indexName}
  Products: see verification counts above

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

  Note: Jina embeddings are generated asynchronously after indexing.
  Hybrid and Personalized search modes will improve as embeddings complete.
  Full processing typically takes 1-5 minutes.
`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const isReset = args.includes('--reset');
  const isSeedOnly = args.includes('--seed-only');
  const isCheckOnly = args.includes('--check');
  const skipAgent = args.includes('--skip-agent');

  // Parse --slug <value>
  const slugIdx = args.indexOf('--slug');
  const slug = slugIdx !== -1 && args[slugIdx + 1] ? args[slugIdx + 1] : null;

  // Derive products file and index name from slug
  const productsFile = slug
    ? path.join(__dirname, 'data', `products-${slug}.json`)
    : path.join(__dirname, 'data', 'products.json');

  const baseIndex = 'demo-products';
  const basePersonaIndex = 'demo-personas';

  console.log('\n━━━ Elastic Search Demo — Index Setup ━━━');
  if (isReset)    console.log('  Mode: RESET (delete + recreate + seed)');
  if (isSeedOnly) console.log('  Mode: SEED ONLY (skip index creation)');
  if (isCheckOnly) console.log('  Mode: CHECK (read-only, no writes)');
  if (skipAgent)  console.log('  Agent: SKIP (--skip-agent)');
  if (slug)       console.log(`  Slug: ${slug}`);

  loadEnv();

  const esUrl   = requireEnv('ES_URL');
  const apiKey  = requireEnv('ES_API_KEY');
  const esIndexBase = process.env.ES_INDEX || baseIndex;
  const esIndex = slug ? `${esIndexBase}-${slug}` : esIndexBase;
  const personaIndex = slug ? `${basePersonaIndex}-${slug}` : basePersonaIndex;

  log(`ES_URL:          ${esUrl}`);
  log(`ES_INDEX:        ${esIndex}${slug ? ` (base: ${esIndexBase}, slug: ${slug})` : ''}`);
  log(`PERSONA_INDEX:   ${personaIndex}`);

  const client = new Client({
    node: esUrl,
    auth: { apiKey }
  });

  await checkConnection(client);
  await checkJinaEmbeddings(client);
  await checkJinaReranker(client);

  if (isCheckOnly) {
    console.log('\n  Check complete — no changes made.\n');
    return;
  }

  // Product index
  if (isReset) {
    await deleteIndex(client, esIndex);
  }

  if (!isSeedOnly) {
    await createIndex(client, esIndex);
  }

  await seedProducts(client, esIndex, productsFile);
  await verifyIndex(client, esIndex);

  // Persona index
  if (isReset) {
    await deletePersonaIndex(client, personaIndex);
  }

  if (!isSeedOnly) {
    await createPersonaIndex(client, personaIndex);
  }

  await seedPersonas(client, personaIndex);

  // Agent Builder setup (Kibana API)
  const kibanaUrl = process.env.KIBANA_URL;
  const kibanaApiKey = process.env.ES_API_KEY;

  if (skipAgent) {
    log('Agent Builder setup skipped (--skip-agent)');
  } else if (!kibanaUrl || kibanaUrl.includes('your-deployment') || !kibanaApiKey || kibanaApiKey.startsWith('your_')) {
    warn('KIBANA_URL or ES_API_KEY not set — skipping Agent Builder setup.');
    warn('GenAI mode will not work until Kibana credentials are configured and npm run setup is re-run.');
  } else {
    const toolIds = await createAgentTools(kibanaUrl, kibanaApiKey, esIndex, personaIndex, slug);
    const agentId = await createAgent(kibanaUrl, kibanaApiKey, toolIds, slug);
    writeAgentIdToEnv(agentId);
  }

  printSummary(esIndex);
}

main().catch(err => {
  console.error('\n✗ Unexpected error:', err.message);
  if (err.meta) console.error('  ES response:', JSON.stringify(err.meta.body, null, 2));
  process.exit(1);
});
