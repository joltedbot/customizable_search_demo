#!/usr/bin/env node

/**
 * validate-env.js
 * Pre-flight check: validates that .env credentials are correctly configured
 * before running `pnpm run setup`.
 *
 * Usage:
 *   node scripts/validate-env.js                  — full check (base ES_INDEX; agent check skipped without --slug)
 *   node scripts/validate-env.js --slug <name>    — check that demo's index and Agent Builder agent
 *   node scripts/validate-env.js --skip-agent     — skip Kibana/Agent Builder check
 *
 * The write key (ES_API_KEY) comes from the macOS Keychain, then the ES_API_KEY env var.
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
const http    = require('http');
const https   = require('https');
const { execFileSync } = require('child_process');
const { Client } = require('@elastic/elasticsearch');
const { ROOT, loadEnv, getWriteKey, resolveNames } = require('./lib/config');

// ─── Config ───────────────────────────────────────────────────────────────────

const SKIP_AGENT = process.argv.includes('--skip-agent');

const slugIdx = process.argv.indexOf('--slug');
const SLUG = slugIdx !== -1 && process.argv[slugIdx + 1] ? process.argv[slugIdx + 1] : null;

const WRITE_KEY_HINT = 'store it once with: security add-generic-password -s customizable-search-demo -a ES_API_KEY -w (or export ES_API_KEY)';

// Resolved in main() once .env is loaded; the write key is never read from .env.
let WRITE_KEY = null;
let NAMES = null; // per-demo names when --slug is given

// ─── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function step(msg) { console.log(`\n▶ ${msg}`); }
function ok(msg)   { console.log(`  ✓ ${msg}`); passed++; }
function fail(msg) { console.log(`  ✗ ${msg}`); failed++; }
function info(msg) { console.log(`  · ${msg}`); }
function warn(msg) { console.log(`  ⚠ ${msg}`); } // not counted as a failure

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
    const val = key === 'ES_API_KEY' ? WRITE_KEY : process.env[key];
    if (key === 'ES_API_KEY' && !val) {
      fail(`ES_API_KEY is missing — ${WRITE_KEY_HINT}`);
    } else if (!val) {
      fail(`${key} is missing`);
    } else if (isPlaceholder(val)) {
      fail(`${key} still has a placeholder value`);
    } else {
      ok(`${key} is set`);
    }
  }
  const index = checkedIndex();
  info(`Index = "${index}" (${NAMES ? `slug "${SLUG}"` : process.env.ES_INDEX ? 'ES_INDEX from .env' : 'default ES_INDEX'})`);
}

// Index to check: the slug's resolved index, or the base ES_INDEX without --slug.
function checkedIndex() {
  return NAMES ? NAMES.indexName : (process.env.ES_INDEX || 'demo-products');
}

// ─── Check 2: write key ───────────────────────────────────────────────────────

async function checkWriteKey() {
  step('Checking write API key (ES_API_KEY)...');

  const url = process.env.ES_URL;
  const key = WRITE_KEY;
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
    if (major < 9 || (major === 9 && minor < 5)) {
      fail(`ES ${clusterInfo.version.number} detected. This project requires ES 9.5+`);
    }
  } catch (e) {
    fail(`Connection failed: ${esError(e)}`);
    return;
  }

  // Check if the index already exists (informational only)
  const index = checkedIndex();
  try {
    const exists = await client.indices.exists({ index });
    if (exists) {
      info(`Index "${index}" already exists — setup has been run previously`);
    } else {
      info(`Index "${index}" not found — run "pnpm run setup -- --slug <name>" after this check passes`);
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
  const index = checkedIndex();
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
    info('Skipping KIBANA_URL and agent validation');
    return;
  }

  step('Checking Kibana reachability (KIBANA_URL)...');

  const kibanaUrl = process.env.KIBANA_URL;
  const kibanaKey = WRITE_KEY;

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

  // The agent id is per demo, so it can only be checked with --slug
  if (!NAMES) {
    info('No --slug: skipping agent check');
    return;
  }
  const agentId = NAMES.agentId;

  step(`Checking Agent Builder agent (${agentId})...`);

  const kibanaReadKey = process.env.KIBANA_API_KEY;
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
          fail(`Agent not found: ${agentId} — run pnpm run setup -- --slug ${SLUG}`);
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
  const key = WRITE_KEY;
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

// ─── Check 6: Jina Omni inference endpoint ────────────────────────────────────

async function checkJinaOmni() {
  step('Checking Jina Omni inference endpoint (JINA_OMNI_INFERENCE_ID)...');

  const omniId = process.env.JINA_OMNI_INFERENCE_ID;
  if (!omniId || isPlaceholder(omniId)) {
    info('JINA_OMNI_INFERENCE_ID not set — required only for DAM Media mode');
    info('Set this var before running: pnpm run setup -- --slug <dam-slug>');
    return;
  }

  const url = process.env.ES_URL;
  const key = WRITE_KEY;
  if (isPlaceholder(url) || isPlaceholder(key)) {
    info('Skipping endpoint check — ES_URL or ES_API_KEY not valid');
    return;
  }

  const client = new Client({ node: url, auth: { apiKey: key } });

  try {
    await client.inference.get({ inference_id: omniId });
    ok(`Jina Omni endpoint found: ${omniId}`);
  } catch (e) {
    if (e?.meta?.statusCode === 404) {
      fail(`Jina Omni endpoint not found: ${omniId}`);
      info('Verify the endpoint ID in Kibana: Search → Inference Endpoints');
    } else {
      info(`Could not verify Jina Omni endpoint: ${esError(e)}`);
    }
  }
}

// ─── Pre-commit guard (warning only) ─────────────────────────────────────────

function checkHooksPath() {
  let hooksPath = '';
  try {
    hooksPath = execFileSync('git', ['config', 'core.hooksPath'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch (_) { /* unset or not a git checkout */ }
  if (hooksPath !== '.githooks') {
    warn('Pre-commit secret guard is not enabled (git core.hooksPath is not .githooks). Fix: pnpm run hooks');
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════');
  console.log('  Elastic Search Demo — .env Validator');
  console.log('══════════════════════════════════════════');

  if (!fs.existsSync(path.join(ROOT, '.env'))) {
    console.log('\n✗ ERROR: .env file not found.');
    console.log('  Copy .env.template to .env and fill in your credentials.\n');
    process.exit(1);
  }
  loadEnv();
  info('.env loaded');
  checkHooksPath();

  WRITE_KEY = getWriteKey();
  if (SLUG) {
    try {
      NAMES = resolveNames(SLUG, process.env.ES_INDEX);
    } catch (e) {
      console.log(`\n✗ ERROR: ${e.message}\n`);
      process.exit(1);
    }
    info(`Slug: ${SLUG} (index ${NAMES.indexName}, agent ${NAMES.agentId})`);
  }

  checkEnvVars();
  await checkWriteKey();
  await checkReadKey();
  await checkKibana();
  await checkJinaReranker();
  await checkJinaOmni();

  console.log('\n──────────────────────────────────────────');
  if (failed === 0) {
    console.log(`  ✓ All ${passed} checks passed — ready to run "pnpm run setup"\n`);
    process.exit(0);
  } else {
    console.log(`  ${passed} passed, ${failed} failed — fix the issues above before running "pnpm run setup"\n`);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('\n✗ Unexpected error:', e.message);
  process.exit(1);
});
