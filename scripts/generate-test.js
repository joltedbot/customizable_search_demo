#!/usr/bin/env node
/**
 * generate-test.js
 * Copies the template to output/test/demo.html and writes output/test/config.js
 * (gitignored, holds the .env credentials) for testing ES integration. Index and
 * agent id come from output/<slug>/demo.config.json, written by setup.
 *
 * Usage: node scripts/generate-test.js --slug <name>
 */

const fs = require('fs');
const path = require('path');
const { ROOT, loadEnv, parseSlug, readDemoConfig, resolveNames } = require('./lib/config');
const { writeConfigFile } = require('./inject-credentials');

const args = process.argv.slice(2);
let slug = null;
try {
  slug = parseSlug(args);
} catch (_) { /* reported below with usage */ }
if (!slug) {
  console.error('ERROR: --slug <name> is required (the demo whose index and agent the test page uses)');
  console.error('  Usage: pnpm run generate-test -- --slug <name>');
  process.exit(1);
}

const env = process.env; // loadEnv fills it from .env without overriding shell exports
let names;
try {
  loadEnv();
  if (!readDemoConfig(slug)) {
    throw new Error(`output/${slug}/demo.config.json not found. Run setup first: pnpm run setup -- --slug ${slug}`);
  }
  names = resolveNames(slug, env.ES_INDEX);
} catch (err) {
  console.error(`ERROR: ${err.message}`); process.exit(1);
}

const required = ['ES_URL', 'ES_API_KEY_READONLY'];
for (const key of required) {
  if (!env[key] || env[key].startsWith('your_')) {
    console.error(`ERROR: ${key} is not set in .env`); process.exit(1);
  }
}
if (!env.KIBANA_API_KEY) {
  console.warn('WARNING: KIBANA_API_KEY not set in .env — Agent Builder (GenAI mode) will return 403. See README for how to create this key.');
}

const templatePath = path.join(ROOT, 'template', 'index.html');
const outDir = path.join(ROOT, 'output', 'test');
fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(templatePath, path.join(outDir, 'demo.html'));

writeConfigFile(path.join(outDir, 'config.js'), env, { index: names.indexName, agentId: names.agentId });

console.log(`\n✓ Generated: output/test/demo.html and output/test/config.js`);
console.log(`  ES_URL:   ${env.ES_URL}`);
console.log(`  index:    ${names.indexName} (slug: ${slug})`);
console.log(`  agentId:  ${names.agentId}`);
console.log(`\n  Run: pnpm dev`);
console.log(`  Open: http://localhost:3000/test/demo.html\n`);
