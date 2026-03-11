#!/usr/bin/env node
/**
 * generate-test.js
 * Injects .env credentials into the template and writes output/test/demo.html
 * with V2_ENABLED = true. For testing Stage 3 ES integration only.
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

const templatePath = path.join(__dirname, '..', 'template', 'index.html');
let html = fs.readFileSync(templatePath, 'utf8');

// Replace credential tokens
html = html.replace('{{ES_URL}}',                  env.ES_URL);
html = html.replace('{{ES_API_KEY_READONLY}}',     env.ES_API_KEY_READONLY);
html = html.replace('{{ES_INDEX}}',                env.ES_INDEX || 'demo-products');
html = html.replace('{{ES_INFERENCE_URL}}',       env.ES_INFERENCE_URL || '');
html = html.replace('{{ES_INFERENCE_API_KEY}}',   env.ES_INFERENCE_API_KEY || '');
html = html.replace('{{V2_ENABLED}}',              'true');

const outDir = path.join(__dirname, '..', 'output', 'test');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'demo.html');
fs.writeFileSync(outPath, html, 'utf8');

console.log(`\n✓ Generated: output/test/demo.html`);
console.log(`  ES_URL:   ${env.ES_URL}`);
console.log(`  ES_INDEX: ${env.ES_INDEX}`);
console.log(`  V2_ENABLED: true`);
console.log(`\n  Run: npm run dev`);
console.log(`  Open: http://localhost:3000/test/demo.html\n`);
