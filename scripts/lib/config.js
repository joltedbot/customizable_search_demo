/**
 * lib/config.js
 * Shared config helpers for scripts/: .env loading, write-key lookup (Keychain,
 * then env var), and per-demo names stored in output/<slug>/demo.config.json.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// CSD_ROOT lets offline checks point the lib at a temp directory.
const ROOT = process.env.CSD_ROOT || path.join(__dirname, '..', '..');

const KEYCHAIN_SERVICE = 'customizable-search-demo';
const WRITE_KEY_NAME = 'ES_API_KEY';

// ─── .env loader (no dotenv dependency) ──────────────────────────────────────

function loadEnv({ required = true } = {}) {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) {
    if (required) {
      throw new Error('.env file not found. Copy .env.template to .env and fill in your credentials.');
    }
    return {};
  }
  const parsed = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!key || !val) continue;
    // The write key lives in the Keychain / process env, never in .env.
    if (key === WRITE_KEY_NAME) {
      console.error(`Warning: ${WRITE_KEY_NAME} in .env is ignored; store it in the macOS Keychain or export it as an environment variable.`);
      continue;
    }
    parsed[key] = val;
    if (!process.env[key]) process.env[key] = val;
  }
  return parsed;
}

// ─── Write key ───────────────────────────────────────────────────────────────

function getWriteKey() {
  if (process.platform === 'darwin') {
    try {
      const out = execFileSync(
        'security',
        ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', WRITE_KEY_NAME, '-w'],
        { stdio: ['ignore', 'pipe', 'ignore'] }
      ).toString().trim();
      if (out) return out;
    } catch (_) { /* no entry or no Keychain access — fall through */ }
  }
  return process.env[WRITE_KEY_NAME] || null;
}

// ─── Names ───────────────────────────────────────────────────────────────────

// DAM (digital asset management) slugs share identical behaviour: media_content
// semantic field, no persona index. Add new DAM slugs here.
const DAM_SLUGS = new Set(['terentia', 'museum']);
function isDamSlug(slug) { return DAM_SLUGS.has(slug); }

// DAM slugs avoid retail wording ("shopping", "product") in Kibana-visible IDs.
function deriveNames(slug, esIndexBase = 'demo-products') {
  if (!slug) throw new Error('deriveNames: slug is required');
  assertSlug(slug);
  const dam = isDamSlug(slug);
  return {
    indexName: `${esIndexBase}-${slug}`,
    personaIndex: `demo-personas-${slug}`,
    toolId: dam ? `demo-collection-search-${slug}` : `demo-product-search-${slug}`,
    agentId: dam ? `demo-search-assistant-${slug}` : `demo-shopping-assistant-${slug}`,
  };
}

const NAME_FIELDS = ['indexName', 'personaIndex', 'toolId', 'agentId'];

// Slugs become directory names and index/id suffixes, so keep them path-safe.
function assertSlug(slug) {
  if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error(`invalid slug ${JSON.stringify(slug)}: use lowercase letters, digits and '-'`);
  }
}

function demoDir(slug) {
  assertSlug(slug);
  return path.join(ROOT, 'output', slug);
}
function demoConfigPath(slug) { return path.join(demoDir(slug), 'demo.config.json'); }

function readDemoConfig(slug) {
  const p = demoConfigPath(slug);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    throw new Error(`Invalid JSON in ${p}: ${err.message}`);
  }
}

function writeDemoConfig(slug, obj) {
  const p = demoConfigPath(slug);
  fs.mkdirSync(demoDir(slug), { recursive: true });
  const merged = { ...(readDemoConfig(slug) || {}), ...obj };
  fs.writeFileSync(p, JSON.stringify(merged, null, 2) + '\n', { mode: 0o600 });
  fs.chmodSync(p, 0o600); // mode above is ignored when the file already exists
  return merged;
}

function resolveNames(slug, esIndexBase) {
  const names = deriveNames(slug, esIndexBase);
  const cfg = readDemoConfig(slug);
  if (cfg) {
    for (const f of NAME_FIELDS) {
      if (typeof cfg[f] === 'string' && cfg[f]) names[f] = cfg[f];
    }
  }
  return names;
}

// ─── Cross-demo safety ───────────────────────────────────────────────────────

function knownSlugs() {
  const slugs = new Set(DAM_SLUGS);
  const outDir = path.join(ROOT, 'output');
  if (fs.existsSync(outDir)) {
    for (const e of fs.readdirSync(outDir, { withFileTypes: true })) {
      if (e.isDirectory() && e.name !== 'test') slugs.add(e.name);
    }
  }
  return [...slugs].sort();
}

// True if `tokens` contains `slugTokens` as a contiguous run.
function hasTokenRun(tokens, slugTokens) {
  for (let i = 0; i + slugTokens.length <= tokens.length; i++) {
    if (slugTokens.every((t, j) => tokens[i + j] === t)) return true;
  }
  return false;
}

function foreignSlugRefs(slug, names) {
  const refs = [];
  const own = String(slug).split('-');
  const others = knownSlugs().filter(s => s !== slug);
  for (const field of NAME_FIELDS) {
    const value = names && names[field];
    if (typeof value !== 'string') continue;
    const tokens = value.split('-');
    const hasOwn = hasTokenRun(tokens, own);
    for (const otherSlug of others) {
      const otherTokens = otherSlug.split('-');
      // A value carrying the own slug (best-buy-canada) legitimately contains a shorter
      // slug nested in it (best-buy); the reverse direction still flags.
      if (hasOwn && hasTokenRun(own, otherTokens)) continue;
      if (hasTokenRun(tokens, otherTokens)) refs.push({ field, value, otherSlug });
    }
  }
  return refs;
}

module.exports = {
  ROOT,
  loadEnv,
  getWriteKey,
  DAM_SLUGS,
  isDamSlug,
  deriveNames,
  demoDir,
  demoConfigPath,
  readDemoConfig,
  writeDemoConfig,
  resolveNames,
  knownSlugs,
  foreignSlugRefs,
};
