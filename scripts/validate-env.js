#!/usr/bin/env node

/**
 * validate-env.js
 * Pre-flight check: validates that .env credentials are correctly configured
 * before running `npm run setup`.
 *
 * Usage:
 *   node scripts/validate-env.js              — full check including Agent Builder
 *   node scripts/validate-env.js --skip-agent — skip Kibana/Agent Builder check
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
const http    = require('http');
const https   = require('https');
const { Client } = require('@elastic/elasticsearch');

// ─── Config ───────────────────────────────────────────────────────────────────

const SKIP_AGENT = process.argv.includes('--skip-agent');

// ─── .env loader (no dotenv dependency) ──────────────────────────────────────

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return false;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && val && !process.env[key]) process.env[key] = val;
  }
  return true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function step(msg) { console.log(`\n▶ ${msg}`); }
function ok(msg)   { console.log(`  ✓ ${msg}`); passed++; }
function fail(msg) { console.log(`  ✗ ${msg}`); failed++; }
function info(msg) { console.log(`  · ${msg}`); }

function isPlaceholder(val) {
  return !val || val.startsWith('your_') || val.includes('your-deployment') || val.includes('your-inference');
}

function esError(e) {
  return e?.meta?.body?.error?.reason || e?.meta?.body?.error?.type || e.message;
}

// ─── Check 1: env var presence ────────────────────────────────────────────────

function checkEnvVars() {
  step('Checking .env variables...');
  const required = ['ES_URL', 'ES_API_KEY', 'ES_API_KEY_READONLY', 'KIBANA_URL'];
  for (const key of required) {
    const val = process.env[key];
    if (!val) {
      fail(`${key} is missing`);
    } else if (isPlaceholder(val)) {
      fail(`${key} still has a placeholder value`);
    } else {
      ok(`${key} is set`);
    }
  }
  const index = process.env.ES_INDEX || 'demo-products';
  info(`ES_INDEX = "${index}" (${process.env.ES_INDEX ? 'from .env' : 'using default'})`);
}

// ─── Check 2: write key ───────────────────────────────────────────────────────

async function checkWriteKey() {
  step('Checking write API key (ES_API_KEY)...');

  const url = process.env.ES_URL;
  const key = process.env.ES_API_KEY;
  if (isPlaceholder(url) || isPlaceholder(key)) {
    fail('Skipping — ES_URL or ES_API_KEY not valid');
    return;
  }

  const client = new Client({ node: url, auth: { apiKey: key } });

  try {
    const clusterInfo = await client.info();
    ok(`Connected to cluster: ${clusterInfo.cluster_name}`);
    ok(`Elasticsearch version: ${clusterInfo.version.number}`);

    const [major, minor] = clusterInfo.version.number.split('.').map(n => parseInt(n, 10));
    if (major < 9 || (major === 9 && minor < 3)) {
      fail(`ES ${clusterInfo.version.number} detected. This project requires ES 9.3+`);
    }
  } catch (e) {
    fail(`Connection failed: ${esError(e)}`);
    return;
  }

  // Check if the index already exists (informational only)
  const index = process.env.ES_INDEX || 'demo-products';
  try {
    const exists = await client.indices.exists({ index });
    if (exists) {
      info(`Index "${index}" already exists — setup has been run previously`);
    } else {
      info(`Index "${index}" not found — run "npm run setup" after this check passes`);
    }
  } catch (e) {
    info(`Could not check index status: ${esError(e)}`);
  }
}

// ─── Check 3: read-only key ───────────────────────────────────────────────────

async function checkReadKey() {
  step('Checking read-only API key (ES_API_KEY_READONLY)...');

  const url = process.env.ES_URL;
  const key = process.env.ES_API_KEY_READONLY;
  if (isPlaceholder(url) || isPlaceholder(key)) {
    fail('Skipping — ES_URL or ES_API_KEY_READONLY not valid');
    return;
  }

  const client = new Client({ node: url, auth: { apiKey: key } });
  const index = process.env.ES_INDEX || 'demo-products';
  try {
    await client.search({ index, body: { query: { match_all: {} }, size: 1 } });
    ok(`Read access to "${index}" confirmed`);
  } catch (e) {
    if (e?.meta?.statusCode === 404) {
      info(`Index "${index}" not found yet — key looks valid but read access cannot be fully confirmed until index is created`);
    } else if (e?.meta?.statusCode === 403) {
      fail(`Read-only key lacks search permissions on "${index}": ${esError(e)}`);
    } else {
      fail(`Search test failed: ${esError(e)}`);
    }
  }
}

// ─── Check 4: Kibana + Agent Builder ────────────────────────────────────────

async function checkKibana() {
  if (SKIP_AGENT) {
    step('Agent Builder check skipped (--skip-agent)');
    info('Skipping KIBANA_URL and AGENT_ID validation');
    return;
  }

  step('Checking Kibana reachability (KIBANA_URL)...');

  const kibanaUrl = process.env.KIBANA_URL;
  const kibanaKey = process.env.ES_API_KEY;

  if (isPlaceholder(kibanaUrl) || isPlaceholder(kibanaKey)) {
    fail('Skipping — KIBANA_URL or ES_API_KEY not valid');
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(`${kibanaUrl}/api/status`);
  } catch {
    fail(`KIBANA_URL is not a valid URL: ${kibanaUrl}`);
    return;
  }

  // Check Kibana status endpoint
  const reachable = await new Promise((resolve) => {
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname,
      method: 'GET',
      headers: {
        'Authorization': `ApiKey ${kibanaKey}`,
        'kbn-xsrf': 'true'
      }
    };

    const transport = parsedUrl.protocol === 'https:' ? https : http;

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          ok('Kibana is reachable (200 OK)');
          resolve(true);
        } else if (res.statusCode === 401) {
          fail('KIBANA_API_KEY is invalid or expired (401 Unauthorized)');
          resolve(false);
        } else {
          fail(`Kibana returned ${res.statusCode}: ${data.slice(0, 200)}`);
          resolve(false);
        }
      });
    });

    req.on('error', (e) => {
      fail(`Could not reach Kibana: ${e.message}`);
      resolve(false);
    });

    req.setTimeout(15000, () => {
      fail('Kibana timed out after 15s');
      req.destroy();
      resolve(false);
    });

    req.end();
  });

  if (!reachable) return;

  // Check agent if AGENT_ID is set
  const agentId = process.env.AGENT_ID;
  if (!agentId) {
    info('AGENT_ID not set — will be auto-populated by npm run setup');
    return;
  }

  step('Checking Agent Builder agent (AGENT_ID)...');

  const kibanaReadKey = process.env.ES_API_KEY_READONLY;
  const agentUrl = new URL(`${kibanaUrl}/api/agent_builder/agents/${agentId}`);

  await new Promise((resolve) => {
    const options = {
      hostname: agentUrl.hostname,
      port: agentUrl.port || (agentUrl.protocol === 'https:' ? 443 : 80),
      path: agentUrl.pathname,
      method: 'GET',
      headers: {
        'Authorization': `ApiKey ${kibanaReadKey}`,
        'kbn-xsrf': 'true'
      }
    };

    const transport = agentUrl.protocol === 'https:' ? https : http;

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          ok(`Agent found: ${agentId}`);
        } else if (res.statusCode === 404) {
          fail(`Agent not found: ${agentId} — run npm run setup or check AGENT_ID`);
        } else {
          fail(`Agent check returned ${res.statusCode}: ${data.slice(0, 200)}`);
        }
        resolve();
      });
    });

    req.on('error', (e) => {
      fail(`Could not check agent: ${e.message}`);
      resolve();
    });

    req.setTimeout(10000, () => {
      fail('Agent check timed out after 10s');
      req.destroy();
      resolve();
    });

    req.end();
  });
}

// ─── Check 5: Jina reranker endpoint ────────────────────────────────────────

async function checkJinaReranker() {
  step('Checking Jina reranker inference endpoint...');

  const url = process.env.ES_URL;
  const key = process.env.ES_API_KEY;
  if (isPlaceholder(url) || isPlaceholder(key)) {
    info('Skipping — ES_URL or ES_API_KEY not valid');
    return;
  }

  const client = new Client({ node: url, auth: { apiKey: key } });

  try {
    await client.inference.get({ inference_id: '.jina-reranker-v3' });
    ok('Jina reranker endpoint found: .jina-reranker-v3');
  } catch (e) {
    if (e?.meta?.statusCode === 404) {
      fail('Jina reranker endpoint not found: .jina-reranker-v3');
      info('Create in Kibana: Search → Inference Endpoints → Elastic Inference Service → .jina-reranker-v3');
    } else {
      info(`Could not verify Jina reranker: ${esError(e)}`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════');
  console.log('  Elastic Search Demo — .env Validator');
  console.log('══════════════════════════════════════════');

  if (!loadEnv()) {
    console.log('\n✗ ERROR: .env file not found.');
    console.log('  Copy .env.template to .env and fill in your credentials.\n');
    process.exit(1);
  }
  info('.env loaded');

  checkEnvVars();
  await checkWriteKey();
  await checkReadKey();
  await checkKibana();
  await checkJinaReranker();

  console.log('\n──────────────────────────────────────────');
  if (failed === 0) {
    console.log(`  ✓ All ${passed} checks passed — ready to run "npm run setup"\n`);
    process.exit(0);
  } else {
    console.log(`  ${passed} passed, ${failed} failed — fix the issues above before running "npm run setup"\n`);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('\n✗ Unexpected error:', e.message);
  process.exit(1);
});
