#!/usr/bin/env node

/**
 * import.js
 * Indexes the Met Museum open access collection into Elasticsearch.
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

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  loadEnv();
  const esUrl    = requireEnv('ES_URL');
  const esApiKey = requireEnv('ES_API_KEY');

  const client = new Client({ node: esUrl, auth: { apiKey: esApiKey } });

  log('Met Museum open access import');
  log(`Index: ${INDEX_NAME}`);
  log(`Mode: ${RESET ? 'reset' : RESUME ? 'resume' : 'normal'}`);
}

main().catch(err => fatal(err.message));
