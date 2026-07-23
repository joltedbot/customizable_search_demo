#!/usr/bin/env node
/**
 * generate-test.js
 * Injects .env credentials into the template and writes output/test/demo.html
 * for testing ES integration.
 */

const fs = require('fs');
const path = require('path');

// Load .env
const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.error('ERROR: .env not found'); process.exit(1);
}
const env = {};
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const t = line.trim();
  if (!t || t.startsWith('#')) return;
  const eq = t.indexOf('=');
  if (eq === -1) return;
  env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
});

const required = ['ES_URL', 'ES_API_KEY_READONLY', 'ES_INDEX'];
for (const key of required) {
  if (!env[key] || env[key].startsWith('your_')) {
    console.error(`ERROR: ${key} is not set in .env`); process.exit(1);
  }
}
if (!env.KIBANA_API_KEY) {
  console.warn('WARNING: KIBANA_API_KEY not set in .env — Agent Builder (GenAI mode) will return 403. See README for how to create this key.');
}

const templatePath = path.join(__dirname, '..', 'template', 'index.html');
let html = fs.readFileSync(templatePath, 'utf8');

// Replace credential tokens (replaceAll handles tokens that appear multiple times, e.g. in CSP)
html = html.replaceAll('{{ES_URL}}',             env.ES_URL);
html = html.replaceAll('{{ES_API_KEY_READONLY}}', env.ES_API_KEY_READONLY);
html = html.replaceAll('{{ES_INDEX}}',           env.ES_INDEX || 'demo-products');
html = html.replaceAll('{{KIBANA_URL}}',         env.KIBANA_URL || '');
html = html.replaceAll('{{KIBANA_API_KEY}}',     env.KIBANA_API_KEY || '');
html = html.replaceAll('{{AGENT_ID}}',           env.AGENT_ID || '');
const outDir = path.join(__dirname, '..', 'output', 'test');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'demo.html');
fs.writeFileSync(outPath, html, 'utf8');

console.log(`\n✓ Generated: output/test/demo.html`);
console.log(`  ES_URL:   ${env.ES_URL}`);
console.log(`  ES_INDEX: ${env.ES_INDEX}`);
console.log(`\n  Run: npm run dev`);
console.log(`  Open: http://localhost:3000/test/demo.html\n`);
