#!/usr/bin/env node
/**
 * inject-credentials.js
 * Injects .env credentials into a customer demo HTML file.
 * Run after `pnpm run setup -- --slug <name>` writes AGENT_ID to .env.
 *
 * Usage: node scripts/inject-credentials.js --slug <name>
 */

const fs = require('fs');
const path = require('path');

// Parse --slug argument
const args = process.argv.slice(2);
const slugIdx = args.indexOf('--slug');
const slug = slugIdx !== -1 && args[slugIdx + 1] ? args[slugIdx + 1] : null;

if (!slug) {
  console.error('ERROR: --slug <name> is required');
  console.error('  Usage: node scripts/inject-credentials.js --slug cpkc');
  process.exit(1);
}

// Load .env
const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.error('ERROR: .env not found — copy .env.template to .env and fill in credentials');
  process.exit(1);
}
const env = {};
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const t = line.trim();
  if (!t || t.startsWith('#')) return;
  const eq = t.indexOf('=');
  if (eq === -1) return;
  env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
});

// Validate required values
const required = ['ES_URL', 'ES_API_KEY_READONLY', 'ES_INDEX', 'KIBANA_URL', 'AGENT_ID'];
const missing = required.filter(k => !env[k] || env[k].startsWith('your_'));
if (missing.length) {
  console.error(`ERROR: Missing or placeholder values in .env: ${missing.join(', ')}`);
  process.exit(1);
}
if (!env.KIBANA_API_KEY) {
  console.warn('WARNING: KIBANA_API_KEY not set — Agent Builder (GenAI mode) will return 403.');
  console.warn('  See README for how to create this key, then re-run inject.');
}

// Load the customer demo HTML
const demoPath = path.join(__dirname, '..', 'output', slug, 'demo.html');
if (!fs.existsSync(demoPath)) {
  console.error(`ERROR: Demo file not found: output/${slug}/demo.html`);
  console.error('  Run the AI agent to generate the demo first, then run setup, then inject.');
  process.exit(1);
}

let html = fs.readFileSync(demoPath, 'utf8');

html = html.replaceAll('{{ES_URL}}',             env.ES_URL);
html = html.replaceAll('{{ES_API_KEY_READONLY}}', env.ES_API_KEY_READONLY);
html = html.replaceAll('{{ES_INDEX}}',           env.ES_INDEX);
html = html.replaceAll('{{KIBANA_URL}}',         env.KIBANA_URL);
html = html.replaceAll('{{KIBANA_API_KEY}}',     env.KIBANA_API_KEY || '');
html = html.replaceAll('{{AGENT_ID}}',           env.AGENT_ID);

fs.writeFileSync(demoPath, html, 'utf8');

const remaining = (html.match(/\{\{[A-Z_]+\}\}/g) || []);
if (remaining.length) {
  const display = [...new Set(remaining)].map(t => /KEY|SECRET|TOKEN|PASSWORD/i.test(t) ? '{{[credential]}}' : t);
  console.warn(`WARNING: ${remaining.length} unreplaced token(s): ${display.join(', ')}`);
}

console.log(`\n✓ Credentials injected into output/${slug}/demo.html`);
console.log(`  ES_URL:          ${env.ES_URL}`);
console.log(`  ES_INDEX:        ${env.ES_INDEX}-${slug}`);
console.log(`  KIBANA_URL:      ${env.KIBANA_URL}`);
console.log(`  AGENT_ID:        ${env.AGENT_ID}`);
console.log(`  KIBANA_API_KEY:  ${env.KIBANA_API_KEY ? 'set' : 'NOT SET — GenAI mode will fail'}`);
console.log(`\n  Run: pnpm dev`);
console.log(`  Open: http://localhost:3000/${slug}/demo.html\n`);
