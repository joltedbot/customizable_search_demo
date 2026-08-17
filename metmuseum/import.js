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

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  loadEnv();
  const esUrl    = requireEnv('ES_URL');
  const esApiKey = requireEnv('ES_API_KEY');

  const client = new Client({ node: esUrl, auth: { apiKey: esApiKey } });

  log('Met Museum open access import');
  log(`Index: ${INDEX_NAME}`);
  log(`Mode: ${RESET ? 'reset' : RESUME ? 'resume' : 'normal'}`);

  await ensureIndex(client, RESET);
}

main().catch(err => fatal(err.message));
