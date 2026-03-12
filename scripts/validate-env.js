#!/usr/bin/env node

/**
 * validate-env.js
 * Pre-flight check: validates that .env credentials are correctly configured
 * before running `npm run setup`.
 *
 * Usage:
 *   node scripts/validate-env.js                 — full check including inference
 *   node scripts/validate-env.js --skip-inference — skip inference endpoint check
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
const http    = require('http');
const https   = require('https');
const { Client } = require('@elastic/elasticsearch');

// ─── Config ───────────────────────────────────────────────────────────────────

const SKIP_INFERENCE = process.argv.includes('--skip-inference');

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
  const required = ['ES_URL', 'ES_API_KEY', 'ES_API_KEY_READONLY', 'ES_INFERENCE_URL', 'ES_INFERENCE_API_KEY'];
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

  try {
    await client.info();
    ok('Read-only key accepted by cluster');
  } catch (e) {
    fail(`Connection failed with read-only key: ${esError(e)}`);
    return;
  }

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

// ─── Check 4: inference endpoint ─────────────────────────────────────────────

async function checkInference() {
  if (SKIP_INFERENCE) {
    step('Inference endpoint check skipped (--skip-inference)');
    info('Skipping ES_INFERENCE_URL and ES_INFERENCE_API_KEY validation');
    return;
  }

  step('Checking inference endpoint (ES_INFERENCE_URL)...');

  const inferenceUrl = process.env.ES_INFERENCE_URL;
  const inferenceKey = process.env.ES_INFERENCE_API_KEY;

  if (isPlaceholder(inferenceUrl) || isPlaceholder(inferenceKey)) {
    fail('Skipping — ES_INFERENCE_URL or ES_INFERENCE_API_KEY not valid');
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(inferenceUrl);
  } catch {
    fail(`ES_INFERENCE_URL is not a valid URL: ${inferenceUrl}`);
    return;
  }

  const body = JSON.stringify({ input: 'Hello. Reply with one word: ready' });

  await new Promise((resolve) => {
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + (parsedUrl.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `ApiKey ${inferenceKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const transport = parsedUrl.protocol === 'https:' ? https : http;

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          ok('Inference endpoint responded (200 OK)');
          try {
            const parsed = JSON.parse(data);
            const result = parsed?.completion?.[0]?.result;
            if (result) info(`Sample response: "${result.trim().slice(0, 80)}"`);
          } catch { /* non-JSON body is fine */ }
        } else if (res.statusCode === 401) {
          fail('Inference key is invalid or expired (401 Unauthorized)');
        } else if (res.statusCode === 404) {
          fail('Inference endpoint not found (404) — check the path in ES_INFERENCE_URL');
        } else {
          fail(`Inference endpoint returned ${res.statusCode}: ${data.slice(0, 200)}`);
        }
        resolve();
      });
    });

    req.on('error', (e) => {
      fail(`Could not reach inference endpoint: ${e.message}`);
      resolve();
    });

    req.setTimeout(15000, () => {
      fail('Inference endpoint timed out after 15s');
      req.destroy();
      resolve();
    });

    req.write(body);
    req.end();
  });
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
  await checkInference();

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
