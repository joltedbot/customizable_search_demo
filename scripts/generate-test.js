#!/usr/bin/env node
/**
 * generate-test.js
 * Copies the template to output/test/demo.html and writes output/test/config.js
 * (gitignored, holds the .env credentials) for testing ES integration.
 */

const fs = require('fs');
const path = require('path');
const { ROOT, loadEnv } = require('./lib/config');
const { buildConfigJs } = require('./inject-credentials');

let env;
try {
  env = loadEnv();
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

const index = env.ES_INDEX || 'demo-products';

const templatePath = path.join(ROOT, 'template', 'index.html');
const outDir = path.join(ROOT, 'output', 'test');
fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(templatePath, path.join(outDir, 'demo.html'));

const configPath = path.join(outDir, 'config.js');
fs.writeFileSync(configPath, buildConfigJs(env, { index, agentId: '' }), { mode: 0o600 });
fs.chmodSync(configPath, 0o600);

console.log(`\n✓ Generated: output/test/demo.html and output/test/config.js`);
console.log(`  ES_URL:   ${env.ES_URL}`);
console.log(`  ES_INDEX: ${index}`);
console.log(`\n  Run: pnpm dev`);
console.log(`  Open: http://localhost:3000/test/demo.html\n`);
